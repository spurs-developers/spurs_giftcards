import { Wallet, ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getShellData } from "@/lib/shell";
import { getBalance, listEntries, format } from "@/lib/credit";
import Shell from "@/components/Shell";
import ClaimCard from "./ClaimCard";

export const dynamic = "force-dynamic";

const when = (d: Date) =>
  new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SOURCE_LABEL: Record<string, string> = {
  card_redeem: "Gift card redeemed",
  trade_payout: "Card sale",
  survey_points: "Points from Spurs Earn",
  purchase: "Credit purchase",
  refund: "Refund",
  adjustment: "Adjustment",
  spend: "Spent",
};

export default async function Credit() {
  const user = await requireUser();
  const [shell, balance, entries] = await Promise.all([
    getShellData(user.sub),
    getBalance(user.sub),
    listEntries(user.sub, 50),
  ]);

  const earned = entries.filter((e) => BigInt(e.delta) > 0n)
    .reduce((s, e) => s + BigInt(e.delta), 0n);
  const spent = entries.filter((e) => BigInt(e.delta) < 0n)
    .reduce((s, e) => s - BigInt(e.delta), 0n);

  return (
    <Shell data={shell} current="credit" title="Spurs credit" user={{ name: user.name, email: user.email }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Spurs credit</h1>
        <p className="text-muted mt-1 text-sm">Your balance, and everything that's gone in and out.</p>
      </div>

      <div className="giftface mb-4 p-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/70">Available credit</p>
            <p className="mt-1.5 text-4xl font-semibold tabular-nums">{format(balance)}</p>
            <p className="mt-1.5 text-sm text-white/75">Spend it anywhere across Spurs</p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15">
            <Wallet className="size-5" />
          </span>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <ArrowDownLeft className="text-cash size-4" />
          <p className="text-muted mt-2.5 text-xs">Added, all time</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{format(earned)}</p>
        </div>
        <div className="card p-5">
          <ArrowUpRight className="text-faint size-4" />
          <p className="text-muted mt-2.5 text-xs">Spent, all time</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{format(spent)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ClaimCard />

        <div className="card p-5">
          <h2 className="font-semibold">Activity</h2>
          {entries.length === 0 ? (
            <p className="text-faint py-10 text-center text-sm">
              Nothing yet — redeem a card or sell one to get started.
            </p>
          ) : (
            <ul className="divide-line mt-2 divide-y">
              {entries.slice(0, 14).map((e) => {
                const delta = BigInt(e.delta);
                const up = delta > 0n;
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${
                      up ? "bg-cash-soft text-cash" : "bg-brand-soft text-brand"
                    }`}>
                      {up ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {e.description ?? SOURCE_LABEL[e.source] ?? e.source.replace(/_/g, " ")}
                      </div>
                      <div className="text-faint text-xs">
                        {when(e.createdAt)}{e.app ? ` · ${e.app}` : ""}
                      </div>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${up ? "text-cash" : "text-muted"}`}>
                      {up ? "+" : "−"}{format(up ? delta : -delta)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="card mt-4 flex items-start gap-3 p-5">
        <Info className="text-faint mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold">About Spurs credit</h3>
          <p className="text-muted mt-1 text-sm leading-relaxed">
            Credit is stored value for use inside Spurs — pay with it anywhere across the platform, in
            full or part. It isn't cash and can't be withdrawn or transferred, which is exactly why we
            can pay more for it than we pay in naira.
          </p>
        </div>
      </div>
    </Shell>
  );
}
