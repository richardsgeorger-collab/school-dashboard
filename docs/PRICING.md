# Pricing: the tier map, a free plan, and the trial

Written 2026-09-26 for George. Nothing here changed a live price; the switches it describes are OFF or as he
specified. Research sources are at the end.

## 1. The tier map as it stands in code (`src/config/tiers.ts`)

| | Free | Plus $3.99 / $29 yr | Pro $6.99 / $49 yr | Max $9.99 / $69 yr |
|---|---|---|---|---|
| Halo sync (bookmark), month + agenda, Now, add anything by hand | ✓ | ✓ | ✓ | ✓ |
| Auto-sync (extension schedule), Now ranks the whole term (Free: this week), reminders + push, heavy-day warnings, points/streaks/badges, calendar feed (.ics) | | ✓ | ✓ | ✓ |
| **Announcement reading** (hidden requirements onto assignments), syllabus/rubric reading, grade projection, **coach + tutor** (10 messages/day), exam study plans | | | ✓ | ✓ |
| **Lecture transcripts → notes** (10/week), **flashcards + practice**, Sunday recap, accent colours (gold for everyone else), early access; coach 30/day | | | | ✓ |
| Monthly AI ceiling | $0 | $0.75 | $2.50 | $4.00 |

So today: a free plan exists in code and is what an account drops to; the "wow" AI features are split across Pro
(announcements, coach) and Max (lectures, study kits). The prompt panel and the tutor are part of the coach (Pro).

## 2. Is the map fuzzy? Yes. A clean one.

The middle is the problem. Pro holds the single most valuable feature (announcement reading) and the coach, so Max
has little left to sell but lectures. A student comparing Pro and Max sees two AI plans and cannot say why one is
$3 more. The clean shape, as you suggested, puts every "wow" in Max:

| | **Free** (switch, see §3) | **Plus** $3.99 / $29 | **Max** $9.99 / $69 |
|---|---|---|---|
| Halo sync, Now, calendar, add by hand, one theme toggle | ✓ | ✓ | ✓ |
| Sync-on-open extension, Now for the whole term, reminders + push, heavy-day warnings, points/streaks, calendar feed, grade projection | | ✓ | ✓ |
| Announcement reading, coach + tutor + prompt panel, study kits (flashcards, practice), exam plans, lecture transcripts → notes, Sunday recap | | | ✓ |
| AI ceiling | $0 | $0 | $4.00 |

Two paid tiers, one line each: Plus is *the planner, everywhere, on its own*; Max is *it reads and thinks for you*.
Pro's price id stays in Stripe (nothing is deleted) but the plan is hidden. **This is a proposal; the live map is
unchanged until you say so.** If you want a $5.99–6.99 middle, the only honest content for it is "announcement
reading only" (the single feature students would pay for alone); everything else in Max is what makes the reading
worth having.

## 3. A free plan: recommendation

**Yes, and the switch is built (`FREE_PLAN_ENABLED`, OFF).** Reasoning:

- **More people try it.** Per-install paid conversion is higher behind a hard paywall (RevenueCat 2026: 10.7% vs
  2.1% at day 35), but only because the paywall filters who installs. For a campus app spread by word of mouth
  the top of the funnel is everything: a freshman shows a roommate; the roommate will not enter a card to look.
  Notion Plus is free for students and MyStudyLife is free with caps, so "free to plan" is the expectation a GCU
  freshman arrives with. Shovel charges $39/yr for exactly our free layer (LMS sync + planner), which makes free
  a sharp differentiator, not a giveaway.
- **What free should be.** The non-AI core: Halo sync (bookmark or extension), Now, agenda and month, add by hand,
  the theme toggle. No AI, no push, no term-long ranking. Genuinely useful (it is the whole planner), clearly
  limited (every announcement stays unread; the locked cards say "You have 56 announcements Max would read").
- **What each free user costs.** Close to nothing: Supabase free tier holds the rows, push is not on free, and
  there are no AI calls (the ceiling is $0). The only per-user costs are AI; free never incurs them.
- **Do they stay free for ever?** Some will, and that is fine: they cost nothing and they recruit. The pull up is
  the trial (§4) offered at the moment the app has just proved itself (first sync), then honest locked previews
  with their own real counts, then the day-before-end receipt. Freemium converts 2–5% over a long tail; a
  no-card trial converts ~9–18% of starters. Both paths are open to a free user.
- **Why the switch is OFF today.** With it off, an account that has used its trial and pays for nothing is asked
  to pick a plan before it syncs again (its data stays, nothing is hidden, the ask is one calm card). That is the
  "Basic $3.99 paywall". Flip it to ON when you have read this; nothing else changes.

## 4. The trial

Built as specified: five days of Max, no card, nothing charges, one per account tracked server-side
(`start_trial()`), started on purpose at the first-sync payoff, on any locked Max feature, or from You/plans, with
the same sentence everywhere: *Free for 5 days. No card. Nothing charges.* During it, receipts ("Max this week:
read 23 announcements, found 4 hidden requirements"); the evening before it ends, one reminder; after it, a
graceful downgrade with honest previews.

**One thing the data argues with (a proposal, not done): five days is short for this product.** Trial-to-paid
medians are 25.5% for trials of four days or fewer, 37.4% for five to nine, 42.5% for 17–32; Motion's AI needs
1–2 days to calibrate and our reader needs a week of professor posts to show its value. Ten days would let a
student see two weekly announcement cycles. If you agree, it is one number (`TRIAL.days`) and the SQL interval.

## 5. Prices

Unchanged. For reference: Education apps' medians are $9.99/mo and $44.99/yr; student planners cluster at
$39–40/yr (Shovel $39, MyStudyLife $39.99) and sell mostly annual. Our $69/yr for Max is above the cluster; a
$49–59 annual (or a $24.99 semester pass, which is how students think about time) would sit in it. Proposal only.

## Sources
MyStudyLife MSL+ page and App Store listing; Shovel pricing; Todoist billing/education pages; Notion pricing and
education help; Structured, Motion, Amie, Power Planner, iStudiez pages; RevenueCat *State of Subscription Apps
2026* (overall and Education), RevenueCat trial-length and reverse-trial posts; ChartMogul SaaS conversion 2026;
First Page Sage trial benchmarks; Amplitude on reverse trials. Full list in the research transcript
(`docs/PRICING-sources.md`).
