import { Gift, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getShellData } from "@/lib/shell";
import { listProducts } from "@/lib/orders";
import { walletBalance } from "@/lib/wallet-client";
import { format } from "@/lib/credit";
import Shell from "@/components/Shell";
import BuyPanel from "./BuyPanel";

export const dynamic = "force-dynamic";

export default async function Store() {
  const user = await requireUser();
  const [shell, products, wallet] = await Promise.all([
    getShellData(user.sub),
    listProducts(),
    walletBalance(user.sub),
  ]);

  return (
    <Shell data={shell} current="store" title="Gift card store" user={{ name: user.name, email: user.email }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Spurs gift cards</h1>
        <p className="text-muted mt-1 text-sm">
          Buy one for yourself or send it to someone. Spendable across everything Spurs.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand mx-auto grid size-14 place-items-center rounded-2xl">
            <Gift className="size-6" />
          </span>
          <p className="mt-4 font-semibold">The store is being set up</p>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            Card denominations are added from the admin console. Check back shortly.
          </p>
        </div>
      ) : (
        <BuyPanel
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            denominationMinor: p.denominationMinor,
            minMinor: p.minMinor,
            maxMinor: p.maxMinor,
            display: p.denominationMinor ? format(BigInt(p.denominationMinor)) : null,
          }))}
          walletDisplay={format(wallet)}
        />
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-5">
          <Sparkles className="text-gold size-4" />
          <h3 className="mt-2.5 text-sm font-semibold">Never expires unused</h3>
          <p className="text-muted mt-1 text-sm leading-relaxed">
            Part-spend a card and the rest stays on it.
          </p>
        </div>
        <div className="card p-5">
          <ShieldCheck className="text-cash size-4" />
          <h3 className="mt-2.5 text-sm font-semibold">One code, whole platform</h3>
          <p className="text-muted mt-1 text-sm leading-relaxed">
            Redeem once and spend the credit anywhere in Spurs.
          </p>
        </div>
        <Link href="/dashboard/sell" className="card card-hover group flex flex-col p-5">
          <Gift className="text-brand size-4" />
          <h3 className="mt-2.5 text-sm font-semibold">Got a card from elsewhere?</h3>
          <p className="text-muted mt-1 flex-1 text-sm leading-relaxed">
            We buy Amazon, Steam, iTunes and more for naira.
          </p>
          <span className="text-brand mt-3 inline-flex items-center gap-1.5 text-sm font-semibold">
            Sell a card
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </Shell>
  );
}
