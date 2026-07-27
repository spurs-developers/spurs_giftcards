import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeInternal } from "@/lib/api/internal-guard";
import { getBalance, grant, spend, refund, format } from "@/lib/credit";

export const dynamic = "force-dynamic";

/**
 * Spurs credit, for the rest of the platform.
 *
 * This is how any Spurs app lets someone pay with gift card credit at checkout:
 * read the balance, then spend against an order reference. Spending is
 * idempotent on that reference, so a retried checkout can't double-charge.
 *
 * There is no "withdraw" or "convert to cash" action here, and there must never
 * be one — see AGENT.md rule 2.
 */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("balance"), user: z.string().min(1) }),
  z.object({
    action: z.literal("spend"),
    user: z.string().min(1),
    amount: z.number().int().positive(),
    app: z.string().min(1),
    orderRef: z.string().min(1),
    description: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("refund"),
    user: z.string().min(1),
    amount: z.number().int().positive(),
    orderRef: z.string().min(1),
    description: z.string().max(200).optional(),
  }),
  // Granting credit is how Spurs Earn converts points, and how any future
  // promo tool would issue it. Idempotent on relatedRef.
  z.object({
    action: z.literal("grant"),
    user: z.string().min(1),
    amount: z.number().int().positive(),
    source: z.enum(["survey_points", "purchase", "adjustment"]),
    relatedRef: z.string().min(1),
    description: z.string().max(200).optional(),
  }),
]);

export async function POST(req: Request) {
  const auth = authorizeInternal(req);
  if (!auth.ok) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  try {
    switch (body.action) {
      case "balance": {
        const balance = await getBalance(body.user);
        return NextResponse.json({
          user: body.user,
          balance: balance.toString(),
          display: format(balance),
          currency: "NGN",
        });
      }

      case "spend": {
        const { entry, balance } = await spend(body.user, BigInt(body.amount), body.app, {
          orderRef: body.orderRef,
          description: body.description,
        });
        return NextResponse.json({
          ok: true,
          reference: entry.reference,
          spent: body.amount,
          balance: balance.toString(),
          display: format(balance),
        });
      }

      case "refund": {
        const entry = await refund(body.user, BigInt(body.amount), body.orderRef, body.description);
        return NextResponse.json({ ok: true, reference: entry?.reference ?? null });
      }

      case "grant": {
        const entry = await grant(body.user, BigInt(body.amount), body.source, {
          relatedRef: body.relatedRef,
          description: body.description,
        });
        const balance = await getBalance(body.user);
        return NextResponse.json({
          ok: true,
          reference: entry?.reference ?? null,
          balance: balance.toString(),
          display: format(balance),
        });
      }
    }
  } catch (e) {
    // Insufficient credit and validation failures are the caller's problem → 400.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 400 });
  }
}
