# Progress

Running log for the product makeover. Newest phase at the top of each list. Decisions taken without asking are
under **Decisions made alone**, each with the reason. Everything beyond the plan is under **Extras**.

## Done

### Phase 1: Audit and plan (commit 0644a13, 2026-09-22)
- Fresh-eyes audit as a new phone user (`scripts/audit-fresh.mjs`) and the product plan (`PLAN.md`).

### Phase 2: Foundations (2026-09-24)
- **One config file for the business**: `src/config/tiers.ts` holds tiers, prices, Stripe price ids (placeholders),
  trial (Max, 7 days, no card), grace (7 days), referral (Plus, 30 days, both), daily message caps (Pro 10, Max 30),
  weekly lecture cap (Max 10), monthly AI ceilings (Plus $0.75, Pro $2.50, Max $4.00; warn at 80%), per-kind
  output caps, and the feature → lowest-tier table with one plain line per feature.
- **Feature flags**: `src/config/flags.ts` (`can`, `effectiveTier` with live trial, `trialDaysLeft`) and
  `src/config/Locked.tsx` (`<Locked feature tier>` renders the children or a quiet upgrade card; `<LockTag>` inline).
- **One model, named once**: `src/ai/model.ts` (`claude-haiku-4-5-20251001`). `src/ai/model.test.ts` walks `src`,
  `scripts`, `supabase`, `extension`, `landing` and fails on any other model string. All 15 `claude-sonnet-4-6`
  references are gone (7 source files, 8 test/e2e mocks).
- **One AI gateway**: `src/ai/gateway.ts`. Every call in the app builds a request there; it posts to the `ai` Edge
  Function with the student's session token. Sets the model, caps output per kind, marks stable system blocks for
  prompt caching, publishes the server's meter for the screen. `src/ai/client.ts` (`callTool`/`callText`) sits on
  top and the six files that used the SDK directly (coach, lecture notes, audit, quiz, needs polish, brief/draft/method)
  now go through it. The `@anthropic-ai/sdk` package is now types-only in the client bundle.
- **The meter**: `src/ai/meter.ts` is pure and shared with the server: month cost, messages today, lectures this
  week; `allowance()` refuses by tier, daily cap, weekly lecture cap or monthly ceiling with plain words; 80% heads-up
  line; `costOf()` from reported usage at Haiku prices.
- **Edge Function `supabase/functions/ai`**: verifies the JWT, reads the profile tier and this month's usage, runs the
  same `allowance()`, forces the model and cap, calls Anthropic with the server-side key, logs every call's tokens
  and cost to `usage_log` before answering, returns the answer plus the updated meter. 402 for tier, 429 for caps.
- **Shared code on the server**: `scripts/sync-shared.mjs` copies tiers/flags/model/meter into
  `supabase/functions/_shared/` with Deno imports; `src/config/shared.test.ts` fails when the copies drift; the
  build runs the sync first.
- **Database**: `supabase/migrations/0001_foundations.sql`. Tables: courses, items, settings (existing shape), profiles
  (tier, trial, grace, Stripe customer, referral code, onboarding, admin, timezone; auto-created on sign-up with the
  Max trial), terms, announcements, read_ledger, usage_log, subscriptions, push_subscriptions, notification_prefs,
  notification_plan, onboarding_events, referrals, feedback, recordings. RLS on every table, own-rows only.
  `profiles.tier/trial/grace/admin` are server-only via a trigger that reverts client changes. Admin aggregate view
  revoked from clients. `delete_my_account()` removes every row and the auth user in one call.
- **Cross-user isolation test**: `supabase/tests/rls.test.ts` runs against a real project when env is set (A cannot
  see B's items, cannot write under B's id, cannot promote themselves, cannot read another's usage); reports itself
  as skipped otherwise. Listed in the launch checklist as a must-run.
- **Auth**: `src/auth/client.ts` (connection from `VITE_SUPABASE_*`, no more typing it into Settings),
  `useAuth.ts` (email magic link + Google; no passwords), `useProfile.ts` (tier from the profile row),
  `SignIn.tsx`, `account.ts` (export everything as one JSON file; delete account).
- **Migration of existing data**: none needed. The store's `connectRemote` already merges local data into the account
  on first sign-in (last write wins, tombstones), so George's data moves over the moment he signs in.
- **Lint**: `oxlint` (`npm run lint`), added to the deploy workflow before the build. Warnings allowed; errors fail.
- Tests 685 passing, typecheck clean, production build clean including the secrets scan.

## In progress

- Phase 3: Core makeover.

## Decisions made alone

- **oxlint instead of eslint.** typescript-eslint refuses TypeScript 7 (the project is on 7.0.2). oxlint parses TS 7
  natively, needs no plugins, and runs in under a second. Same rules that matter: hooks, unused vars, correctness.
- **Output caps match what each pass already used**, not the smaller numbers in PLAN.md: class/term plans and the
  audit at 12,000 with thinking, lectures and quizzes at 4,000, coach 4,000 with thinking (the 600-token empty-answer
  bug is documented in the code). Lowering them would have regressed quality on day one; the ceiling protects cost.
- **Transition flag `VITE_AI_DIRECT=1` in the deploy workflow.** Until the Edge Function is deployed, a key typed
  into Settings still reaches Anthropic from the browser (exactly what the app did before), so George's own copy keeps
  working. Production builds without the flag never take that branch. Removing the line is on the launch checklist.
- **An unconfigured build runs as Max.** With no Supabase connection there is nothing to gate on; the local checkout
  behaves as the top tier so every feature can be worked on. Real builds always have a connection.
- **Client may edit only `onboarding_step`, `onboarding_done_at`, `timezone` on its profile.** A database trigger
  reverts any client change to tier, trial, grace, Stripe id, referral code or admin, so a tampered request cannot
  self-upgrade even if a policy were wrong.
- **Usage is logged before the answer is returned.** A crash after the model call can never make a call free.
- **No strict tool schemas anywhere** (removed `strict: true` from the audit, needs and brief tools). Every reader
  validates its input already; strict grammars only added a failure mode.
- **Placeholders that look like keys are not allowed**, even in `.env.example`: the secrets scanner fails the build on
  anything key-shaped, so the server env example ships blank values.

## Extras

Built:
- `LockTag` inline plan marker for menus and buttons, alongside `Locked`.
- Meter feed (`onMeter`/`latestMeter`) so any screen can show "used 85% of this month's AI" without a second request.

Not built (noted for later):
- Batch API for announcement backlogs (halves cost on non-instant work). Deferred: the current per-post flow is
  already ledgered and cheap on Haiku; revisit when the read backlog on a new account is large.
