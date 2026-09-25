# PLAN.md — from personal dashboard to "The planner built for Halo"

Phase 1 deliverable. Nothing below has been built yet. Read the **Decisions I need from you** first; everything after it is the evidence and the build order.

---

## Decisions I need from you

1. **How automatic Halo sync works.** A bookmarklet can only run when you tap it, so "automatic sync" (a Plus feature) needs something that runs on its own. The realistic options are in §4. My recommendation: keep the bookmarklet as the Free manual path on every device, add a Chrome/Edge **extension** for desktop auto-sync, and only if phone auto-sync proves necessary, a server-side sync that holds the student's Halo session token encrypted for as long as Halo keeps it valid (hours), deleted the moment it stops working. That last option is the one that touches "never stored longer than needed", so I want your explicit yes before building it.
2. **Participation items.** The brief says strip them. Two weeks ago you asked me to *show* one when an announcement says what earns the points (the UNV-106 replies case), and that is how it works today. I propose: hidden from Now and the agenda always, but the reply rule still attaches to the class so DQ prompts and reminders know it. Confirm or overrule.
3. **Haiku 4.5 everywhere.** I'll do it as written. Two things were tuned on Sonnet and will get worse: pulling requirements out of announcements, and the coach. I'll re-run the existing fixtures after the switch and report what changed. If extraction quality drops below what you'd pay for, the fallback is a single Sonnet exception for that one job, which would violate the rule, so I'd rather you decide that with data in front of you.
4. **Lecture transcription without a paid API.** The browser's Web Speech API is already wired in. It is reliable on desktop Chrome only, needs the tab open and the mic live, restarts itself after every pause, and sends the audio to Google (free, not private). On iPhone the reliable free path is Apple's own on-device transcription in Voice Memos, which the app already accepts as a paste. I propose leading with those two and not adding a paid transcriber. Paid options and per-minute costs are in §7 if you want them.
5. **Money.** §7 lists everything that costs anything. The one I recommend spending on at launch is Supabase Pro ($25/mo), because free projects pause after a week of inactivity, which would take the product down. I will not add any of it without your yes.
6. **Email reminders** need an email provider. Push notifications do not. I propose shipping push first and adding email only if you approve a provider (§7).

---

## 1. Audit: the app as a brand-new GCU freshman

Fresh browser, phone width, nothing in storage, every screen. This is what a stranger sees, in the order they'd see it.

### Before they do anything
- **It opens on someone else's semester.** Six classes (yours), 181 assignments, and a headline that says **"17 overdue."** The very first screen tells a new student they are failing classes they are not in. There is no empty state; the seed data is your data.
- **No account, no name, no way to make it theirs.** The top bar is Add / Okay? / Check / Sync / gear. None of those words mean anything yet.
- **The Now screen leads with a 25-minute discussion post that was due 15 days ago**, because the seed is stale. The priority logic is right; the input is wrong.

### Trying to connect Halo
- The word "Halo" appears in a button label and nowhere that explains it. Settings is **4,869 px tall on a phone** and the Halo section is fourth, headed "Halo bookmark, fallback" under a paragraph about a `.ics` export from a third-party extension. A stranger cannot tell which of the three sync paths (Sync button, bookmark, Check Halo) is the one to use.
- Settings opens with **"Run supabase/schema.sql once in the project's SQL editor before signing in."** That is a developer instruction on a consumer screen.
- Above the fold in Settings: a **"Possible duplicates 4"** panel with Merge/Keep buttons about assignments the student doesn't have.
- The bookmark install on iPhone is: add any bookmark, edit it, replace its address with a pasted 26,000-character string. It works, and nobody will do it without being walked through it.
- **"Check Halo"** opens a flow that copies a 2,000-word audit prompt to paste into an AI. That was built for you; it has no place in a product.

### The Coach
- The card asks for **an Anthropic API key**. A student does not have one and should never need one. This is the single clearest "built for the author" tell.

### Navigation
- Seven tabs plus Grades wrapped onto a second row at phone width, overlapping the Coach card (visible in the screenshot). Plan and Load are two views of the same numbers. News and Library are empty for a new user with no explanation of what would fill them.
- **Week view**: a column of seven cards where most say "—", chips carry "!" and "▲" marks with no legend, and the coloured bar under each day is unlabelled. The agenda already shows the same week better.
- **Plan tab**: a "time budget" bar, hours by class, and a Level card that reads "0 / 5 — Locked — Locked". Nothing here is actionable.
- **Term view**: useful shape, but it's the fourth calendar tab and reads "16% of the term gone, midpoint Oct 29" as a paragraph.

### Trust
- There is no "last synced" anywhere on Now for a new user except a stale-data warning in orange. An item's detail page has a Halo link only when the sync carried one; there is no "this came from Halo on Sep 24, here is the post" block.

### Copy
- "Okay?" as a button. "Check". "banked". "at stake". Internal vocabulary throughout.

### What's genuinely good and stays
Now's structure (hero → what's due → pace → trust line), the agenda with parts folded into items, month view, Load bar, the priority logic, derived start dates, heavy-day warnings, the visual style, the requirement extraction from announcements, gamification points. These are the product. Everything else is scaffolding around them.

---

## 2. What changes, what gets cut

| Today | Becomes |
|---|---|
| Seed data on first run | Empty state → onboarding flow |
| Anthropic key in the client | Server-side key; AI only through our backend, metered per user |
| Local-first store with optional Supabase mirror | Supabase is the source of truth; local cache for speed and offline reading |
| Now / Calendar / Plan / Load / News / Library / Grades + Settings | **Now / Calendar / Classes / Inbox / You** (5 tabs, phone-first) |
| Calendar: Month, Week, Agenda, Term | Calendar: **Agenda** (default, with a 7-day strip on top) and **Month**. Term becomes a toggle inside Load. **Week view cut.** |
| Plan tab | **Cut.** Time budget moves into Load; points/streak/level move to You. |
| Load | Kept, reached from You and from the heavy-day warning |
| News | **Inbox**: announcements with what each added, plus instructor messages |
| Library (recordings + slides) | Inside each class page; Max feature |
| Grades | Inside each class page + a Grades summary on You; GPA projection is Pro |
| Coach + Tutor + Study kit + Quiz | One **AI** surface (Pro/Max), message-metered |
| Check Halo (audit prompt) | **Cut.** |
| "Okay?" button | Folded into Now's status line |
| ICS import from Better Halo | Kept as "Import a calendar file" under Settings → Advanced |
| Duplicates panel | Auto-merged on sync with undo; no panel |
| Settings (one 4,869 px page) | Account / Halo / Notifications / Study / Classes / Advanced |
| Dark only | Light default, dark and themes are Plus |

**Kept exactly:** priority order (due → time → points), derived start dates, heavy-day warnings, gamification points, the requirement cleaner, the read ledger, the pull tally and failure lines. Participation per decision 2.

---

## 3. Tiers and feature flags

One file: **`src/config/tiers.ts`**. Prices, Stripe price IDs (per environment), daily limits, trial length, referral reward, and the feature→tier map all live there. Nothing else in the codebase knows a price or a limit.

```ts
export const TIERS = ['free', 'plus', 'pro', 'max'] as const;
export const PRICES = { plus: { month: 3.99, year: 29 }, pro: { month: 6.99, year: 49 }, max: { month: 9.99, year: 69 } };
export const STRIPE_PRICE_IDS = { plus: { month: 'price_…', year: 'price_…' }, /* … */ };
export const TRIAL = { tier: 'max', days: 7, card: false };
export const REFERRAL = { reward: 'plus', days: 30, both: true };
export const LIMITS = { aiMessagesPerDay: { free: 0, plus: 0, pro: 15, max: 50 }, aiTokensPerDay: { … }, smartSuggestionDays: { free: 7, plus: Infinity, … } };
export const FEATURES = {
  haloManualSync: 'free', haloAutoSync: 'plus', nowBasic: 'free', nowSmart: 'plus', reminders: 'plus',
  heavyDayWarnings: 'plus', gamification: 'plus', icsFeed: 'plus', themes: 'plus',
  announcementAI: 'pro', syllabusAI: 'pro', gradeProjection: 'pro', aiChat: 'pro', examPlans: 'pro',
  lectures: 'max', flashcards: 'max', weeklyRecap: 'max', earlyAccess: 'max',
} as const;
```

- `can(feature, user)` in the client for showing/locking UI; the same table is imported by every Edge Function, which **rejects** a call the tier doesn't allow. Client checks are for UX; server checks are the enforcement.
- `<Locked feature>` wraps a locked control: shows the feature, one sentence on what it does, one tap to the upgrade sheet. Never on Free's core screens.
- Trial: every new account gets `max` for 7 days with no card, then `free`. The You tab shows days left.
- "Limited to current week's smart suggestions" on Free = Now shows work due within 7 days and start-by suggestions only for that window.

---

## 4. Halo connection: the decision that shapes everything

The bookmarklet works because it runs *inside* the student's Halo tab, with their session. Nothing can sync without either that tab or their session token.

| Path | Auto sync? | Devices | Token leaves the browser? | Effort |
|---|---|---|---|---|
| **Bookmarklet** (today) | No — only when tapped | All, but iPhone install is ~6 taps | No | Done |
| **Browser extension** | Yes, while the browser is open | Desktop Chrome/Edge only | No | Medium; Chrome Web Store review ~1 week |
| **Server sync with the student's Halo session token** | Yes, on our schedule | All | **Yes** — encrypted at rest, used until Halo expires it, then deleted | Medium; needs decision 1 |

What I'd build, in order: bookmarklet with a proper walkthrough (Phase 4) → extension (Phase 5, alongside payments, since it's what Plus is buying) → server-token sync only if onboarding data shows phone-only students can't get value. The Halo token expiry is not yet measured; I'll measure it during Phase 3 and put the number in this file.

Trust indicators (all tiers): "Synced from Halo · 8 min ago" in Now's header and on each class; every item's detail shows **Source: Halo assignment · pulled Sep 24 · [Open in Halo]**, and for anything an announcement created or changed, the post it came from, quoted, with a link. Both already have the data behind them (`haloId`, `url`, `origin`, the read ledger); it's UI.

---

## 5. AI rules, implemented

- **`src/ai/model.ts`** exports `MODEL = 'claude-haiku-4-5-20251001'`. **`src/ai/model.test.ts`** reads every file in the repo (src, scripts, supabase, docs) and fails if any string matching `claude-[a-z0-9.-]+` appears anywhere other than that constant. Today there are 15 occurrences of `claude-sonnet-4-6` across 7 files; all go.
- **One wrapper, server-side:** `supabase/functions/ai/` takes `{kind, input}`, checks the user's tier and today's usage, sets `max_tokens` per kind from config, applies `cache_control` to the system prompt and the per-user context block, calls Haiku, logs `{user, day, kind, in, out, cached, cost}` to `usage_log`, and returns the tool output. The client never holds a key. The 13 client-side call sites become calls to this function.
- **Batch API** for overnight work: announcement extraction and syllabus ingestion for users on auto-sync run as a nightly batch (50% cheaper); anything a user triggers runs live.
- **Never on page load:** the auto-read after sync is a user action (they pressed Sync) or a scheduled job; nothing fires from a route change. A test asserts no AI call originates from a `useEffect` without a user event.
- **Limits** per tier per day from `LIMITS`, enforced in the function, surfaced in the client as "12 of 15 today".

---

## 6. Data model

New or changed Supabase tables (all with RLS `auth.uid() = user_id`):

| Table | Purpose |
|---|---|
| `profiles` | tier, `trial_ends_at`, `stripe_customer_id`, referral code, onboarding step, study-time prefs |
| `terms` | one row per term: start, end, weeks (7 / 8 / 15), which classes |
| `courses`, `items`, `settings` | exist; `items` gains `requirements`, `origin`, `date_change`, `rubric`, `feedback` as JSONB |
| `announcements` | per user, with text; replaces IndexedDB as source of truth |
| `read_ledger` | post id + content hash + read time; the never-read-twice guarantee, now durable across devices |
| `usage_log` | user, day, kind, tokens in/out/cached, cost — feeds the admin margin numbers |
| `subscriptions` | Stripe subscription state, written only by the webhook |
| `push_subscriptions`, `notification_prefs` | endpoints and per-type on/off + quiet hours |
| `onboarding_events` | step entered / completed / skipped, with timestamps — the drop-off funnel |
| `referrals` | who invited whom, reward granted |
| `feedback` | screen, text, optional screenshot path, user |
| `recordings` | metadata + transcript + notes; **audio stays on the device** (too large, and nothing needs it after transcription) |

Your existing data: an export/import step in Phase 2 moves it into your account so nothing you have is lost.

Delete-my-account: one Edge Function that removes every row above, the Stripe customer, and storage objects, then the auth user. Export: a JSON of the same.

---

## 7. What costs money

| Item | Cost | When needed | Recommend |
|---|---|---|---|
| Supabase Pro | $25/mo | Launch (free tier pauses after 7 idle days) | **Yes** |
| Stripe | 2.9% + 30¢ per charge, no fixed fee | Phase 5 | Yes (no fixed cost) |
| Anthropic, Haiku 4.5 | $1 / M input, $5 / M output; caching cuts input ~90% on repeats | Phase 2 onward | Yes — estimates below |
| Domain | ~$12/yr | Landing page / Phase 8 | Yes |
| Email provider (Resend) | Free to 3k emails/mo, then $20/mo | Only if email reminders ship | Decision 6 |
| Google OAuth client, web push (VAPID), Meta Pixel, GitHub Pages | Free | — | — |
| Paid transcription, if Web Speech isn't enough | Deepgram ~$0.0043/min, AssemblyAI ~$0.0037/min, OpenAI Whisper $0.006/min (a 75-min lecture ≈ 30–45¢) | Not proposed | Decision 4 |
| Chrome Web Store developer registration | $5 once | If the extension ships | With decision 1 |

**AI cost per user per month, worst case at the daily cap, Haiku with caching:**

| Tier | Driver | Est. | Price | Margin |
|---|---|---|---|---|
| Pro | 15 chat msgs/day + nightly parsing | ~$1.50–2.50 | $6.99 | fine |
| Max | 50 chat msgs/day + 3 lectures/wk + recaps | ~$5–8 | $9.99 | **thin at heavy use** — the 50/day cap is what protects it; I'll show real numbers in the admin dashboard before we price-adjust |

---

## 8. Build order

Each phase ends with: `npm test`, `tsc --noEmit`, lint (eslint added in Phase 2 — there is none today), the e2e scripts that cover the touched surfaces, a deploy, and a short summary before continuing. Costs are asked for before they're incurred.

**Phase 2 — Foundations.** Supabase auth (email magic link + Google), RLS on every table, `tiers.ts`, feature flags + `<Locked>`, the single AI Edge Function on Haiku with caching, max tokens, and usage logging, the model-string test, eslint, an RLS test that logs in as two users and proves each sees only their own rows (runs against a local Supabase in CI), your data migrated into your account. No visible product change yet.

**Phase 3 — Core makeover.** The 5-tab structure, empty states everywhere, Now rebuilt on the new nav with "Synced · X ago" and source blocks on items, Agenda-with-week-strip replaces Week, Plan folded away, Classes tab (per-class page: everything for it, grade so far, next due), Inbox, You (points, streak, term bar, Load, Grades summary), Settings split, light theme default. Halo token expiry measured.

**Phase 4 — Onboarding.** Welcome + 3-screen tour → sign up → connect Halo (animated 4-step walkthrough, phone and desktop variants, "having trouble?" path) → semester populated with a celebration → quick preferences → land on Now with a 3-stop tooltip tour. Skip on every step, progress bar, "Redo setup" in Settings, every step logged to `onboarding_events`. Semester setup wizard and 7/8/15-week terms.

**Phase 5 — Payments and tiers.** Stripe Checkout (monthly/annual, "2 months free"), customer portal, webhook → `subscriptions`, 7-day Max trial, grace period on failed payment, referral codes, upgrade sheets on locked features. The extension for Plus auto-sync (per decision 1).

**Phase 6 — Pro and Max AI.** Announcement and syllabus reading moved to the server (nightly batch for auto-sync users), grade tracker + "what do I need on the final", AI chat with per-tier limits, exam study plans, lecture notes/flashcards/practice from Web Speech or pasted transcripts, weekly recap.

**Phase 7 — Notifications and PWA.** Installable, service worker, web push; morning brief at a chosen time, heavy-day heads-up the night before, not-started nudges at 2 days, quiet hours, every type switchable. Email only per decision 6.

**Phase 8 — Landing page, Pixel, admin, feedback.** Marketing page at the domain root (headline "The planner built for Halo", 3 benefits, screenshots, pricing table, FAQ, sign-up; the not-affiliated disclaimer in the footer and the sign-up screen; no GCU marks), Meta Pixel with PageView / CompleteRegistration / StartTrial / Purchase, admin dashboard (users by tier, trial conversion, MRR, AI cost per user, margin per tier, onboarding funnel, feature use, feedback inbox), feedback button on every screen with optional screenshot, privacy policy and terms drafts.

---

## 9. Risks I want on the record

- **Halo changes its API** and the sync breaks for everyone at once. Mitigation: the sync already records every failure with Halo's own error; the admin dashboard will surface a spike, and the bookmarklet's build stamp lets us push a fix that users pick up on next tap.
- **Haiku quality** on extraction (decision 3).
- **Max margin** at the cap (§7).
- **The iPhone bookmarklet** is the weakest step in onboarding; Phase 4's funnel numbers will say how weak, and decision 1 is the answer if it's bad.
- **Existing behaviour I'm changing on your account:** participation (decision 2), the Coach's model, and the Check Halo flow going away. Everything else you use daily is kept.
