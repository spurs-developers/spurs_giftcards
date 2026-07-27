import Link from "next/link";
import { Gift, ArrowLeftRight, ShieldCheck, Sparkles, CircleHelp, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getShellData } from "@/lib/shell";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function Help() {
  const user = await requireUser();
  const shell = await getShellData(user.sub);

  const steps = [
    { Icon: Gift, title: "Buy a card", body: "Pick an amount, pay from your Spurs Wallet, and the code appears straight away." },
    { Icon: ArrowLeftRight, title: "Sell a card", body: "Send us the details of an unused Amazon, Steam or iTunes card and choose how you want paying." },
    { Icon: Wallet, title: "Spend credit", body: "Redeemed cards and credit payouts land in one balance you can spend across Spurs." },
  ];

  const faqs = [
    { q: "Why do I get more for taking credit?", a: "Credit stays inside Spurs, so it costs us less to give you than naira does. We pass that difference back as a bonus — usually 5–10% above the cash rate." },
    { q: "Can I turn Spurs credit into cash?", a: "No. Credit is stored value for spending inside Spurs; it can't be withdrawn or transferred. If you want cash for a card, choose the cash payout when you sell." },
    { q: "How long does verification take?", a: "Most cards clear quickly. Anything our checks can't confirm goes to a person, which can take longer — but nothing is ever paid before it's verified." },
    { q: "Can I use part of a card?", a: "Yes. Cards carry a running balance, so if you spend ₦3,000 of a ₦10,000 card the remaining ₦7,000 stays put." },
    { q: "I lost my code — can you resend it?", a: "We can't. Codes are never stored in a readable form, which is what stops them leaking. Save the code when it's shown to you." },
    { q: "My card was declined. What now?", a: "The reason shows under My sales. Most declines are a used or mistyped code — check both and submit again." },
  ];

  return (
    <Shell data={shell} current="help" title="How it works" user={{ name: user.name, email: user.email }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
        <p className="text-muted mt-1 text-sm">Buying, selling and spending, start to finish.</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card p-5">
            <div className="flex items-center gap-3">
              <span className="bg-brand-soft text-brand grid size-10 place-items-center rounded-xl">
                <s.Icon className="size-5" />
              </span>
              <span className="text-faint text-sm font-semibold">0{i + 1}</span>
            </div>
            <h2 className="mt-3.5 font-semibold">{s.title}</h2>
            <p className="text-muted mt-1 text-sm leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CircleHelp className="text-brand size-4" /> Common questions
        </h2>
        <dl className="divide-line mt-2 divide-y">
          {faqs.map((f) => (
            <div key={f.q} className="py-3.5">
              <dt className="text-sm font-medium">{f.q}</dt>
              <dd className="text-muted mt-1 text-sm leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="card flex items-start gap-3 p-5">
          <ShieldCheck className="text-cash mt-0.5 size-5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Verified before we pay</h3>
            <p className="text-muted mt-1 text-sm leading-relaxed">
              Every card is checked before any payout. It's slower on the rare awkward card, but it's
              why we can keep rates where they are.
            </p>
          </div>
        </div>
        <div className="card flex items-start gap-3 p-5">
          <Sparkles className="text-gold mt-0.5 size-5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">One account, everything Spurs</h3>
            <p className="text-muted mt-1 text-sm leading-relaxed">
              The same Spurs account covers Cards, Wallet, Pay and Earn — credit and cash both land
              where you already are.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 text-center">
        <Link href="/dashboard" className="btn-brand justify-center px-6 py-3">
          <Gift className="size-4" /> Browse the store
        </Link>
      </div>
    </Shell>
  );
}
