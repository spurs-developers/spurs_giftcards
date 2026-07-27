import Link from "next/link";
import { Receipt, ArrowRight, Sparkles, Banknote } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getShellData } from "@/lib/shell";
import { listForUser } from "@/lib/trades";
import { format } from "@/lib/credit";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

const when = (d: Date) =>
  new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Plain language for each state — people are waiting on money here. */
const STATUS: Record<string, { label: string; chip: string; note: string }> = {
  submitted:    { label: "Received",   chip: "chip-brand", note: "We've got it and we're starting checks." },
  checking:     { label: "Checking",   chip: "chip-brand", note: "Running our automated checks now." },
  needs_review: { label: "In review",  chip: "chip-gold",  note: "A person is taking a look. This is normal." },
  approved:     { label: "Approved",   chip: "chip-cash",  note: "Verified — your payout is on its way." },
  paid:         { label: "Paid",       chip: "chip-cash",  note: "" },
  rejected:     { label: "Declined",   chip: "bg-red-500/10 text-red-500", note: "" },
};

export default async function Trades() {
  const user = await requireUser();
  const [shell, rows] = await Promise.all([getShellData(user.sub), listForUser(user.sub)]);

  return (
    <Shell data={shell} current="trades" title="My sales" user={{ name: user.name, email: user.email }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My sales</h1>
        <p className="text-muted mt-1 text-sm">Cards you've sold us, and where each one is up to.</p>
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand mx-auto grid size-14 place-items-center rounded-2xl">
            <Receipt className="size-6" />
          </span>
          <p className="mt-4 font-semibold">You haven't sold a card yet</p>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            We buy Amazon, Steam, iTunes and more — and pay extra if you take Spurs credit.
          </p>
          <Link href="/dashboard/sell" className="btn-brand mt-5 justify-center px-6 py-3">
            Sell a card <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="card divide-line divide-y">
          {rows.map(({ trade, brand }) => {
            const s = STATUS[trade.status] ?? { label: trade.status, chip: "", note: "" };
            const amount = trade.status === "paid" ? trade.payoutMinor : trade.quotedMinor;
            return (
              <div key={trade.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold">
                  {brand.name.slice(0, 2).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {brand.name} · {trade.faceValue} {trade.faceCurrency}
                  </p>
                  <p className="text-faint text-xs">{when(trade.createdAt)} · {trade.reference}</p>
                  {trade.status === "rejected" && trade.rejectionReason && (
                    <p className="mt-0.5 text-xs text-red-500">{trade.rejectionReason}</p>
                  )}
                  {s.note && <p className="text-muted mt-0.5 text-xs">{s.note}</p>}
                </div>

                <div className="shrink-0 text-right">
                  <p className={`text-sm font-semibold tabular-nums ${trade.status === "paid" ? "text-cash" : ""}`}>
                    {format(BigInt(amount))}
                  </p>
                  <p className="text-faint inline-flex items-center gap-1 text-[11px]">
                    {trade.payoutType === "credit"
                      ? <><Sparkles className="size-3" /> credit</>
                      : <><Banknote className="size-3" /> cash</>}
                  </p>
                </div>

                <span className={`chip shrink-0 ${s.chip}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
