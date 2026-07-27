// Spurs Gift Cards — issuing and trading, on the shared Neon instance.
//
// Two halves of one business:
//   Issuing — Spurs' own stored-value cards, redeemable only inside Spurs.
//   Trading — buying third-party cards (Amazon, Steam, …) from users for naira.
//
// They connect on purpose: someone selling a third-party card can take a bonus
// rate if they accept Spurs credit instead of cash. That funnels outside
// liquidity into the closed loop, and it's the reason both live in one schema.
//
// Money is always exact integer minor units (kobo), never floats.
import {
  pgSchema, text, uuid, integer, boolean, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// Shared user table (owned by baas). Identity is never owned by this app.
const spurs = pgSchema("spurs");
export const spursUsers = spurs.table("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
});

export const giftcards = pgSchema("giftcards");

/* ---------------------------------------------------------------- issuing */

/** The catalogue of Spurs-issued cards. Denominations are fixed SKUs. */
export const products = giftcards.table(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Face value in minor units. Null means the buyer names the amount. */
    denominationMinor: text("denomination_minor"),
    currency: text("currency").notNull().default("NGN"),
    /** Bounds for custom-amount products. */
    minMinor: text("min_minor"),
    maxMinor: text("max_minor"),
    artwork: text("artwork"),                                 // theme key for the card face
    active: boolean("active").notNull().default(true),
    isCorporateBulk: boolean("is_corporate_bulk").notNull().default(false),
    /** How long an issued code stays valid. Null = no expiry. */
    validityDays: integer("validity_days"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("products_sku_idx").on(t.sku), index("products_active_idx").on(t.active)],
);

/**
 * A purchase of Spurs cards. Codes are only minted once the order is paid —
 * an unpaid order must never yield a spendable code.
 */
export const orders = giftcards.table(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    userId: text("user_id").notNull().references(() => spursUsers.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    quantity: integer("quantity").notNull().default(1),
    unitMinor: text("unit_minor").notNull(),
    totalMinor: text("total_minor").notNull(),
    currency: text("currency").notNull().default("NGN"),
    /** pending | paid | fulfilled | failed | cancelled */
    status: text("status").notNull().default("pending"),
    /** wallet | pay — how the buyer paid us. */
    paidWith: text("paid_with"),
    paymentRef: text("payment_ref"),
    /** Gifting: who it's for, and the note on the card. */
    recipientEmail: text("recipient_email"),
    recipientName: text("recipient_name"),
    message: text("message"),
    isBulk: boolean("is_bulk").notNull().default(false),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_reference_idx").on(t.reference),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
  ],
);

/**
 * An issued card. The code itself is never stored — only a peppered hash, plus
 * the last four characters so a user can tell their cards apart. Cards carry a
 * running balance so they can be spent across several purchases.
 */
export const codes = giftcards.table(
  "codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id),
    codeHash: text("code_hash").notNull(),
    last4: text("last4").notNull(),
    faceMinor: text("face_minor").notNull(),
    balanceMinor: text("balance_minor").notNull(),
    currency: text("currency").notNull().default("NGN"),
    /** active | redeemed | expired | void */
    status: text("status").notNull().default("active"),
    /** Who bought it, and who claimed it (they differ when it's a gift). */
    issuedTo: text("issued_to").references(() => spursUsers.id, { onDelete: "set null" }),
    claimedBy: text("claimed_by").references(() => spursUsers.id, { onDelete: "set null" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("codes_hash_idx").on(t.codeHash),
    index("codes_issued_idx").on(t.issuedTo),
    index("codes_status_idx").on(t.status),
  ],
);

/* ----------------------------------------------------------- closed loop */

/**
 * Spurs credit — closed-loop stored value.
 *
 * Deliberately NOT an asset in Spurs Wallet. Wallet assets are withdrawable and
 * convertible; this must never be either. Keeping it in its own ledger means
 * there is no code path, present or future, that can turn credit back into
 * cash. See AGENT.md rule 2 — that boundary is regulatory, not stylistic.
 */
export const creditLedger = giftcards.table(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => spursUsers.id, { onDelete: "cascade" }),
    delta: text("delta").notNull(),                  // + top-up, - spend (minor units)
    balanceAfter: text("balance_after").notNull(),
    currency: text("currency").notNull().default("NGN"),
    /** card_redeem | trade_payout | survey_points | refund | adjustment | spend */
    source: text("source").notNull(),
    reference: text("reference").notNull(),
    relatedRef: text("related_ref"),
    /** Which Spurs app the credit was spent in — for breakage reporting. */
    app: text("app"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("credit_reference_idx").on(t.reference),
    index("credit_user_idx").on(t.userId),
    index("credit_app_idx").on(t.app),
  ],
);

/* ---------------------------------------------------------------- trading */

/** A third-party brand we buy cards for. */
export const brands = giftcards.table(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Card variants we treat differently on price, e.g. "USA physical". */
    notes: text("notes"),
    logo: text("logo"),
    /** Can we check this brand programmatically, or is it review-only? */
    autoVerify: boolean("auto_verify").notNull().default(false),
    active: boolean("active").notNull().default(true),
    /** What we need from the user: code | image | both */
    requires: text("requires").notNull().default("both"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("brands_slug_idx").on(t.slug), index("brands_active_idx").on(t.active)],
);

/**
 * What we pay for a brand, per unit of face value.
 *
 * Rates are data, never code (AGENT.md rule 3). Rows are versioned rather than
 * updated so an old trade can always be explained by the rate that applied when
 * it was made.
 */
export const rates = giftcards.table(
  "rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    variant: text("variant").notNull().default("default"),
    faceCurrency: text("face_currency").notNull().default("USD"),
    /** Naira (minor units) paid per 1 unit of face value, e.g. per $1. */
    buyMinorPerUnit: text("buy_minor_per_unit").notNull(),
    /** Extra % paid when the seller takes Spurs credit instead of cash. */
    creditBonusPct: integer("credit_bonus_pct").notNull().default(8),
    minFace: integer("min_face").notNull().default(5),
    maxFace: integer("max_face").notNull().default(500),
    active: boolean("active").notNull().default(true),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("rates_brand_idx").on(t.brandId, t.active)],
);

/**
 * A user selling us a third-party card.
 *
 * Status is the whole story, and it only moves forward:
 *   submitted → checking → (approved | needs_review) → paid | rejected
 * Nothing pays out before it reaches `approved` (AGENT.md rule 1).
 */
export const trades = giftcards.table(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    userId: text("user_id").notNull().references(() => spursUsers.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    rateId: uuid("rate_id").references(() => rates.id),
    variant: text("variant").notNull().default("default"),
    /** Face value in whole units of faceCurrency, e.g. 100 for a $100 card. */
    faceValue: integer("face_value").notNull(),
    faceCurrency: text("face_currency").notNull().default("USD"),
    /** The card itself. Encrypted at rest; images are opaque handles. */
    cardCodeEncrypted: text("card_code_encrypted"),
    /**
     * Deterministic hash of the same code. The ciphertext can't be compared —
     * AES-GCM uses a random IV, so one plaintext has infinitely many
     * ciphertexts — and spotting the same card submitted twice is the single
     * strongest fraud signal we have.
     */
    cardCodeHash: text("card_code_hash"),
    imageRefs: jsonb("image_refs").$type<string[]>().default([]).notNull(),
    /** cash | credit — chosen by the seller before we settle. */
    payoutType: text("payout_type").notNull().default("cash"),
    /** Quoted at submission from the rate above; what we actually pay. */
    quotedMinor: text("quoted_minor").notNull().default("0"),
    payoutMinor: text("payout_minor").notNull().default("0"),
    status: text("status").notNull().default("submitted"),
    /** Everything the automated check saw, kept for disputes. */
    verification: jsonb("verification").$type<Record<string, unknown>>().default({}).notNull(),
    riskScore: integer("risk_score").notNull().default(0),
    reviewedBy: text("reviewed_by"),
    rejectionReason: text("rejection_reason"),
    payoutRef: text("payout_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("trades_reference_idx").on(t.reference),
    index("trades_user_idx").on(t.userId),
    index("trades_status_idx").on(t.status),
    index("trades_code_hash_idx").on(t.cardCodeHash),
  ],
);

/**
 * Background work — verification checks and payouts.
 *
 * A table rather than Redis/BullMQ: this platform has no Redis, and Pay's
 * webhook retries and Earn's payout release already use exactly this pattern.
 * Claimed with SKIP LOCKED so several processors can run without collisions.
 */
export const jobs = giftcards.table(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),                    // verify_trade | settle_trade | fulfil_order
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    /** queued | running | done | failed */
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_due_idx").on(t.status, t.runAt)],
);

/**
 * Every spend of Spurs credit, wherever it happened. The credit ledger records
 * the movement; this records the commercial event, which is what breakage and
 * revenue reporting actually need.
 */
export const redemptions = giftcards.table(
  "redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => spursUsers.id, { onDelete: "cascade" }),
    /** Which Spurs app spent it: pay | store | survey | … */
    app: text("app").notNull(),
    amountMinor: text("amount_minor").notNull(),
    currency: text("currency").notNull().default("NGN"),
    reference: text("reference").notNull(),
    orderRef: text("order_ref"),
    /** credit | code — spent from the balance, or a code redeemed at checkout. */
    kind: text("kind").notNull().default("credit"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("redemptions_reference_idx").on(t.reference),
    index("redemptions_app_idx").on(t.app),
    index("redemptions_user_idx").on(t.userId),
  ],
);

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Code = typeof codes.$inferSelect;
export type CreditEntry = typeof creditLedger.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Rate = typeof rates.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
