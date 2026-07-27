import "server-only";

/**
 * Spurs Wallet, over the internal service rail.
 *
 * Cash always lives in Spurs Wallet — this app never keeps a second cash
 * ledger. Both calls are idempotent on the reference, because a retried job
 * must never move money twice.
 */

const BASE = (process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3200").replace(/\/$/, "");

function secret(): string {
  const s = process.env.INTERNAL_API_SECRET;
  if (!s) throw new Error("Wallet is not configured");
  return s;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "x-internal-secret": secret(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Wallet call failed (${res.status})`);
  return json as T;
}

/** Pay a user out in naira. Idempotent on `reference`. */
export async function creditWallet(
  userId: string,
  amountMinor: bigint,
  reference: string,
  description = "Spurs Gift Cards",
): Promise<void> {
  await call("/api/private/wallet/credit", {
    user: userId,
    asset: "NGN",
    amount: Number(amountMinor),
    source: "gift_card",
    reference,
    description,
  });
}

/** Take payment for a gift card order from the buyer's wallet. */
export async function debitWallet(
  userId: string,
  amountMinor: bigint,
  reference: string,
  description = "Spurs gift card",
): Promise<void> {
  await call("/api/private/wallet/debit", {
    user: userId,
    asset: "NGN",
    amount: Number(amountMinor),
    reference,
    description,
  });
}

/** Spendable NGN balance, for the checkout screen. */
export async function walletBalance(userId: string): Promise<bigint> {
  try {
    const res = await fetch(
      `${BASE}/api/private/wallet?user=${encodeURIComponent(userId)}`,
      {
        headers: { "x-internal-secret": secret() },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!res.ok) return 0n;
    const body = await res.json() as { balances?: { asset: string; balance: string }[] };
    return BigInt(body.balances?.find((b) => b.asset === "NGN")?.balance ?? "0");
  } catch {
    return 0n;   // the checkout can still offer other payment routes
  }
}
