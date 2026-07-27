"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { buyWithWallet } from "@/lib/orders";
import { submitTrade } from "@/lib/trades";
import { claim } from "@/lib/codes";
import { grant, format } from "@/lib/credit";
import { quote } from "@/lib/rates";
import { getBrand } from "@/lib/rates";

const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * Buy Spurs gift cards, paying from the wallet balance.
 * The codes come back once and are never retrievable again.
 */
export async function buyAction(input: {
  productId: string;
  quantity?: number;
  customMinor?: string;
  recipientEmail?: string;
  recipientName?: string;
  message?: string;
}) {
  const user = await requireUser();
  try {
    const { order, codes } = await buyWithWallet({
      userId: user.sub,
      productId: input.productId,
      quantity: input.quantity,
      customMinor: input.customMinor ? BigInt(input.customMinor) : undefined,
      recipientEmail: input.recipientEmail || null,
      recipientName: input.recipientName || null,
      message: input.message || null,
      buyerName: user.name ?? null,
    });
    revalidatePath("/dashboard/cards");
    revalidatePath("/dashboard");
    return {
      ok: true as const,
      reference: order.reference,
      total: format(BigInt(order.totalMinor)),
      codes: codes.map((c) => ({ code: c.code, face: format(BigInt(c.record.faceMinor)) })),
    };
  } catch (e) {
    return { ok: false as const, error: err(e) };
  }
}

/** Live quote for the sell flow. Always returns BOTH payout options. */
export async function quoteAction(brandSlug: string, faceValue: number) {
  await requireUser();
  try {
    const brand = await getBrand(brandSlug);
    if (!brand) return { ok: false as const, error: "We're not buying that card right now" };

    const q = await quote(brand.id, faceValue);
    return {
      ok: true as const,
      cash: format(q.cashMinor),
      credit: format(q.creditMinor),
      bonus: format(q.bonusMinor),
      bonusPct: q.bonusPct,
      faceCurrency: q.rate.faceCurrency,
    };
  } catch (e) {
    return { ok: false as const, error: err(e) };
  }
}

/** Sell a third-party card. Nothing is paid until verification clears. */
export async function sellAction(input: {
  brandSlug: string;
  faceValue: number;
  payoutType: "cash" | "credit";
  cardCode?: string;
  imageRefs?: string[];
}) {
  const user = await requireUser();
  try {
    const trade = await submitTrade({ userId: user.sub, ...input });
    revalidatePath("/dashboard/trades");
    return { ok: true as const, reference: trade.reference, status: trade.status };
  } catch (e) {
    return { ok: false as const, error: err(e) };
  }
}

/** Redeem a Spurs gift card code into your credit balance. */
export async function claimAction(code: string) {
  const user = await requireUser();
  try {
    const { card, amountMinor } = await claim(code, user.sub);
    await grant(user.sub, amountMinor, "card_redeem", {
      relatedRef: card.id,
      description: "Redeemed a Spurs gift card",
    });
    revalidatePath("/dashboard/credit");
    revalidatePath("/dashboard/cards");
    return { ok: true as const, amount: format(amountMinor) };
  } catch (e) {
    return { ok: false as const, error: err(e) };
  }
}
