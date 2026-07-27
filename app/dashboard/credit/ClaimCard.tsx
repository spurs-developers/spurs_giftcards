"use client";

import { useState, useTransition } from "react";
import { Ticket, Loader2, Check } from "lucide-react";
import { claimAction } from "../actions";

/** Redeem a Spurs gift card code into the credit balance. */
export default function ClaimCard() {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const go = () =>
    start(async () => {
      setMsg(null);
      const res = await claimAction(code);
      if (res.ok) {
        setMsg({ ok: true, text: `${res.amount} added to your Spurs credit.` });
        setCode("");
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });

  return (
    <div className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="bg-gold-soft text-gold grid size-8 place-items-center rounded-lg">
          <Ticket className="size-4" />
        </span>
        Redeem a card
      </h2>
      <p className="text-muted mt-1.5 text-sm">
        Got a Spurs gift card code? Add it to your balance.
      </p>

      <input value={code} placeholder="SPRS-XXXX-XXXX-XXXX-XXXX"
        onChange={(e) => { setMsg(null); setCode(e.target.value.toUpperCase()); }}
        className="field code mt-4" />

      <button onClick={go} disabled={pending || code.length < 8}
        className="btn-brand mt-3 w-full justify-center py-3">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {pending ? "Checking…" : "Add to my balance"}
      </button>

      {msg && (
        <p className={`mt-2.5 text-sm ${msg.ok ? "text-cash" : "text-red-500"}`}>{msg.text}</p>
      )}
    </div>
  );
}
