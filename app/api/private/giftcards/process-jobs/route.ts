import { NextResponse } from "next/server";
import { authorizeInternal } from "@/lib/api/internal-guard";
import { runJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * Drains the job queue: card verification and trade settlement.
 *
 * Meant to be hit by a scheduler every minute or so. Safe to call as often as
 * you like — jobs are claimed with SKIP LOCKED and every handler is idempotent,
 * so overlapping runs neither collide nor double-pay.
 */
export async function POST(req: Request) {
  const auth = authorizeInternal(req);
  if (!auth.ok) return auth.error;

  try {
    const result = await runJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Processing failed" },
      { status: 500 },
    );
  }
}
