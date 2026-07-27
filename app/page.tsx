import Link from "next/link";
import { Gift, ArrowLeftRight, Wallet, ArrowRight, Check, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";

// Public landing. Signed-in visitors go straight to the store.
export default async function Landing() {
  const user = await getSession();
  const cta = user ? "/dashboard" : "/auth/start";

  const steps = [
    { Icon: Gift, title: "Buy a Spurs card", body: "Any amount, delivered instantly. Send it to someone or keep it." },
    { Icon: ArrowLeftRight, title: "Sell what you don't need", body: "Amazon, Steam, iTunes and more — turned into naira." },
    { Icon: Wallet, title: "Spend it anywhere in Spurs", body: "One balance across Pay, Wallet and everything else." },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5">
      <header className="flex items-center justify-between py-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="bg-brand grid size-8 place-items-center rounded-xl text-white">
            <Gift className="size-4" />
          </span>
          Spurs Cards
        </span>
        <Link href={cta} className="btn-brand px-5 py-2 text-sm">
          {user ? "Open store" : "Sign in"}
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center py-14">
        <span className="chip chip-gold w-fit">
          <Sparkles className="size-3.5" /> Get more when you take credit
        </span>

        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Gift cards that actually go somewhere.
        </h1>
        <p className="text-muted mt-4 max-w-xl text-lg leading-relaxed">
          Buy a Spurs card in seconds, or sell the ones gathering dust in your inbox.
          Take naira, or take Spurs credit and get paid more for it.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href={cta} className="btn-brand px-6 py-3">
            Get started <ArrowRight className="size-4" />
          </Link>
          <span className="text-muted flex items-center gap-1.5 text-sm">
            <Check className="text-cash size-4" /> Verified before every payout
          </span>
        </div>
      </section>

      <section className="grid gap-3 pb-14 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.title} className="card p-5">
            <span className="bg-brand-soft text-brand grid size-10 place-items-center rounded-xl">
              <s.Icon className="size-5" />
            </span>
            <h2 className="mt-3.5 font-semibold">{s.title}</h2>
            <p className="text-muted mt-1 text-sm leading-relaxed">{s.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
