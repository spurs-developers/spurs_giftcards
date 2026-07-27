# Build Prompt: Spurs Gift Card Store (giftcards.spurs.com.ng)

Paste this into Claude Code (or hand to any coding agent) to scaffold the project.

---

## Context

Build a gift card subdomain for the Spurs ecosystem (spurs.com.ng) with a **dual model**:

1. **Issuing** — Spurs sells its own branded stored-value gift cards (digital code, later physical), redeemable only within Spurs products (pay, e-commerce, movie, music, tickets, travel, logistics).
2. **Trading** — Spurs buys and sells third-party gift cards (Amazon, Steam, iTunes, Google Play, eBay) for naira, settling to the user's Spurs Pay wallet.

The two flows connect: when a user sells a third-party card, they can choose a cash payout (standard rate) or a **bonus-rate payout in Spurs Gift Card credit** (5–10% above cash rate). This is the core mechanic — it funnels outside liquidity into the closed-loop Spurs wallet. Get this choice into the sell flow from day one; don't bolt it on later.

## Stack (match existing Spurs subdomains where sensible — see SimHost for reference architecture, but this app runs full-stack Next.js, not Laravel)

- **Full stack**: Next.js (App Router) — route handlers (`app/api/**/route.ts`) serve as the backend, no separate Laravel app for this subdomain
- **Frontend**: Next.js, feature-module organization under `src/features/`, `src/shared/`, adapted to App Router — server components by default, client components only where interactivity requires it (forms, wallet balance polling)
- **DB**: Postgres, accessed via Prisma or Drizzle (pick one and stay consistent — don't mix ORMs)
- **Queue**: Redis + BullMQ — this is a natural fit for Next.js since BullMQ is a Node library; run workers as a separate Node process (not inside Next's request lifecycle) for verification and payout jobs
- **Identity/Auth**: integrate with the existing unified identity system via its API/session contract — do not build local registration/login, and don't reach for NextAuth's local-user-table pattern
- **Settlement**: all naira payouts and Spurs Gift Card credit route through the existing Spurs Pay wallet API — do not create a parallel wallet system

## Data model (minimum viable)

- `users` — reference to unified identity, not owned by this app
- `wallets` — Spurs Pay wallet reference (external), plus `giftcard_credit_balance` if credit is tracked separately from cash balance
- `giftcard_products` — Spurs-issued card catalog: denomination, sku, active/inactive, is_corporate_bulk
- `giftcard_codes` — issued codes: code hash, denomination, status (unredeemed/redeemed/expired), redeemed_at, redeemed_by
- `trade_offers` — third-party card types accepted, current buy rate, current sell rate (if you also let users buy 3rd-party codes, otherwise trading is buy-side only from users)
- `trade_transactions` — card type, face value, submitted card image/code, verification status, payout type (cash vs credit), payout amount, resolved_at
- `verification_queue` — items pending manual review after automated checks fail or flag
- `redemption_log` — every spend of Spurs credit across any Spurs subdomain, for breakage/reporting

## Core flows to build first

1. **Buy a Spurs Gift Card** — pick denomination or custom amount → pay via Spurs Pay → receive code (digital) → redeemable at checkout on any Spurs subdomain.
2. **Sell a third-party card** — submit card type + code/image → automated verification (API check where the brand supports it) → if passed, present payout choice (cash at buy rate, or credit at bonus rate) → settle.
3. **Manual verification queue** — anything automated verification can't confirm goes here; admin reviews before any payout is released. No payout is issued on unverified cards, ever.
4. **Redeem Spurs credit** — checkout flow on any other Spurs subdomain checks `giftcard_credit_balance` and allows partial/full payment from it, same as cash wallet balance.
5. **Corporate bulk purchase** — a business buys N cards at a denomination, gets a CSV/codes export, at a negotiated bulk rate. Build as an admin-assisted flow first (don't over-engineer a self-serve bulk UI before there's demand).

## Non-negotiables

- **Closed-loop only.** Spurs Gift Card credit must never be convertible back to cash or withdrawable. If a redemption/refund flow tempts you to write "convert credit to naira," stop — check the regulatory framing (closed-loop stored value vs. e-money) before building that path at all.
- **No payout before verification passes.** Automated or manual — but never skipped.
- **Every transaction ties to unified identity**, not a subdomain-local user record. Fraud/trust signals need to be visible ecosystem-wide, not siloed to this app.
- **Rates (buy/sell/bonus) must be admin-editable without a deploy** — these move with market conditions and need a rates table + admin UI, not hardcoded values.

## Build order

1. Scaffold the Next.js app (App Router, route handlers for API), connect to shared Postgres/Redis (see hosting consolidation notes — this runs on the shared VPS, not its own box). Set up Prisma/Drizzle schema and migrations.
2. Wire unified identity auth (session/middleware check against the existing identity service — no local registration/login, no local user table as source of truth)
3. Build `giftcard_products` + issuing/redemption flow end-to-end (issuing is simpler — do this before trading)
4. Build trading flow: submission → automated check → manual queue → payout choice → settlement
5. Admin panel: rate management, verification queue, breakage/redemption reporting


Ask before proceeding if unified identity's auth interface or Spurs Pay's wallet API isn't already documented somewhere accessible — don't guess at integration contracts for either.
