import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, codes, orders, products, type Code } from "@/lib/db";

/**
 * Issuing and redeeming Spurs gift card codes.
 *
 * The plaintext code is shown to the buyer exactly once and never stored — we
 * keep a peppered HMAC and the last four characters. A leaked database
 * therefore yields no spendable cards, and lookup is still a single indexed
 * read because the hash is deterministic.
 *
 * Cards carry a running balance rather than a redeemed/unredeemed flag, so a
 * ₦10,000 card can pay for a ₦3,000 basket and keep ₦7,000.
 */

const PEPPER = process.env.GIFTCARD_CODE_PEPPER ?? "";

/** Unambiguous alphabet: no O/0, I/1, so codes survive being read aloud. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function rawCode(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i % 4 === 3 && i !== 15) out += "-";
  }
  return "SPRS-" + out; // SPRS-XXXX-XXXX-XXXX-XXXX
}

export const normalise = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

export function hashCode(code: string): string {
  if (!PEPPER) throw new Error("GIFTCARD_CODE_PEPPER is not set");
  return createHmac("sha256", PEPPER).update(normalise(code)).digest("hex");
}

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export interface IssuedCode {
  /** Shown to the buyer once. Never persisted, never logged. */
  code: string;
  record: Code;
}

/**
 * Mint the codes for a paid order. Idempotent on the order: calling it twice
 * returns nothing the second time rather than minting free money.
 */
export async function issueForOrder(orderId: string): Promise<IssuedCode[]> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  if (order.status !== "paid") throw new Error("This order hasn't been paid for");

  const existing = await db.select().from(codes).where(eq(codes.orderId, orderId));
  if (existing.length) return [];   // already fulfilled

  const [product] = order.productId
    ? await db.select().from(products).where(eq(products.id, order.productId)).limit(1)
    : [undefined];

  const expiresAt = product?.validityDays
    ? new Date(Date.now() + product.validityDays * 86_400_000)
    : null;

  const issued: IssuedCode[] = [];
  for (let i = 0; i < order.quantity; i++) {
    const code = rawCode();
    const [record] = await db.insert(codes).values({
      orderId: order.id,
      productId: order.productId,
      codeHash: hashCode(code),
      last4: code.slice(-4),
      faceMinor: order.unitMinor,
      balanceMinor: order.unitMinor,
      currency: order.currency,
      issuedTo: order.userId,
      expiresAt,
    }).returning();
    issued.push({ code, record });
  }

  await db.update(orders)
    .set({ status: "fulfilled", fulfilledAt: new Date() })
    .where(eq(orders.id, orderId));

  return issued;
}

export interface LookupResult {
  ok: boolean;
  reason?: string;
  card?: Code;
}

/** Look a code up without spending it — used by the "check balance" screen. */
export async function lookup(code: string): Promise<LookupResult> {
  const input = normalise(code);
  if (input.length < 8) return { ok: false, reason: "That doesn't look like a Spurs gift card code" };

  const [card] = await db.select().from(codes)
    .where(eq(codes.codeHash, hashCode(input))).limit(1);

  // Same message either way: a distinct "no such card" reply would let someone
  // enumerate valid codes.
  if (!card || !safeEqual(card.codeHash, hashCode(input))) {
    return { ok: false, reason: "We couldn't find that card. Check the code and try again." };
  }
  if (card.status === "void") return { ok: false, reason: "This card has been cancelled", card };
  if (card.status === "expired" || (card.expiresAt && card.expiresAt < new Date())) {
    return { ok: false, reason: "This card has expired", card };
  }
  if (BigInt(card.balanceMinor) <= 0n) return { ok: false, reason: "This card has already been used", card };

  return { ok: true, card };
}

/**
 * Claim a card into an account. The balance moves to the user's Spurs credit,
 * which is where it can actually be spent across the platform.
 */
export async function claim(code: string, userId: string): Promise<{ card: Code; amountMinor: bigint }> {
  const found = await lookup(code);
  if (!found.ok || !found.card) throw new Error(found.reason ?? "That card can't be claimed");

  const amount = BigInt(found.card.balanceMinor);

  // Zero the card first: if crediting fails afterwards we'd rather investigate
  // a stuck claim than have handed out the value twice.
  const [updated] = await db.update(codes)
    .set({
      balanceMinor: "0",
      status: "redeemed",
      claimedBy: userId,
      claimedAt: new Date(),
    })
    .where(and(eq(codes.id, found.card.id), eq(codes.balanceMinor, found.card.balanceMinor)))
    .returning();

  if (!updated) throw new Error("That card was just used somewhere else");

  return { card: updated, amountMinor: amount };
}

/** Cards a user bought or claimed. */
export async function listForUser(userId: string) {
  return db.select().from(codes)
    .where(sql`${codes.issuedTo} = ${userId} or ${codes.claimedBy} = ${userId}`)
    .orderBy(desc(codes.createdAt))
    .limit(100);
}

/** Cancel an unspent card (support/admin). Spent cards are left alone. */
export async function voidCode(id: string, reason: string): Promise<Code> {
  const [card] = await db.update(codes)
    .set({ status: "void", voidReason: reason })
    .where(and(eq(codes.id, id), eq(codes.status, "active")))
    .returning();
  if (!card) throw new Error("That card is already used or cancelled");
  return card;
}
