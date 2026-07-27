import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, brands, trades, rates, type Trade, type Brand } from "@/lib/db";
import { quote } from "@/lib/rates";
import { grant } from "@/lib/credit";
import { enqueue } from "@/lib/queue";
import { creditWallet } from "@/lib/wallet-client";

/**
 * Buying third-party gift cards from users.
 *
 * The status machine only moves forward, and payout hangs off exactly one
 * transition:
 *
 *   submitted → checking → approved  → paid
 *                        ↘ needs_review → approved → paid
 *                        ↘ rejected
 *
 * Nothing settles until a trade reaches `approved` (AGENT.md rule 1). The
 * automated check can approve, but it can only ever *fail into* review — it
 * cannot reject on its own, because a false negative here costs a real person
 * a real card.
 */

const KEY = scryptSync(process.env.GIFTCARD_CODE_PEPPER ?? "dev", "giftcard-trade", 32);
const ref = (p: string) => p + "_" + randomBytes(10).toString("hex");

/** Card codes are worth money — never store them in the clear. */
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

/**
 * Deterministic fingerprint of a card code, so the same card submitted twice is
 * detectable. The ciphertext above can't do this job — AES-GCM randomises the
 * IV, so identical plaintext produces different ciphertext every time.
 */
function fingerprint(code: string): string {
  return createHmac("sha256", process.env.GIFTCARD_CODE_PEPPER ?? "dev")
    .update(code.trim().toUpperCase().replace(/[\s-]/g, ""))
    .digest("hex");
}

/** Only ever called from the admin review screen, and always audited there. */
export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
}

export interface SubmitInput {
  userId: string;
  brandSlug: string;
  faceValue: number;
  variant?: string;
  /** cash to the wallet, or credit at the bonus rate. */
  payoutType: "cash" | "credit";
  cardCode?: string;
  imageRefs?: string[];
}

export async function submitTrade(input: SubmitInput): Promise<Trade> {
  const [brand] = await db.select().from(brands)
    .where(and(eq(brands.slug, input.brandSlug), eq(brands.active, true))).limit(1);
  if (!brand) throw new Error("We're not buying that card right now");

  if (brand.requires !== "image" && !input.cardCode?.trim()) {
    throw new Error("Enter the card code");
  }
  if (brand.requires !== "code" && !(input.imageRefs ?? []).length) {
    throw new Error("Upload a photo of the card");
  }

  const q = await quote(brand.id, input.faceValue, input.variant);
  const payoutMinor = input.payoutType === "credit" ? q.creditMinor : q.cashMinor;

  const [trade] = await db.insert(trades).values({
    reference: ref("gct"),
    userId: input.userId,
    brandId: brand.id,
    rateId: q.rate.id,
    variant: input.variant ?? "default",
    faceValue: input.faceValue,
    faceCurrency: q.rate.faceCurrency,
    cardCodeEncrypted: input.cardCode ? encrypt(input.cardCode.trim()) : null,
    cardCodeHash: input.cardCode ? fingerprint(input.cardCode) : null,
    imageRefs: input.imageRefs ?? [],
    payoutType: input.payoutType,
    quotedMinor: payoutMinor.toString(),
    status: "submitted",
  }).returning();

  await enqueue("verify_trade", { tradeId: trade.id });
  return trade;
}

/* ----------------------------------------------------------- verification */

export interface CheckResult {
  passed: boolean;
  score: number;
  signals: string[];
  detail: Record<string, unknown>;
}

/**
 * Automated pre-screen.
 *
 * This is NOT a brand API integration — no brand here exposes one to us yet.
 * It's a risk screen over the things we can actually see: the shape of the
 * code, how much this account has sold recently, and whether the same card has
 * been submitted before. Anything it can't clear goes to a human.
 *
 * When a real brand-balance API is wired up, it plugs in here and can *raise*
 * confidence to auto-approve — it must never be allowed to auto-reject.
 */
export async function runCheck(trade: Trade, brand: Brand): Promise<CheckResult> {
  const signals: string[] = [];
  let score = 0;

  // Duplicate submission of the same code — the clearest fraud signal we have.
  // Matched on the deterministic hash, never the ciphertext.
  if (trade.cardCodeHash) {
    const [dup] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trades)
      .where(and(
        eq(trades.cardCodeHash, trade.cardCodeHash),
        sql`${trades.id} <> ${trade.id}`,
      ));
    if (Number(dup.count) > 0) {
      score += 60;
      signals.push("duplicate_code");
    }
  }

  // Velocity: a genuine seller doesn't file ten cards in an hour.
  const hourAgo = new Date(Date.now() - 3_600_000);
  const [burst] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trades)
    .where(and(eq(trades.userId, trade.userId), gte(trades.createdAt, hourAgo)));
  if (Number(burst.count) >= 5) {
    score += 25;
    signals.push("submission_velocity");
  }

  // First-time seller going straight for a high-value card.
  const [history] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trades)
    .where(and(eq(trades.userId, trade.userId), eq(trades.status, "paid")));
  if (Number(history.count) === 0 && trade.faceValue >= 100) {
    score += 20;
    signals.push("first_trade_high_value");
  }

  // Code shape — a wrong-looking code is usually a typo, but sometimes not.
  if (trade.cardCodeEncrypted) {
    try {
      const code = decrypt(trade.cardCodeEncrypted).replace(/[\s-]/g, "");
      if (code.length < 8) { score += 30; signals.push("code_too_short"); }
      if (/^(.)\1+$/.test(code)) { score += 50; signals.push("code_not_plausible"); }
    } catch {
      score += 40;
      signals.push("code_unreadable");
    }
  }

  // Only brands we've explicitly marked as auto-verifiable can skip review,
  // and only when nothing at all looked wrong.
  const passed = brand.autoVerify && score === 0;

  return {
    passed,
    score,
    signals,
    detail: { checkedAt: new Date().toISOString(), autoVerify: brand.autoVerify, faceValue: trade.faceValue },
  };
}

/** The `verify_trade` job. Approves clean cards; routes everything else to review. */
export async function verifyTrade(tradeId: string): Promise<void> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  if (!trade || trade.status !== "submitted") return;

  await db.update(trades).set({ status: "checking" }).where(eq(trades.id, tradeId));

  const [brand] = await db.select().from(brands).where(eq(brands.id, trade.brandId)).limit(1);
  const result = await runCheck(trade, brand);

  if (result.passed) {
    await db.update(trades).set({
      status: "approved",
      verification: { ...result.detail, signals: result.signals, auto: true },
      riskScore: result.score,
      verifiedAt: new Date(),
      reviewedBy: "auto",
    }).where(eq(trades.id, tradeId));

    await enqueue("settle_trade", { tradeId });
    return;
  }

  await db.update(trades).set({
    status: "needs_review",
    verification: { ...result.detail, signals: result.signals, auto: false },
    riskScore: result.score,
  }).where(eq(trades.id, tradeId));
}

/* -------------------------------------------------------------- decisions */

/** A human approves. This is the only door to settlement other than a clean auto-check. */
export async function approveTrade(tradeId: string, reviewer: string): Promise<Trade> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  if (!trade) throw new Error("Trade not found");
  if (!["needs_review", "checking", "submitted"].includes(trade.status)) {
    throw new Error(`This trade is already ${trade.status}`);
  }

  const [updated] = await db.update(trades).set({
    status: "approved", reviewedBy: reviewer, verifiedAt: new Date(),
  }).where(eq(trades.id, tradeId)).returning();

  await enqueue("settle_trade", { tradeId });
  return updated;
}

export async function rejectTrade(tradeId: string, reviewer: string, reason: string): Promise<Trade> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  if (!trade) throw new Error("Trade not found");
  if (["paid", "rejected"].includes(trade.status)) throw new Error(`This trade is already ${trade.status}`);

  const [updated] = await db.update(trades).set({
    status: "rejected", reviewedBy: reviewer,
    rejectionReason: reason || "The card could not be verified",
    settledAt: new Date(),
  }).where(eq(trades.id, tradeId)).returning();
  return updated;
}

/**
 * The `settle_trade` job — the only place money moves for a trade.
 *
 * Refuses outright unless the trade is `approved`. Credit payouts stay inside
 * the closed loop; cash payouts go to Spurs Wallet on the same idempotent rail
 * Spurs Earn uses.
 */
export async function settleTrade(tradeId: string): Promise<void> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  if (!trade) return;
  if (trade.status === "paid") return;                       // already settled
  if (trade.status !== "approved") {
    throw new Error(`Refusing to settle a trade in state "${trade.status}"`);
  }

  const amount = BigInt(trade.quotedMinor);

  if (trade.payoutType === "credit") {
    await grant(trade.userId, amount, "trade_payout", {
      relatedRef: trade.id,
      description: `Sold a gift card — ${trade.reference}`,
    });
  } else {
    await creditWallet(trade.userId, amount, trade.reference, "Gift card sale");
  }

  await db.update(trades).set({
    status: "paid",
    payoutMinor: amount.toString(),
    payoutRef: trade.reference,
    settledAt: new Date(),
  }).where(eq(trades.id, tradeId));
}

/* ------------------------------------------------------------------ reads */

export async function listForUser(userId: string, limit = 50) {
  return db.select({ trade: trades, brand: brands })
    .from(trades)
    .innerJoin(brands, eq(brands.id, trades.brandId))
    .where(eq(trades.userId, userId))
    .orderBy(desc(trades.createdAt))
    .limit(limit);
}

/** Everything waiting on a human, riskiest first. */
export async function reviewQueue(limit = 100) {
  return db.select({ trade: trades, brand: brands })
    .from(trades)
    .innerJoin(brands, eq(brands.id, trades.brandId))
    .where(sql`${trades.status} in ('needs_review', 'checking', 'submitted')`)
    .orderBy(desc(trades.riskScore), desc(trades.createdAt))
    .limit(limit);
}

export async function getTrade(id: string) {
  const [row] = await db.select({ trade: trades, brand: brands, rate: rates })
    .from(trades)
    .innerJoin(brands, eq(brands.id, trades.brandId))
    .leftJoin(rates, eq(rates.id, trades.rateId))
    .where(eq(trades.id, id))
    .limit(1);
  return row ?? null;
}
