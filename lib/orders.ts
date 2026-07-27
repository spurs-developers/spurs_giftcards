import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, orders, products, type Order, type Product } from "@/lib/db";
import { debitWallet } from "@/lib/wallet-client";
import { issueForOrder, type IssuedCode } from "@/lib/codes";
import { refund } from "@/lib/credit";
import { sendMail } from "@/lib/mail";

/**
 * Buying Spurs gift cards.
 *
 * Order of operations matters: take the money, mark it paid, then mint. A code
 * is spendable value, so it must not exist before the payment that backs it. If
 * minting somehow fails after payment, the order stays `paid` and unfulfilled —
 * recoverable by re-running the job, and visible in admin — rather than
 * silently handing out an unpaid card.
 */

const ref = () => "gco_" + randomBytes(10).toString("hex");

export async function listProducts(): Promise<Product[]> {
  return db.select().from(products)
    .where(and(eq(products.active, true), eq(products.isCorporateBulk, false)))
    .orderBy(asc(products.sortOrder), asc(products.denominationMinor));
}

export async function getProduct(id: string): Promise<Product | null> {
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return p ?? null;
}

export interface BuyInput {
  userId: string;
  productId: string;
  quantity?: number;
  /** For open-value products, the amount the buyer chose (minor units). */
  customMinor?: bigint;
  recipientEmail?: string | null;
  recipientName?: string | null;
  message?: string | null;
  /** Buyer's name, so a gifted card can say who it's from. */
  buyerName?: string | null;
}

/** Work out the unit price and check it against the product's bounds. */
function priceFor(product: Product, customMinor?: bigint): bigint {
  if (product.denominationMinor) return BigInt(product.denominationMinor);

  if (!customMinor) throw new Error("Choose an amount for this card");
  const min = product.minMinor ? BigInt(product.minMinor) : 100_00n;
  const max = product.maxMinor ? BigInt(product.maxMinor) : 500_000_00n;
  if (customMinor < min) throw new Error(`The smallest amount for this card is ₦${(min / 100n).toLocaleString()}`);
  if (customMinor > max) throw new Error(`The largest amount for this card is ₦${(max / 100n).toLocaleString()}`);
  return customMinor;
}

/**
 * Buy, paying from the Spurs Wallet balance. Returns the codes exactly once —
 * they are never retrievable in plaintext again.
 */
export async function buyWithWallet(input: BuyInput): Promise<{ order: Order; codes: IssuedCode[] }> {
  const product = await getProduct(input.productId);
  if (!product || !product.active) throw new Error("That card isn't available");

  const quantity = Math.max(1, Math.min(input.quantity ?? 1, 50));
  const unit = priceFor(product, input.customMinor);
  const total = unit * BigInt(quantity);

  const [order] = await db.insert(orders).values({
    reference: ref(),
    userId: input.userId,
    productId: product.id,
    quantity,
    unitMinor: unit.toString(),
    totalMinor: total.toString(),
    currency: product.currency,
    status: "pending",
    paidWith: "wallet",
    recipientEmail: input.recipientEmail ?? null,
    recipientName: input.recipientName ?? null,
    message: input.message ?? null,
  }).returning();

  try {
    await debitWallet(input.userId, total, order.reference, `Spurs gift card ×${quantity}`);
  } catch (e) {
    await db.update(orders).set({
      status: "failed",
      failureReason: e instanceof Error ? e.message : "Payment failed",
    }).where(eq(orders.id, order.id));
    throw new Error(e instanceof Error ? e.message : "We couldn't take payment for that");
  }

  const [paid] = await db.update(orders)
    .set({ status: "paid", paidAt: new Date(), paymentRef: order.reference })
    .where(eq(orders.id, order.id))
    .returning();

  const codes = await issueForOrder(paid.id);

  // A gifted card has to reach the person it's for. This is the only moment the
  // code exists in plaintext — we store a hash, never the code — so if it isn't
  // emailed here it can never be emailed at all.
  if (paid.recipientEmail && codes.length) {
    await deliverToRecipient(paid, codes, input.buyerName ?? null);
  }

  return { order: paid, codes };
}

/**
 * Email each issued code to the recipient. Failures are swallowed on purpose:
 * the buyer has paid and already has the codes on screen, so a mail outage must
 * not turn a completed purchase into an error. The attempt is visible in the
 * admin mail log either way.
 */
async function deliverToRecipient(
  order: Order,
  codes: IssuedCode[],
  buyerName: string | null,
): Promise<void> {
  for (const issued of codes) {
    await sendMail({
      template: "giftcard.delivered",
      to: order.recipientEmail!,
      // One card per email, and stable per card, so a retried order can't
      // send the same card twice.
      idempotencyKey: `giftcard:${issued.record.id}`,
      context: {
        recipientName: order.recipientName,
        senderName: buyerName ?? "Someone",
        amount: naira(issued.record.faceMinor),
        code: issued.code,
        message: order.message,
      },
    }).catch(() => {
      // sendMail already swallows; this guards against anything unexpected.
    });
  }
}

const naira = (minor: string) => {
  const digits = BigInt(minor).toString().padStart(3, "0");
  return "₦" + digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + digits.slice(-2);
};

/** The `fulfil_order` job — retry path for an order that was paid but not minted. */
export async function fulfilOrder(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.status !== "paid") return;
  await issueForOrder(orderId);
}

export async function listOrders(userId: string, limit = 50): Promise<Order[]> {
  return db.select().from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

/**
 * Cancel an unfulfilled order and put the money back as credit.
 * Deliberately credit, not cash — see AGENT.md rule 2.
 */
export async function cancelOrder(orderId: string, reason: string): Promise<Order> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  if (order.status === "fulfilled") throw new Error("That order has already been fulfilled");

  if (order.status === "paid") {
    await refund(order.userId, BigInt(order.totalMinor), order.reference, "Cancelled gift card order");
  }

  const [cancelled] = await db.update(orders)
    .set({ status: "cancelled", failureReason: reason })
    .where(eq(orders.id, orderId))
    .returning();
  return cancelled;
}
