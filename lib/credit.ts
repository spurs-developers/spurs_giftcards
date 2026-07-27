import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, creditLedger, redemptions, type CreditEntry } from "@/lib/db";

/**
 * Spurs credit — closed-loop stored value.
 *
 * ── The one rule that governs this file ──────────────────────────────────────
 * Credit goes IN and gets SPENT inside Spurs. There is no function here that
 * turns credit back into cash, and none may be added: that would take this from
 * closed-loop stored value into e-money, which carries entirely different
 * regulatory obligations. See AGENT.md rule 2. If a feature seems to need it,
 * it needs a legal decision first, not a code change.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The ledger is immutable and append-only, so a balance is always the sum of
 * its history — the same discipline as the wallet and points ledgers.
 */

const ref = (p: string) => p + "_" + randomBytes(10).toString("hex");

/** Where credit is allowed to come from. Cash-out is deliberately absent. */
export type CreditSource =
  | "card_redeem"     // claimed a Spurs gift card
  | "trade_payout"    // sold a third-party card and took the bonus rate
  | "survey_points"   // converted Spurs Earn points
  | "purchase"        // bought credit directly
  | "refund"
  | "adjustment";     // support correction

export async function getBalance(userId: string): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${creditLedger.delta}::numeric), 0)::text` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return BigInt(row?.total ?? "0");
}

export async function listEntries(userId: string, limit = 50): Promise<CreditEntry[]> {
  return db.select().from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}

/** Post an entry atomically, recomputing the running balance inside the tx. */
async function post(
  userId: string,
  delta: bigint,
  opts: { source: string; reference?: string; relatedRef?: string; app?: string; description?: string },
): Promise<CreditEntry> {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ total: sql<string>`coalesce(sum(${creditLedger.delta}::numeric), 0)::text` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId));

    const balanceAfter = BigInt(cur?.total ?? "0") + delta;
    if (balanceAfter < 0n) throw new Error("Not enough Spurs credit");

    const [entry] = await tx.insert(creditLedger).values({
      userId,
      delta: delta.toString(),
      balanceAfter: balanceAfter.toString(),
      source: opts.source,
      reference: opts.reference ?? ref("gcr"),
      relatedRef: opts.relatedRef ?? null,
      app: opts.app ?? null,
      description: opts.description ?? null,
    }).returning();
    return entry;
  });
}

/**
 * Add credit. Idempotent when `relatedRef` is given: the same source event can
 * be replayed (a retried webhook, a re-run job) without paying twice.
 */
export async function grant(
  userId: string,
  amountMinor: bigint,
  source: CreditSource,
  opts: { relatedRef?: string; description?: string } = {},
): Promise<CreditEntry | null> {
  if (amountMinor <= 0n) return null;

  if (opts.relatedRef) {
    const [existing] = await db.select().from(creditLedger)
      .where(and(
        eq(creditLedger.relatedRef, opts.relatedRef),
        eq(creditLedger.source, source),
      ))
      .limit(1);
    if (existing) return existing;
  }

  return post(userId, amountMinor, { source, ...opts });
}

/**
 * Spend credit inside a Spurs app. Records both the ledger movement and the
 * commercial event, because breakage reporting needs to know *where* it went.
 * Idempotent on `orderRef` so a retried checkout can't double-charge.
 */
export async function spend(
  userId: string,
  amountMinor: bigint,
  app: string,
  opts: { orderRef: string; description?: string },
): Promise<{ entry: CreditEntry; balance: bigint }> {
  if (amountMinor <= 0n) throw new Error("Enter an amount to spend");

  const [existing] = await db.select().from(redemptions)
    .where(and(eq(redemptions.orderRef, opts.orderRef), eq(redemptions.app, app)))
    .limit(1);
  if (existing) {
    const [entry] = await db.select().from(creditLedger)
      .where(eq(creditLedger.reference, existing.reference)).limit(1);
    return { entry, balance: await getBalance(userId) };
  }

  const reference = ref("gcs");
  const entry = await post(userId, -amountMinor, {
    source: "spend", reference, app,
    relatedRef: opts.orderRef,
    description: opts.description ?? `Spent in Spurs ${app}`,
  });

  await db.insert(redemptions).values({
    userId, app, amountMinor: amountMinor.toString(),
    reference, orderRef: opts.orderRef, kind: "credit",
    description: opts.description ?? null,
  }).onConflictDoNothing();

  return { entry, balance: await getBalance(userId) };
}

/** Give credit back — a cancelled order, a support fix. Still never cash. */
export async function refund(
  userId: string,
  amountMinor: bigint,
  orderRef: string,
  description?: string,
): Promise<CreditEntry | null> {
  return grant(userId, amountMinor, "refund", {
    relatedRef: "refund:" + orderRef,
    description: description ?? "Refunded to your Spurs credit",
  });
}

export const format = (minor: bigint | string, currency = "NGN") => {
  const n = BigInt(minor);
  const neg = n < 0n;
  const abs = (neg ? -n : n).toString().padStart(3, "0");
  const whole = abs.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = currency === "NGN" ? "₦" : "";
  return `${neg ? "-" : ""}${symbol}${whole}.${abs.slice(-2)}`;
};
