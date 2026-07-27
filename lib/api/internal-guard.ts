import { NextResponse } from "next/server";

/**
 * Service-to-service auth. The shared internal secret is the whole boundary
 * here, so a missing secret in the environment must fail closed rather than
 * accidentally waving every caller through.
 */
export function authorizeInternal(req: Request):
  | { ok: true }
  | { ok: false; error: NextResponse } {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return { ok: false, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true };
}
