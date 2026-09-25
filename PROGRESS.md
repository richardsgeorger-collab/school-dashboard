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

### Phase 3: Core makeover (2026-09-24)
- **Five tabs**: Now / Calendar / Classes / Inbox / You (`src/router.ts`, `src/components/Nav.tsx`). Every other
  screen (class page, library, quiz, study, tutor, AI plan, load, grades) lights up the tab it belongs to (`TAB_OF`).
  Old addresses keep working: `#/news` → Inbox, `#/settings` → You, `#/plan` → Load, `#/record` → Library
  (`src/router.test.ts`).
- **Cut**: the Week view, the Plan tab, Check Halo (the freeform audit paste, its AI reader, the "needs you" polish,
  the class picker and its two panels), the "Okay?" top-bar button (Now's status line already opens it), the
  typed-in Supabase URL/key panel with password sign-in. Fifteen source files and their tests are gone.
- **Calendar**: Agenda by default with a seven-day strip on top (`WeekStrip`: day, count due, heavy days shaded, tap
  to start the agenda there), and Month. Term moved into Load as a toggle.
- **Load**: This week (the old Plan tab's time ledger and hours-by-class) / Weeks / Term. Reached from You.
- **Classes tab** (`Classes.tsx`): one card per class with grade so far, next due, overdue count, meeting times, and
  when it was last synced from Halo. Tap for the class page.
- **Inbox**: the announcements screen, renamed and reworded.
- **You** (`You.tsx`): Account (sign in with email link or Google; plan badge; trial days left; sign out), AI usage
  this month (from the server's meter), Plans (three cards from the config, checkout arrives in Phase 5), Level and
  streaks, Grades summary, Workload link, Halo card, then Study time / Display / Classes / Advanced as collapsible
  groups (`#/you?s=classes` opens one). Advanced holds syllabus PDF import, add by hand, calendar-file import,
  export everything (JSON, announcements included), restore, duplicates, start fresh, and delete account. Footer
  says the app is not affiliated with GCU. 1,640 px on a phone, down from 4,869.
- **Trust**: `SyncedLine` ("Synced from Halo today 7:12 AM" / "Not synced from Halo yet · Sync now") on Now and on
  every class page; `SourceBlock` on every item (from Halo / the syllabus / a calendar export / you, when it last
  matched Halo, Halo's own status, the announcement it came from with the professor's words, a moved date's old
  value, and the Open in Halo link).
- **Sync sheet** (`SyncSheet.tsx`): the Sync button now leads with the bookmark. Computer: drag the button, open
  Halo, click it. Phone: copy the address, bookmark any page, replace its address, run it from Halo. "Having
  trouble?" holds paste-the-export and import-a-calendar-file. The bookmark hands off to `#/now?halo=1`.
- **Empty states** on Now, Calendar, Classes, Inbox, Load and Grades, each with the one button that fills it.
  A brand-new user starts with zero classes and zero items (no more seed term); the sample term is a developer
  button under Advanced.
- **No key in the product**: the coach's API-key form is gone; every AI screen gates on `aiAvailable()` (an account
  on this build, or a development key) and the gateway's refusal is what a student sees. Copy that said "connect the
  Anthropic key on Now" now names the plan.
- **Light is the default theme**; Dark and Auto sit behind Plus with a quiet lock card.
- Verified on the rendered UI: `scripts/audit-fresh.mjs` walks every route as a fresh phone user (screenshots
  reviewed), and the populated e2e flows (now, news, requirements, classes, grades, reread) run against the build.
- Not done here, on purpose: measuring how long a Halo session token lasts needs George on a real Halo session;
  auto-merging duplicates on sync is not built because it would break the standing rule "never silently overwrite"
  (the Duplicates panel stays under Advanced with its undo).

### Phase 4: Onboarding (2026-09-24)
- **The first five minutes** (`src/onboarding/`): a full-screen welcome on the first open with a three-screen tour
  (your day from Halo; sync in one tap, never your password; know where you stand), then Account (email link or
  Google; only on a build with accounts; passes itself once signed in), then Connect Halo (the same bookmark steps
  as the Sync sheet, computer or phone, with "Having trouble?" for paste-the-export and calendar-file import), then
  two quick preferences (weekday and weekend study hours, morning note time), then "Show me my day".
- **Instant payoff**: the moment the bookmark's export is approved, the Halo step becomes the celebration:
  "6 classes and 181 assignments are in. First up: Chem Quiz 1, due Sep 25." with the class chips.
- **Every step can be skipped** ("I'll do this later", "Not now", "Skip for now"); a progress bar says Step n of N;
  "Show the welcome again" sits under You, Advanced.
- **Tooltip tour on Now**, once, after the last step: the status line, the hero, the synced-from-Halo line. Each
  tooltip points at the real element; a missing one is skipped.
- **Drop-off tracking**: every step entered, completed or skipped writes a row to `onboarding_events` (with
  `platform` phone/desktop) for a signed-in student, so the admin screen in Phase 8 can show where people stop.
- **Existing users never see it**: anyone with classes on first load is marked done and toured. Development and
  the e2e scripts (`seed=1`) start with classes and are therefore unaffected.
- **Reminder preferences** (`settings.reminders.morningTime`) are stored now so Phase 7's push notifications can
  read them without asking again.
- Verified on the rendered UI: `scripts/audit-fresh.mjs` now walks the welcome flow and the tour before the tabs,
  with a screenshot per step.

## In progress

- Phase 5: Payments, trial, referrals, and the Chrome extension for Plus auto-sync.

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

- **A fresh browser starts empty; `#/now?seed=1` loads the sample term.** New students see empty states with one
  button each, which is the point; the developer and the e2e scripts get the six-class sample through the flag,
  which is honored only when there is nothing on the device.
- **The Duplicates panel stays** (under You, Advanced). The plan said to auto-merge on sync; that collides with the
  standing rule that nothing is silently overwritten, so merges stay a tap with an undo.
- **The Halo bookmark hands off to Now**, not Settings: the diff opens over the screen a student actually lives on.
- **The coach does not render with zero classes.** It has nothing to coach; the empty state's one button is Sync.
- **Sign-in is magic link or Google only.** The old panel had password fields; the product never has a password.
- **AI screens gate on `aiAvailable()`**, meaning an account on this build or a development key, and then let the
  gateway's refusal (plan, cap, budget) be the message. No screen decides on its own what a plan allows.

- **Onboarding state lives in settings**, not only on the server profile, so a build without accounts remembers
  it, and it travels with the account when there is one.
- **The account step is skipped on a build with no accounts** rather than shown disabled: "Step 1 of 3" is honest.

## Extras

Built:
- The seven-day strip on the agenda shows heavy days shaded, from the same capacity math as Load.
- Every item carries its provenance (`SourceBlock`), including the professor's own words when an announcement created or moved it.
- The Sync sheet has a phone tab with the iPhone/Android bookmark steps, since Free is bookmarklet-on-every-device.
- `LockTag` inline plan marker for menus and buttons, alongside `Locked`.
- Meter feed (`onMeter`/`latestMeter`) so any screen can show "used 85% of this month's AI" without a second request.

Not built (noted for later):
- Batch API for announcement backlogs (halves cost on non-instant work). Deferred: the current per-post flow is
  already ledgered and cheap on Haiku; revisit when the read backlog on a new account is large.
