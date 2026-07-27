import Link from "next/link";
import { Ticket, ArrowRight, Gift } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getShellData } from "@/lib/shell";
import { listForUser } from "@/lib/codes";
import { format } from "@/lib/credit";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

const when = (d: Date) =>
  new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

const STATUS: Record<string, { label: string; chip: string }> = {
  active:   { label: "Unused",    chip: "chip-gold" },
  redeemed: { label: "Redeemed",  chip: "chip-cash" },
  expired:  { label: "Expired",   chip: "" },
  void:     { label: "Cancelled", chip: "bg-red-500/10 text-red-500" },
};

export default async function Cards() {
  const user = await requireUser();
  const [shell, cards] = await Promise.all([getShellData(user.sub), listForUser(user.sub)]);

  return (
    <Shell data={shell} current="cards" title="My cards" user={{ name: user.name, email: user.email }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My cards</h1>
        <p className="text-muted mt-1 text-sm">
          Cards you've bought or redeemed. Codes are only ever shown at purchase, so they aren't listed here.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand mx-auto grid size-14 place-items-center rounded-2xl">
            <Ticket className="size-6" />
          </span>
          <p className="mt-4 font-semibold">No cards yet</p>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            Buy one for yourself or send it to someone.
          </p>
          <Link href="/dashboard" className="btn-brand mt-5 justify-center px-6 py-3">
            Browse the store <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const s = STATUS[c.status] ?? { label: c.status, chip: "" };
            const spent = c.status !== "active";
            return (
              <div key={c.id} className={`card p-5 ${spent ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="bg-gold-soft text-gold grid size-10 place-items-center rounded-xl">
                    <Gift className="size-5" />
                  </span>
                  <span className={`chip ${s.chip}`}>{s.label}</span>
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  {format(BigInt(c.status === "active" ? c.balanceMinor : c.faceMinor))}
                </p>
                <p className="code text-faint mt-1 text-xs">•••• {c.last4}</p>
                <p className="text-muted mt-2 text-xs">
                  Bought {when(c.createdAt)}
                  {c.expiresAt ? ` · expires ${when(c.expiresAt)}` : ""}
                </p>
                {c.status === "active" && BigInt(c.balanceMinor) < BigInt(c.faceMinor) && (
                  <p className="text-faint mt-1 text-xs">
                    Part-spent from {format(BigInt(c.faceMinor))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
