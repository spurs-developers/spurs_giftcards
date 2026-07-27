"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gift, Store, Wallet, ArrowLeftRight, Receipt, LifeBuoy, Menu, X, ShieldCheck, Ticket,
} from "lucide-react";

export interface NavData {
  creditDisplay: string;
  cards: number;
  openTrades: number;
}

const GROUPS = [
  {
    title: "Buy",
    items: [
      { id: "store", href: "/dashboard", label: "Gift card store", Icon: Store },
      { id: "cards", href: "/dashboard/cards", label: "My cards", Icon: Ticket, badge: "cards" as const },
    ],
  },
  {
    title: "Sell",
    items: [
      { id: "sell", href: "/dashboard/sell", label: "Sell a card", Icon: ArrowLeftRight },
      { id: "trades", href: "/dashboard/trades", label: "My sales", Icon: Receipt, badge: "openTrades" as const },
    ],
  },
  {
    title: "Balance",
    items: [
      { id: "credit", href: "/dashboard/credit", label: "Spurs credit", Icon: Wallet },
    ],
  },
];

function Links({ current, data, onNavigate }: { current: string; data: NavData; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="text-faint mb-1.5 px-3 text-[11px] font-semibold tracking-wide uppercase">{g.title}</p>
          <nav className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const count = "badge" in n && n.badge ? data[n.badge] : 0;
              return (
                <Link key={n.id} href={n.href} onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    current === n.id ? "bg-brand-soft text-brand font-semibold" : "text-muted hover:bg-brand-soft/50 hover:text-ink"
                  }`}>
                  <n.Icon className="size-[18px]" />
                  <span className="flex-1">{n.label}</span>
                  {count > 0 && (
                    <span className="bg-gold-soft text-gold rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}

/** Balance card, pinned low — credit is the thing people come back to check. */
function CreditCard({ data, onNavigate }: { data: NavData; onNavigate?: () => void }) {
  return (
    <Link href="/dashboard/credit" onClick={onNavigate}
      className="border-line hover:border-brand/40 block rounded-xl border px-3 py-2.5 transition-colors">
      <p className="text-faint text-[11px] font-semibold tracking-wide uppercase">Spurs credit</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{data.creditDisplay}</p>
      <p className="text-faint mt-0.5 text-[10px] leading-snug">Spend it anywhere in Spurs</p>
    </Link>
  );
}

function Body({ current, data, onNavigate }: { current: string; data: NavData; onNavigate?: () => void }) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Links current={current} data={data} onNavigate={onNavigate} />

        <div className="border-line mt-4 flex items-start gap-2.5 rounded-2xl border border-dashed p-3">
          <ShieldCheck className="text-cash mt-0.5 size-4 shrink-0" />
          <p className="text-muted text-xs leading-relaxed">
            We never pay for a card before it's verified. It keeps rates high for everyone.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Link href="/dashboard/help" onClick={onNavigate}
          className="text-muted hover:text-ink flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors">
          <LifeBuoy className="size-[18px]" /> How it works
        </Link>
        <CreditCard data={data} onNavigate={onNavigate} />
      </div>
    </>
  );
}

const Brand = () => (
  <span className="flex items-center gap-2 font-semibold tracking-tight">
    <span className="bg-brand grid size-8 place-items-center rounded-xl text-white">
      <Gift className="size-4" />
    </span>
    Spurs Cards
  </span>
);

export function Sidebar({ current, data }: { current: string; data: NavData }) {
  return (
    <aside className="border-line bg-card fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r p-4 lg:flex">
      <Link href="/dashboard" className="mb-5 px-2"><Brand /></Link>
      <Body current={current} data={data} />
    </aside>
  );
}

export function MobileNav({ current, data }: { current: string; data: NavData }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Open menu"
        className="text-muted hover:text-ink hover:bg-brand-soft grid size-9 place-items-center rounded-xl transition-colors lg:hidden">
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="bg-card absolute inset-y-0 left-0 flex w-[84%] max-w-[300px] flex-col p-4 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu"
                className="text-muted hover:text-ink grid size-9 place-items-center rounded-xl">
                <X className="size-5" />
              </button>
            </div>
            <Body current={current} data={data} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
