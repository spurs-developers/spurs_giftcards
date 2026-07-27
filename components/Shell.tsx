import { Wallet } from "lucide-react";
import { Sidebar, MobileNav, type NavData } from "@/components/Nav";
import AccountMenu from "@/components/AccountMenu";

export type Section = "store" | "cards" | "sell" | "trades" | "credit" | "help";

export interface ShellData extends NavData {}

/**
 * App chrome: fixed sidebar on desktop, drawer on mobile, and a top bar
 * carrying the page title, the credit balance and the shared Spurs avatar.
 */
export default function Shell({
  data, current, title, user, children,
}: {
  data: ShellData;
  current: Section;
  title: string;
  user?: { name?: string; email?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <Sidebar current={current} data={data} />

      <div className="lg:pl-64">
        <header className="bg-card/85 border-line sticky top-0 z-20 border-b backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <MobileNav current={current} data={data} />

            <span className="bg-brand grid size-7 place-items-center rounded-lg text-xs font-bold text-white lg:hidden">
              S
            </span>

            <h1 className="hidden text-base font-semibold tracking-tight lg:block">{title}</h1>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="chip chip-gold tabular-nums">
                <Wallet className="size-3.5" /> {data.creditDisplay}
              </span>
              <AccountMenu name={user?.name} email={user?.email} />
            </div>
          </div>
        </header>

        <main className="px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
