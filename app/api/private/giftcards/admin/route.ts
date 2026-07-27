import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeInternal } from "@/lib/api/internal-guard";
import { approveTrade, rejectTrade, getTrade, decrypt } from "@/lib/trades";
import { setRate, upsertBrand } from "@/lib/rates";
import { voidCode } from "@/lib/codes";
import { cancelOrder } from "@/lib/orders";
import { runJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * Admin actions on the gift card business.
 *
 * Reads go straight to the database from the control plane; anything that
 * approves a trade, moves money or changes a rate comes through here, so the
 * rules (no payout before verification, versioned rates) live in one place.
 */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("trade.approve"), id: z.string().uuid(), reviewer: z.string() }),
  z.object({ action: z.literal("trade.reject"), id: z.string().uuid(), reviewer: z.string(), reason: z.string().optional() }),
  // Revealing a card code is a sensitive read — it's the value itself.
  z.object({ action: z.literal("trade.reveal"), id: z.string().uuid(), reviewer: z.string() }),

  z.object({
    action: z.literal("rate.set"),
    brandId: z.string().uuid(),
    variant: z.string().optional(),
    faceCurrency: z.string().optional(),
    buyMinorPerUnit: z.string().regex(/^\d+$/),
    creditBonusPct: z.number().int().min(0).max(50),
    minFace: z.number().int().positive().optional(),
    maxFace: z.number().int().positive().optional(),
    updatedBy: z.string(),
  }),
  z.object({
    action: z.literal("brand.upsert"),
    slug: z.string().min(1),
    name: z.string().min(1),
    notes: z.string().nullish(),
    autoVerify: z.boolean().optional(),
    active: z.boolean().optional(),
    requires: z.enum(["code", "image", "both"]).optional(),
    sortOrder: z.number().int().optional(),
  }),

  z.object({ action: z.literal("code.void"), id: z.string().uuid(), reason: z.string() }),
  z.object({ action: z.literal("order.cancel"), id: z.string().uuid(), reason: z.string() }),
  z.object({ action: z.literal("jobs.run") }),
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
      case "trade.approve":
        return NextResponse.json({ ok: true, trade: await approveTrade(body.id, body.reviewer) });

      case "trade.reject":
        return NextResponse.json({
          ok: true,
          trade: await rejectTrade(body.id, body.reviewer, body.reason ?? ""),
        });

      case "trade.reveal": {
        const row = await getTrade(body.id);
        if (!row) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
        return NextResponse.json({
          ok: true,
          code: row.trade.cardCodeEncrypted ? decrypt(row.trade.cardCodeEncrypted) : null,
          images: row.trade.imageRefs,
        });
      }

      case "rate.set":
        return NextResponse.json({ ok: true, rate: await setRate(body) });

      case "brand.upsert":
        return NextResponse.json({ ok: true, brand: await upsertBrand(body) });

      case "code.void":
        return NextResponse.json({ ok: true, code: await voidCode(body.id, body.reason) });

      case "order.cancel":
        return NextResponse.json({ ok: true, order: await cancelOrder(body.id, body.reason) });

      case "jobs.run":
        return NextResponse.json({ ok: true, ...(await runJobs()) });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 400 });
  }
}
