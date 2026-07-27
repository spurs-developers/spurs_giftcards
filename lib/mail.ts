import "server-only";

/**
 * Platform email.
 *
 * This app holds no SMTP credentials and renders no templates of its own — it
 * posts a template key and a context to the admin control plane, which owns the
 * provider, the house style and the delivery log.
 *
 * Never throws. A purchase must not fail because its confirmation email did.
 */

const BASE = (process.env.SPURS_ADMIN_URL ?? "http://127.0.0.1:3300").replace(/\/$/, "");

export type MailStatus = "sent" | "failed" | "suppressed" | "duplicate" | "disabled";

export async function sendMail(input: {
  template: string;
  to: string;
  context?: Record<string, unknown>;
  /** Pass whenever the caller might retry — sending is idempotent on it. */
  idempotencyKey?: string;
}): Promise<{ ok: boolean; status: MailStatus; error?: string }> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return { ok: false, status: "failed", error: "No internal secret configured" };

  try {
    const res = await fetch(`${BASE}/api/private/mail/send`, {
      method: "POST",
      headers: { "x-internal-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ app: "giftcards", ...input }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: "failed", error: body?.error ?? `Mail service returned ${res.status}` };
    }
    return { ok: Boolean(body?.ok), status: body?.status ?? "failed", error: body?.error };
  } catch (e) {
    return {
      ok: false, status: "failed",
      error: e instanceof Error ? e.message : "Could not reach the mail service",
    };
  }
}
