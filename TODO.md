# Spurs Gift Cards — what's verified, what isn't

Written 2026-07-23. Same purpose as `survey/TODO.md`: be honest about the gap
between "the code exists" and "I watched it work".

---

## Verified end to end (run against the real database and live services)

- **Buy a card.** Order → wallet debited → codes minted. Paid ₦10,000 from a
  seeded wallet, got 2 × ₦5,000 codes.
- **Codes are never stored.** Confirmed the plaintext appears nowhere in the
  row — only a peppered HMAC and the last four characters.
- **Redeem into credit.** Card balance moves to Spurs credit; the same code a
  second time is refused ("already used").
- **Spending is idempotent.** The same `orderRef` replayed leaves the balance
  unchanged. Overspending is refused.
- **Trade quote.** $100 Amazon → ₦125,000 cash vs ₦135,000 credit (+8%),
  matching the seeded rate exactly.
- **No payout before verification.** `settleTrade` on a `submitted` trade throws
  and pays nothing. The verification job routes to `needs_review`; only after an
  admin approves does the settlement job pay. Settling twice pays once.
- **Duplicate card detection.** The same code resubmitted — even reformatted and
  lower-cased — scores 60 and flags `duplicate_code`. A different card doesn't.
- **Rejected trades pay nothing.**
- **Rates are versioned.** A paid trade keeps the `rateId` it was quoted at.
- **Survey → credit.** 5,000 points → ₦5,500 credit (+10%), and nothing moves
  before approval. Cash redemptions still get the full 24h hold; credit doesn't
  (it can't be withdrawn, so the hold has nothing to protect).
- **Internal API auth.** Unauthenticated calls get 401.
- **Builds.** `tsc --noEmit` clean; `next build` green for giftcards and admin.
  All 5 admin gift card routes compile. Both SDKs build/lint clean and are
  pushed.

## Built but NOT verified live

- **The gift card UI under a real session** — store, sell flow, credit page,
  cards page. Server-rendered and building, but not clicked through.
- **Admin gift card pages rendering.** They compile and every data function was
  exercised directly, but I couldn't drive the server-action login.
- **`walletBalance()` on the checkout screen.** Falls back to ₦0.00 on any
  error, so a broken call shows a wrong-but-harmless balance rather than an
  error. Worth an eyeball.

## Known gaps / not built

- **Image upload isn't wired to storage.** Brands requiring a photo accept a
  placeholder handle (`pending-upload`) and go to manual review. The reviewer
  can't actually see an image yet. **This is the biggest gap in the sell flow.**
- **No brand API integration.** `runCheck` is a risk screen (duplicate codes,
  velocity, code shape, first-trade-high-value), not a balance check. No brand
  here exposes one to us. Every brand therefore has `autoVerify = false`, so
  **everything goes to a human** — safe, but it won't scale without either a
  real brand API or a deliberate decision to auto-approve low-risk cards.
- **No scheduler runs the job queue.** `POST /api/private/giftcards/process-jobs`
  works and is idempotent, but nothing calls it on a timer. Right now trades
  only progress when an admin hits the console. **Wire a cron before launch** —
  the admin overview flags overdue jobs for exactly this reason.
- **Corporate bulk purchase** is in the schema (`isCorporateBulk`, order
  quantity up to 50) but has no dedicated flow. The prompt said admin-assisted
  first; that's effectively where it stands.
- **Gift delivery does nothing.** Recipient name/email/message are captured and
  stored, but no email is sent — the buyer just gets the code on screen.
- **Physical cards** aren't modelled at all (digital only, as scoped).
- **Spurs Premium preferential rates.** `AGENT.md` mentions checking Premium
  status before applying better rates. There is no Premium app in this repo, so
  nothing reads it.
- **Trading is buy-side only.** We buy third-party cards from users; we don't
  sell third-party codes to them. That matched the prompt's default.
- **Opening rates are illustrative.** ₦1,250/$1 for Amazon etc. were seeded as
  starting points, not researched market rates. **Set real ones in
  Admin → Gift cards → Rates before going live.**

## Things to watch

- **Outstanding credit is a liability, not revenue.** The breakage tab makes
  this explicit. Nothing writes credit off automatically; that needs a finance
  policy decision.
- **The closed-loop boundary is load-bearing.** `lib/credit.ts` has no path from
  credit back to cash, and the SDKs expose none. Keep it that way — making
  credit convertible turns closed-loop stored value into e-money, with different
  regulatory obligations (AGENT.md rule 2).
- **`GIFTCARD_CODE_PEPPER` is a dev value.** Rotating it in production
  invalidates every existing card hash and every trade fingerprint. Set a real
  one before launch, and treat rotation as needing a re-hash plan.
- Card codes are AES-256-GCM encrypted at rest; the reviewer's "reveal" action
  is audited on the admin side. That audit entry matters more than most.
