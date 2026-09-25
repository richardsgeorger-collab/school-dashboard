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

### Phase 5: Payments, trial, referrals, and the extension (2026-09-24)
- **Stripe, test mode only**: three Edge Functions. `stripe-checkout` (Checkout Session for a plan and interval;
  refuses to run on placeholder price ids; creates the Stripe customer once and remembers it on the profile),
  `stripe-portal` (change card, switch, cancel), `stripe-webhook` (signature verified; `checkout.session.completed`,
  `customer.subscription.*` and `invoice.payment_failed` all flow through one `apply()`). The webhook is the only
  thing that ever changes a paid tier.
- **One pure mapping, shared** (`src/billing/subscription.ts`, copied to the server by the same sync as the tiers):
  active or trialing keeps the plan; past due keeps it for `GRACE_DAYS` (7) with `grace_until` set; canceled,
  unpaid, paused or expired is Free; an unknown price never grants anything. Tested.
- **You → Plans**: monthly or yearly toggle, one Choose button per plan that goes to Stripe, "Current plan" on the
  one you are on, "Sign in to choose" when signed out. Coming back from Stripe shows a thank-you and re-reads the
  profile. The account card shows the renewal or end date, a failed payment with the date to fix it by, and Manage
  plan opens the portal.
- **Trial**: every new account is Max for seven days (the database sets it at sign-up). You shows the days left;
  Now shows one line in the last three days with a link to plans.
- **Referrals**: every profile has a code; You has an Invite card with the link (`#/now?ref=CODE`) and Copy. The
  code is remembered on arrival and claimed once there is an account, through the `claim_referral` database
  function: both sides get thirty days of Plus, stacked, never downgrading a paid plan. `effectiveTier` now takes the
  best of paid, trial and reward. Migration `0002_referrals_rewards.sql`.
- **Chrome extension** (`extension/`, Manifest V3): every three hours while Chrome is open, for Plus and up, it
  opens Halo in a background tab, runs the same sync script the bookmark runs (generated by
  `npm run build:extension` from `src/halo/bookmarklet.ts` in a new `deliver: 'message'` mode), carries the export
  to the dashboard tab and closes what it opened. The dashboard receives it exactly as it would from the bookmark
  and the same approval screen opens. Anyone can press Sync now in the popup; the schedule is Plus. It learns the
  plan from the dashboard tab (`localStorage school-dashboard:tier`) and never sees a password. README covers
  loading it unpacked; publishing is on the launch checklist.
- The bookmarklet build stamp is now `2026-09-24a`; the app keeps telling students when their bookmark is older.

### Phase 6: Pro and Max AI on Haiku (2026-09-24)
- **One AI surface** (`#/ai`, `src/views/Ai.tsx`): Coach, Tutor, Study kit and Practice under one screen with one
  meter line ("3 of 10 messages today · $0.41 of $2.50 this month") and one lock per plan (chat and tutor are Pro,
  study kit and practice are Max). The old `#/tutor`, `#/study` and `#/quiz` addresses open the right mode. The
  coach card stays on Now.
- **Plan gates on every AI entry point** (`useAiAllowed`): announcement reading (Inbox, Read all, and the automatic
  read on sync), the syllabus AI pass, lecture notes from a transcript, study kits and practice, the tutor, the
  assignment brief and draft checks, and grade projection with what-if (Pro). Each shows the quiet lock card or
  tag instead of failing; the server refuses anyway if a request slips through.
- **Server caps already in force from Phase 2**: 10 messages a day on Pro, 30 on Max, 10 lectures a week on Max,
  monthly ceilings with the 80% heads-up and the pause at 100%.
- **Haiku prompt work**: the announcement reader now carries a five-step procedure (mark every sentence aimed at
  students, classify, resolve dates, quote, then summarise) and a worked example with the exact output shape; the
  coach carries format rules (sentences only, no lists or preamble) and an example answer. Both keep every earlier
  rule, so nothing the tests pin changed.
- **Before/after harness** (`npm run ai:compare`, `scripts/ai-compare.ts`, fixtures in `scripts/fixtures/ai.ts`):
  six GCU-shaped announcements (a moved lab with a goggles rule, a DQ reply rule, exam coverage and what to bring,
  work that is not in Halo with a relative date, pure news that must produce nothing, a points change) and one
  lecture transcript, each with plain checks on the shaped output. It runs the app's own prompt builders and
  readers against the shipped model and, with `BASELINE_MODEL` set, an older one, and writes
  `docs/ai-compare/<date>.md` with checks passed, cost and latency per model and the outputs side by side.
  **It needs an API key, which this machine does not have, so the before/after numbers are George's to produce**
  (see LAUNCH_CHECKLIST). `--dry` prints the fixtures and prompt sizes without a call.
- Batch API for backlogs: not built (the per-post flow is ledgered and cheap on Haiku); noted under Extras.

### Phase 7: Notifications and PWA (2026-09-24)
- **Service worker** (`public/sw.js`): the app shell offline (network first for the page, cached assets), push
  events shown as notifications, and a tap that focuses the app on the right screen.
- **Web push, no vendor**: our own VAPID key, one `push_subscriptions` row per device, turned on from You with the
  browser's one permission prompt and a sample note straight away. iPhone is told to add the app to the Home
  Screen first, which is what iOS requires.
- **Four kinds, four switches** (`src/notify/plan.ts`, pure and tested): the morning note at the chosen time with
  the first thing due; the night-before heavy-day warning at 8 PM when three or more things are due or the planned
  hours pass capacity; the not-started nudge at 6 PM for big work untouched within two days; the re-sync reminder
  when Halo has not been synced for three days (the tap opens the Sync sheet). Quiet hours move anything inside
  them to when they end. Nothing in the past is ever planned.
- **The client plans, the server sends.** The plan is computed from the same schedule the screens use and written to
  `notification_plan` a few seconds after any change; `notify-send` runs every five minutes from pg_cron (free),
  sends what is due through web push, drops dead subscriptions, marks rows sent. Preferences mirror to
  `notification_prefs`.
- **Email is a marked branch**, not a provider: the send function has the place, the prefs table has the column,
  and nothing costs money until someone chooses a provider.
- **Reminders are Plus**: the card shows the lock below Plus, and the planner never writes for a plan without them.
- **Install**: the You card offers the browser's install prompt where there is one, and the Home Screen steps on
  iPhone.
- Phone-only sync frequency for the admin screen: the `onboarding_events.platform` and `lastPull` data are in
  place; the admin view comes in Phase 8.

### Phase 8: Landing page, admin, feedback, privacy and terms (2026-09-24)
- **Landing page** (`public/landing/index.html`, served at `/school-dashboard/landing/`): a static page in the
  app's own style. Hero ("Your week, from Halo, on one screen that says what to do now"), a mock of the Now card,
  three value cards, the three-step sync, the four plans with prices from the config (a test fails if they drift),
  a short FAQ, and the disclaimer in the FAQ and the footer. No GCU marks. Meta Pixel snippet with a placeholder id
  that loads nothing until replaced; the Start button fires Lead.
- **Pixel in the app** (`src/analytics/pixel.ts`): loads only with a real id; Lead and StartTrial on first sign-in,
  HaloConnected on the first sync, CompleteRegistration at the end of onboarding, Subscribe on returning from
  Stripe. No class data ever goes to Meta.
- **Admin screen** (`#/admin`, admins only, one `admin_stats()` call): accounts, new this week, on trial, paying, per
  tier; AI cost and calls this month and per paying account; the onboarding funnel per step (entered, completed,
  skipped, distinct accounts); Halo syncs in the last 7 days by platform; accounts that synced in the last 30 days
  and how many of them only ever from a phone (decision 1); open feedback with the screenshot and a Resolved button.
  Every sync now writes one event row with its platform.
- **Feedback** on You: an idea or something broke, two sentences, an optional screenshot from the device into a
  private bucket that only the sender writes and admins read.
- **Privacy and terms**: `PRIVACY.md` and `TERMS.md` in plain words (what is collected, the Halo bookmark and the
  password it never sees, AI, Stripe, the pixel, export and delete), published as `public/privacy.html` and
  `public/terms.html` and linked from You and the landing page. Contact email is a placeholder.
- Fixed on the way: checkbox rows in You were inheriting the full-width input style.

Regenerating the privacy and terms pages after editing the markdown (the same snippet Phase 8 used):

    node -e "const fs=require('fs');const page=(t,md)=>{const h=md.split('\n').map(l=>l.startsWith('# ')?'<h1>'+l.slice(2)+'</h1>':l.startsWith('## ')?'<h2>'+l.slice(3)+'</h2>':l.startsWith('- ')?'<li>'+l.slice(2)+'</li>':/^\d+\. /.test(l)?'<li>'+l.replace(/^\d+\. /,'')+'</li>':l.trim()===''?'':'<p>'+l+'</p>').join('\n').replace(/\*\*([^*]+)\*\*/g,'<b>\$1</b>').replace(/(<li>[\s\S]*?<\/li>\n?)+/g,m=>'<ul>'+m+'</ul>');return '<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>'+t+' · School Dashboard</title><style>body{margin:0;background:#f3f5f7;color:#151a21;font:16px/1.55 system-ui,sans-serif}.wrap{max-width:720px;margin:0 auto;padding:24px 16px 48px}a{color:inherit}p,li{color:#4a545f}</style></head><body><div class=\"wrap\"><p><a href=\"./\">← School Dashboard</a></p>'+h+'</div></body></html>';};fs.writeFileSync('public/privacy.html',page('Privacy',fs.readFileSync('PRIVACY.md','utf8')));fs.writeFileSync('public/terms.html',page('Terms',fs.readFileSync('TERMS.md','utf8')));"

## In progress

- Nothing. Phases 2 through 8 are built and committed. What is left needs George: see "Needs George" below and LAUNCH_CHECKLIST.md.

## Needs George

- The Haiku before/after numbers: `ANTHROPIC_API_KEY=… BASELINE_MODEL=<the model the app used before> npm run ai:compare` (this machine has no key).
- How long a Halo session token lasts (needs a real Halo session; affects how often the extension can auto-sync unattended).
- A Supabase project, Stripe test products, VAPID keys, a pixel id, the contact email: every one is a placeholder today, listed in LAUNCH_CHECKLIST.md in order.
- The live RLS isolation test against the real project before launch.

## Decisions made alone

- **oxlint instead of eslint.** typescript-eslint refuses TypeScript 7 (the project is on 7.0.2). oxlint parses TS 7
  natively, needs no plugins, and runs in under a second. Same rules that matter: hooks, unused vars, correctness.
- **Output caps match what each pass already used**, not the smaller numbers in PLAN.md: class/term plans and the
  audit at 12,000 with thinking, lectures and quizzes at 4,000, coach 4,000 with thinking (the 600-token empty-answer
  bug is documented in the code). Lowering them would have regressed quality on day one; the ceiling protects cost.
- **Reversed on review (2026-09-25): no browser key on the live site, ever.** I had left `VITE_AI_DIRECT=1` in the
  deploy workflow so George's copy kept working until the server existed. George asked for a secrets check; the
  flag kept a key in his browser's localStorage on github.io. The flag is gone from the workflow, and every build
  without it deletes a stored key on load (`forgetStrayKey`, tested). The flag remains for local development only.
- **Reversed on review: a build with no Supabase config runs as Free (fail closed)**, not Max. A missing or broken
  config must never hand out a paid plan. Tested in `src/auth/useProfile.test.ts`.
- **Only five VITE_ variables can reach the client.** Found on review: `src/env.ts` and the store read
  `import.meta.env` as a whole, which makes Vite inline every VITE_ variable present at build time; a canary
  `VITE_OOPS_ANTHROPIC_KEY` reached the bundle. Every read is now by literal name, and `vite.config.ts` refuses to
  build if any other VITE_ variable is set or any value looks like a secret or a service_role key (tested).
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

- **Referral rewards are a separate column, not a tier change.** `reward_tier`/`reward_until` sit beside the paid
  tier and `effectiveTier` takes the best of paid, trial and reward, so a reward can never overwrite or outlive a
  paid plan, and the Stripe webhook never has to know about invites.
- **The invite is claimed by a database function, not an Edge Function.** `claim_referral` runs as the signed-in
  user with one round trip and no extra deploy; all the checks (own code, already invited, unknown code) are in SQL.
- **The extension reuses the bookmarklet verbatim** in a second delivery mode instead of a second implementation,
  so every guard, every recorded problem and the build stamp stay identical between the two.
- **Auto-sync is gated in the extension by the plan the dashboard tab reports**, and the export still goes through
  the same approval screen. "Nothing to tap" means not having to go to Halo, not skipping the review.

- **The AI surface is one route with four modes, not four rewritten screens.** Tutor, Study kit and Practice keep
  their own code and address parameters; the surface adds the meter line, the mode switch and the lock. A full
  merge would have been weeks of UI for the same outcome.
- **Prompt changes are additive.** Every earlier rule stays, so the fixtures and e2e checks that pin them still
  hold; the procedure and the worked example are what Haiku most benefits from.

- **The client plans notifications, the server only sends.** The schedule logic (capacity, start-by, risk) lives
  in the app and is already tested there; duplicating it in Deno would drift. The server's job is small enough to
  be obviously right: send what is due, drop dead devices.
- **pg_cron over an external scheduler.** It is free, inside the same project, and one SQL file away.

- **The landing page is static HTML in `public/`**, not a second Vite entry: nothing to bundle, nothing to
  break, and the prices in it are pinned to the config by a test.
- **The admin screen is one database function**, not a set of admin policies: one place to check `is_admin`,
  and the client never needs read access to other people's rows.
- **Feedback screenshots are a file the student picks**, not an automatic capture: no rendering library, no
  surprise about what was captured, and it works on a phone.
- **Every Halo sync writes an event row with its platform**, reusing the onboarding events table, so "how often do
  phone-only users sync" is a query, not a new table.

## Extras

Built:
- The seven-day strip on the agenda shows heavy days shaded, from the same capacity math as Load.
- Every item carries its provenance (`SourceBlock`), including the professor's own words when an announcement created or moved it.
- The Sync sheet has a phone tab with the iPhone/Android bookmark steps, since Free is bookmarklet-on-every-device.
- `LockTag` inline plan marker for menus and buttons, alongside `Locked`.
- Meter feed (`onMeter`/`latestMeter`) so any screen can show "used 85% of this month's AI" without a second request.

Not built (noted for later):
- Batch API for announcement backlogs and syllabus passes (the two non-instant kinds). Halves those costs;
  worth it once there are enough accounts for the backlog to matter.
