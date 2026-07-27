"use client";

import { useState, useTransition } from "react";
import { Gift, Loader2, Copy, Check, Wallet, PartyPopper, TriangleAlert } from "lucide-react";
import { buyAction } from "./actions";

interface P {
  id: string;
  name: string;
  description: string | null;
  denominationMinor: string | null;
  minMinor: string | null;
  maxMinor: string | null;
  display: string | null;
}

/** The codes are shown once and never again — make that unmissable. */
function Issued({ codes, total, onDone }: {
  codes: { code: string; face: string }[];
  total: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="card p-6">
      <div className="text-center">
        <span className="bg-gold-soft text-gold mx-auto grid size-14 place-items-center rounded-2xl">
          <PartyPopper className="size-6" />
        </span>
        <h2 className="mt-3.5 text-xl font-semibold tracking-tight">
          {codes.length === 1 ? "Your card is ready" : `${codes.length} cards are ready`}
        </h2>
        <p className="text-muted mt-1 text-sm">You paid {total}.</p>
      </div>

      <div className="mt-5 space-y-3">
        {codes.map((c) => (
          <div key={c.code} className="giftface p-5">
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-white/70">Spurs gift card</p>
                <p className="code mt-1.5 text-lg font-semibold break-all">{c.code}</p>
                <p className="mt-1 text-sm text-white/80">{c.face}</p>
              </div>
              <button onClick={() => copy(c.code)}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur transition hover:bg-white/25"
                aria-label="Copy code">
                {copied === c.code ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-muted text-xs leading-relaxed">
          Save these now — we don't store the codes, so this is the only time they can be shown.
          Anyone with the code can spend it.
        </p>
      </div>

      <button onClick={onDone} className="btn-ghost mt-4 w-full justify-center py-3">Done</button>
    </div>
  );
}

export default function BuyPanel({ products, walletDisplay }: { products: P[]; walletDisplay: string }) {
  const [selected, setSelected] = useState<P>(products[0]);
  const [custom, setCustom] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [gifting, setGifting] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ codes: { code: string; face: string }[]; total: string } | null>(null);

  const isOpenValue = !selected.denominationMinor;
  const qty = Math.max(1, Math.min(Number(quantity) || 1, 50));

  const buy = () =>
    start(async () => {
      setError(null);
      const res = await buyAction({
        productId: selected.id,
        quantity: qty,
        customMinor: isOpenValue ? String(Math.round(Number(custom) * 100)) : undefined,
        recipientEmail: gifting ? recipientEmail : undefined,
        recipientName: gifting ? recipientName : undefined,
        message: gifting ? message : undefined,
      });
      if (res.ok) setIssued({ codes: res.codes, total: res.total });
      else setError(res.error);
    });

  if (issued) {
    return <Issued codes={issued.codes} total={issued.total} onDone={() => { setIssued(null); setCustom(""); }} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="card p-5">
        <h2 className="font-semibold">Choose an amount</h2>

        <div className="mt-3.5 grid gap-2 sm:grid-cols-3">
          {products.map((p) => (
            <button key={p.id} type="button" onClick={() => { setSelected(p); setError(null); }}
              className={`rounded-xl border-[1.5px] p-4 text-left transition-colors ${
                selected.id === p.id ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50"
              }`}>
              <Gift className={`size-4 ${selected.id === p.id ? "text-brand" : "text-faint"}`} />
              <p className="mt-2 font-semibold tabular-nums">{p.display ?? "Any amount"}</p>
              <p className="text-muted mt-0.5 text-xs">{p.name}</p>
            </button>
          ))}
        </div>

        {isOpenValue && (
          <label className="mt-4 block">
            <span className="text-muted mb-1.5 block text-xs font-semibold">Amount (₦)</span>
            <input inputMode="decimal" value={custom} placeholder="e.g. 7500"
              onChange={(e) => { setError(null); setCustom(e.target.value.replace(/[^\d.]/g, "")); }}
              className="field text-lg font-semibold tabular-nums" />
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-muted mb-1.5 block text-xs font-semibold">How many</span>
          <input inputMode="numeric" value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
            className="field tabular-nums" />
        </label>

        <button type="button" onClick={() => setGifting(!gifting)}
          className="text-brand mt-4 text-sm font-semibold">
          {gifting ? "− Just for me" : "+ Send it as a gift"}
        </button>

        {gifting && (
          <div className="mt-3 space-y-3">
            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Their name" className="field" />
            <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Their email" type="email" className="field" />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
              placeholder="Add a short message" className="field resize-y" />
          </div>
        )}
      </div>

      <div className="card h-fit p-5">
        <h2 className="font-semibold">Checkout</h2>

        <dl className="mt-3.5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Card</dt>
            <dd className="font-medium">{selected.display ?? (custom ? "₦" + Number(custom).toLocaleString() : "—")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Quantity</dt>
            <dd className="font-medium tabular-nums">{qty}</dd>
          </div>
        </dl>

        <div className="border-line mt-3 flex items-center gap-2 rounded-xl border p-3">
          <Wallet className="text-faint size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-muted text-xs">Paying from your Spurs Wallet</p>
            <p className="text-sm font-semibold tabular-nums">{walletDisplay} available</p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button onClick={buy} disabled={pending || (isOpenValue && !custom)}
          className="btn-brand mt-4 w-full justify-center py-3">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
          {pending ? "Buying…" : "Buy now"}
        </button>

        <p className="text-faint mt-2.5 text-center text-xs leading-relaxed">
          Codes are shown once, straight after payment.
        </p>
      </div>
    </div>
  );
}
