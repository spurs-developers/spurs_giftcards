"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight, Loader2, Sparkles, Banknote, Check, ShieldCheck, Clock, ArrowRight,
} from "lucide-react";
import { quoteAction, sellAction } from "../actions";

export interface BrandOption {
  slug: string;
  name: string;
  notes: string | null;
  requires: string;
  faceCurrency: string;
  minFace: number;
  maxFace: number;
  bonusPct: number;
}

/**
 * Selling a third-party card.
 *
 * The payout choice is the point of this screen, not a detail on it: cash at
 * the standard rate, or Spurs credit at a visibly better one. Both numbers are
 * always shown together so the trade-off is explicit — never quote one alone.
 */
export default function SellForm({ brands }: { brands: BrandOption[] }) {
  const router = useRouter();
  const [brand, setBrand] = useState<BrandOption>(brands[0]);
  const [face, setFace] = useState("");
  const [payout, setPayout] = useState<"cash" | "credit">("credit");
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [q, setQ] = useState<{ cash: string; credit: string; bonus: string; bonusPct: number } | null>(null);

  // Re-quote as they type. Rates are server-side data, never computed here.
  useEffect(() => {
    const value = Number(face);
    if (!value || !Number.isInteger(value)) { setQ(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await quoteAction(brand.slug, value);
      if (cancelled) return;
      if (res.ok) { setQ(res); setError(null); }
      else { setQ(null); setError(res.error); }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [brand.slug, face]);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await sellAction({
        brandSlug: brand.slug,
        faceValue: Number(face),
        payoutType: payout,
        cardCode: code || undefined,
        // Image upload isn't wired to storage yet; a placeholder handle keeps
        // image-required brands submittable and flags them for manual review.
        imageRefs: brand.requires === "code" ? [] : ["pending-upload"],
      });
      if (res.ok) setDone({ reference: res.reference });
      else setError(res.error);
    });

  if (done) {
    return (
      <div className="card px-6 py-14 text-center">
        <span className="bg-brand-soft text-brand mx-auto grid size-16 place-items-center rounded-2xl">
          <Clock className="size-7" />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">We're checking your card</h2>
        <p className="text-muted mx-auto mt-1.5 max-w-md text-sm leading-relaxed">
          Nothing is paid until it's verified — that's what keeps our rates where they are.
          You'll see the result under My sales.
        </p>
        <p className="text-faint code mt-3 text-xs">{done.reference}</p>
        <button onClick={() => router.push("/dashboard/trades")}
          className="btn-brand mt-5 justify-center px-6 py-3">
          Track it <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="font-semibold">Which card?</h2>
          <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
            {brands.map((b) => (
              <button key={b.slug} type="button"
                onClick={() => { setBrand(b); setError(null); }}
                className={`opt ${brand.slug === b.slug ? "opt-on" : ""}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${
                  brand.slug === b.slug ? "bg-brand text-white" : "bg-brand-soft text-brand"
                }`}>
                  {b.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{b.name}</span>
                  {b.notes && <span className="text-muted block text-xs">{b.notes}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Card details</h2>

          <label className="mt-3.5 block">
            <span className="text-muted mb-1.5 block text-xs font-semibold">
              Face value ({brand.faceCurrency})
            </span>
            <input inputMode="numeric" value={face} placeholder={`${brand.minFace}–${brand.maxFace}`}
              onChange={(e) => setFace(e.target.value.replace(/\D/g, ""))}
              className="field text-lg font-semibold tabular-nums" />
          </label>

          {brand.requires !== "image" && (
            <label className="mt-3.5 block">
              <span className="text-muted mb-1.5 block text-xs font-semibold">Card code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="The code on the back of the card"
                className="field code" />
            </label>
          )}

          {brand.requires !== "code" && (
            <div className="border-line mt-3.5 rounded-xl border border-dashed p-4 text-center">
              <p className="text-muted text-sm">Photo upload is coming shortly.</p>
              <p className="text-faint mt-1 text-xs">
                For now this card goes to a reviewer, who'll ask for the image if it's needed.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The choice — always both options, never one. */}
      <div className="card h-fit p-5">
        <h2 className="font-semibold">How do you want paying?</h2>

        {!q ? (
          <p className="text-muted mt-3 text-sm">Enter the face value to see your offer.</p>
        ) : (
          <div className="mt-3.5 space-y-2">
            <button type="button" onClick={() => setPayout("credit")}
              className={`opt flex-col items-stretch ${payout === "credit" ? "opt-on" : ""}`}>
              <span className="flex items-center gap-2">
                <Sparkles className="text-gold size-4" />
                <span className="text-sm font-semibold">Spurs credit</span>
                <span className="chip chip-gold ml-auto">+{q.bonusPct}%</span>
              </span>
              <span className="mt-1.5 text-2xl font-semibold tabular-nums">{q.credit}</span>
              <span className="text-muted mt-0.5 text-xs">
                {q.bonus} more than cash. Spendable across Spurs.
              </span>
            </button>

            <button type="button" onClick={() => setPayout("cash")}
              className={`opt flex-col items-stretch ${payout === "cash" ? "opt-on" : ""}`}>
              <span className="flex items-center gap-2">
                <Banknote className="text-cash size-4" />
                <span className="text-sm font-semibold">Cash to your wallet</span>
                {payout === "cash" && <Check className="text-brand ml-auto size-4" />}
              </span>
              <span className="mt-1.5 text-2xl font-semibold tabular-nums">{q.cash}</span>
              <span className="text-muted mt-0.5 text-xs">Naira in your Spurs Wallet.</span>
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button onClick={submit} disabled={pending || !q || (brand.requires !== "image" && !code)}
          className="btn-brand mt-4 w-full justify-center py-3">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
          {pending ? "Submitting…" : "Sell this card"}
        </button>

        <div className="border-line text-muted mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            We verify every card before paying. Most clear quickly; anything unusual gets a human look.
          </span>
        </div>
      </div>
    </div>
  );
}
