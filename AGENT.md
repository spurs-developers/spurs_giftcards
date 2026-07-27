# AGENT.md — Spurs Gift Card Store

Context file for any coding agent (Claude Code or otherwise) working in this repo. Read this before making changes.

## What this project is

A subdomain of the Spurs ecosystem (spurs.com.ng) with two functions in one codebase:

- **Issuing**: Spurs' own branded stored-value gift cards, redeemable only across Spurs products.
- **Trading**: buying third-party gift cards (Amazon, Steam, iTunes, Google Play, eBay) from users for naira.

These are not separate apps. The trading flow is designed to feed the issuing flow: a user selling a third-party card can opt into a bonus-rate payout as Spurs credit instead of cash. Any change to the sell flow must preserve this choice — don't simplify it away.

## Stack

- Full-stack Next.js (App Router) — route handlers (`app/api/**/route.ts`) serve as the backend; no separate Laravel app for this subdomain (unlike SimHost/MadiTel)
- Feature-module organization under `src/features/` and `src/shared/`, adapted to Next's `app/` routing; TanStack Query, Zustand; server components by default, client components only where interactivity requires it
- Postgres via Prisma or Drizzle (pick one, stay consistent)
- Redis + BullMQ, run as a separate Node worker process — not inside Next's request lifecycle

## Frontend note

This app uses Next.js, unlike some earlier Spurs subdomains (e.g. MadiTel) which are Vite SPAs. Don't copy Vite-specific patterns (React Router, `main.tsx` entry, client-only routing) from those repos — adapt the same feature-module *organization* to Next's App Router instead.

## Identity and payments — do not build these locally

- **Auth**: this app does not have its own user table as source of truth. All users come from the unified Spurs identity system. If you're about to write a `users` migration or a login form, stop — that's already solved at the platform level; integrate against it instead.
- **Wallet/payments**: all cash settlement and Spurs credit balance operations go through Spurs Pay. Do not create a second wallet ledger. If a feature seems to need a new balance concept, check whether `giftcard_credit_balance` on the existing wallet model already covers it before adding a new table.

## Hard rules — do not violate these even if asked to "simplify" or "just make it work"

1. **No payout before verification passes.** Every third-party card trade goes through automated verification or, failing that, the manual review queue. Never add a code path that releases payout before that check completes.
2. **Closed-loop only.** Spurs Gift Card credit is not convertible to cash and is not withdrawable. If you're implementing something that converts credit back to naira cash-out, stop and flag it — this crosses from closed-loop stored value into e-money territory, which has different regulatory requirements. Do not build this without explicit confirmation from Oladele first.
3. **Rates are data, not code.** Buy rate, sell rate, and bonus-credit rate must be editable via the rates table/admin panel. Never hardcode a rate value in application logic.
4. **Fraud signals are ecosystem-wide.** Flag/trust-score data tied to a user's unified identity, not scoped only to this subdomain — other Spurs apps may need to read it.

## Where this fits in the wider Spurs codebase

- Runs on the shared consolidated VPS/Docker setup alongside MadiTel, SimHost, Vendify — do not provision separate hosting for this app.
- Shares Postgres and Redis instances with other Spurs subdomains — use a dedicated schema/prefix, don't assume exclusive DB access.
- Related docs: unified identity platform (auth contract), Spurs Pay (wallet/settlement API), Spurs Premium (bonus rates/limits for Premium-tier users — check if this app needs to read Premium status before applying preferential rates).

## When in doubt

Ask before guessing at an integration contract (unified identity auth interface, Spurs Pay wallet API) rather than stubbing one out and moving on — a locally-invented contract here becomes a real inconsistency across the ecosystem later.
