/**
 * THE ONE PLACE prices, limits, trials and feature gating live. Nothing else in the app or the server knows a price
 * or a cap. Change a number here and it changes everywhere, client and Edge Functions alike: `scripts/sync-shared.mjs`
 * copies this file to `supabase/functions/_shared/` and a test fails if the copies drift.
 *
 * Money is in dollars. Time is in days unless the name says otherwise.
 */

/**
 * The plans (George, 2026-09-28; Free kept current from 2026-10-25, Loop 268). Free: what Halo already shows, kept
 * current: Halo sync whenever the student is on Halo (the extension) or any time with Sync now, Halo's due dates,
 * points and grades, the GPA, Now, Calendar, Classes and This week on Halo. Plus: what only Halo+ does: every
 * announcement read for you, background auto-sync every 3 hours, every reminder and the Sunday preview, the calendar
 * feed. Max: everything in Plus and every AI study tool, plus the colour picker. `pro` is retired: it is no longer sold and has nothing of its own; it stays in the
 * list only so an old row still reads (it ranks above Plus, so it keeps Plus).
 */
export const TIERS = ['free', 'plus', 'pro', 'max'] as const;
export type Tier = (typeof TIERS)[number];
/** The plans that are sold. */
export type Paid = 'plus' | 'max';
export const PAID: readonly Paid[] = ['plus', 'max'];

export const TIER_NAMES: Record<Tier, string> = { free: 'Free', plus: 'Plus', pro: 'Plus', max: 'Max' };

/**
 * Billing intervals. Only what is in OFFERED_INTERVALS is shown or sold: monthly, as set by George on 2026-09-28. To
 * offer a semester again, add 'semester' to OFFERED_INTERVALS with its price below and its Stripe price id; the
 * checkout function, the webhook mapping and the plans card already take any offered interval.
 */
export type Interval = 'month' | 'semester';
export const OFFERED_INTERVALS: readonly Interval[] = ['month'];
export const PRICES: Record<Paid, { month: number } & Partial<Record<Interval, number>>> = {
  plus: { month: 4.99 },
  max: { month: 7.99 },
};
/** The intro offer: the first month, a Stripe coupon at checkout; the base price is unchanged. Max $2.99 (2026-10-09),
 * Plus $0.99 (2026-10-27). One per account (supabase/functions/_shared/intro.ts holds the coupons). */
export const INTRO_FIRST_MONTH: Record<Paid, number> = { plus: 0.99, max: 2.99 };

/** Said right beside every price. */
export const CANCEL_LINE = 'Cancel anytime';
/** Beside every price too (George, 2026-09-30): prices are before tax, and Stripe adds sales tax at checkout where it applies. */
export const TAX_LINE = 'plus tax where applicable';

/** Stripe price ids (sandbox, test mode; Max created 2026-09-28, Plus $4.99 on 2026-09-29). At launch, replace with the live ids. */
export const STRIPE_PRICE_IDS: Record<Paid, { month: string } & Partial<Record<Interval, string>>> = {
  plus: { month: 'price_1UKvq702Mu8IT856LfKkvowe' },
  max: { month: 'price_1UKnhj02Mu8IT8560rhi1cqG' },
};

/**
 * Live-mode price ids, used when STRIPE_SECRET_KEY is a live key (sk_live_/rk_live_). Filled in by
 * scripts/stripe-live-setup.mjs; while they are placeholders, a live key refuses checkout instead of selling.
 */
export const STRIPE_LIVE_PRICE_IDS: Record<Paid, { month: string } & Partial<Record<Interval, string>>> = {
  plus: { month: 'price_1ULCTR0OWuzOLCGMRBVW4GUL' },
  max: { month: 'price_1ULCTS0OWuzOLCGMr48BCHLp' },
};

/** Sandbox prices from before 2026-09-28, so a subscription made on one still maps to a plan. Never offered. */
export const LEGACY_PRICE_IDS: Record<string, { tier: Tier; interval: Interval }> = {
  price_1UJPwl02Mu8IT856d8uZS8PC: { tier: 'plus', interval: 'month' },
  price_1UJPwm02Mu8IT856Eb3nwA2d: { tier: 'plus', interval: 'semester' },
  price_1UJPwn02Mu8IT856KmnOWttp: { tier: 'pro', interval: 'month' },
  price_1UJPwn02Mu8IT856L2DuH6t0: { tier: 'pro', interval: 'semester' },
  price_1UJPwp02Mu8IT8564INq2yEE: { tier: 'max', interval: 'month' },
  price_1UJPwp02Mu8IT856WwAw4KUl: { tier: 'max', interval: 'semester' },
  // The semester prices of 2026-09-28, archived the same day when semester billing was dropped.
  price_1UKnhj02Mu8IT856cgQOZCPQ: { tier: 'plus', interval: 'semester' },
  price_1UKnhk02Mu8IT8562vcNgnpi: { tier: 'max', interval: 'semester' },
  // Plus at $3.99 a month, archived 2026-09-29 when Plus became $4.99.
  price_1UKnhi02Mu8IT856sbzY0nNw: { tier: 'plus', interval: 'month' },
};

/**
 * The trial (George, 2026-09-28, second version): new accounts start on Free. Seven days of Max, no card, once per
 * account, started only when the student chooses it (onboarding's offer, or any "Try everything free" button later). It is Max, which covers everything in Plus.
 * Reminders go two days before it ends and the morning of the last day. Every sentence about the trial comes from
 * here so the offer, the chip, the reminders and the ending never say different things.
 */
export const TRIAL = {
  tier: 'max' as Tier,
  days: 7,
  /** Days of use (2026-10-22): a day counts when Halo+ is opened; never past 30 calendar days after the first sync. */
  capDays: 30,
  /** Days before the end on which a reminder goes: two days before, and the last day itself (0). */
  remindDaysBefore: [2, 0] as const,
  cardRequired: false,
  /** The offer, word for word, wherever a student who has not tried it sees a locked feature (George, 2026-09-29). */
  offer: 'Try everything free for 7 days of use. No card.',
  /** The trial screen's headline and the bold line right under it. */
  headline: 'Try everything free for 7 days of use.',
  promise: 'No card. Nothing to cancel. Nothing charges.',
  /** The one honest line under every button that starts it. */
  after: 'A day counts when you open Halo+. After 7 days of use (or 30 days, if that comes first) you go back to Free and choose if you want to keep anything.',
  /** Short form beside small buttons. */
  line: '7 days of use, free. No card. Nothing charges.',
  /** What a button that starts it says. */
  button: 'Try everything free for 7 days of use',
  buttonShort: 'Try it free',
};

/**
 * Accounts that were already syncing Halo on the free plan before 2026-09-28 keep sync until the end of the current
 * term (profiles.legacy_sync_until, set by migration 0010), then follow the plans above. They are told once.
 */
export const LEGACY_SYNC_NOTE = 'Halo sync is now part of Plus. You were already syncing, so it stays on for you until';

/** After a failed payment the tier is kept this long before dropping to Free. */
export const GRACE_DAYS = 7;

/** Invite a friend: both get Plus for a month (Plus reads every announcement and syncs on its own). */
export const REFERRAL = { rewardTier: 'plus' as Tier, days: 30, both: true };

/** Per-day and per-week caps. `null` means unlimited. */
export const LIMITS = {
  /** AI chat messages a day (the coach): Max only, 30. */
  aiMessagesPerDay: { free: 0, plus: 0, pro: 0, max: 30 } as Record<Tier, number>,
  /** Lectures processed a week (transcript → notes). */
  lecturesPerWeek: { free: 0, plus: 0, pro: 0, max: 10 } as Record<Tier, number>,
  /** How far ahead Now's smart suggestions look. Free sees this week only. */
  smartSuggestionDays: { free: 7, plus: null, pro: null, max: null } as Record<Tier, number | null>,
};

/**
 * Hard monthly ceiling on what a student may cost in AI, in dollars, per tier. Tracked from real usage. At
 * AI_WARN_AT they get a heads-up; at 100% AI features pause until the first of next month. No student ever costs more
 * in AI than they pay.
 */
// Free's is only for the kinds-only announcement check (about $0.0002 a post on Haiku 5.5, so about 500 posts a month).
export const AI_CEILING_USD: Record<Tier, number> = { free: 0.1, plus: 0.75, pro: 0.75, max: 4.0 };
export const AI_WARN_AT = 0.8;

/**
 * Every AI call has a hard output cap, per kind of call. Nothing runs without one. The wrapper takes the lower of what
 * a caller asks for and this. Adaptive thinking spends from the same cap, which is why the reasoning passes are large.
 */
export const MAX_TOKENS = {
  coach: 4000,
  tutor: 1500,
  announcement: 4000,
  class_plan: 12_000,
  term_plan: 12_000,
  lecture: 4000,
  study: 6000,
  quiz: 4000,
  worksheet: 6000,
  brief: 1500,
  draft: 1500,
  method: 1500,
  links: 2500,
  audit: 12_000,
  needs: 1200,
  /** Free's look at an announcement: which assignment it changed and how, nothing more (announcementPeek). */
  changes: 600,
  recap: 1500,
  other: 1000,
} as const;
export type AiKind = keyof typeof MAX_TOKENS;

/** Which feature each kind of AI call belongs to, so the meter can gate it by tier. */
export const AI_KIND_FEATURE: Record<AiKind, Feature> = {
  coach: 'aiChat',
  tutor: 'aiChat',
  brief: 'aiChat',
  draft: 'aiChat',
  method: 'aiChat',
  announcement: 'announcementAI',
  needs: 'announcementAI',
  changes: 'announcementPeek',
  audit: 'announcementAI',
  class_plan: 'syllabusAI',
  term_plan: 'syllabusAI',
  links: 'syllabusAI',
  lecture: 'lectures',
  study: 'flashcards',
  quiz: 'flashcards',
  worksheet: 'flashcards',
  recap: 'weeklyRecap',
  other: 'aiChat',
};

/** Kinds that count against the daily message cap. */
export const MESSAGE_KINDS: readonly AiKind[] = ['coach', 'tutor', 'brief', 'draft', 'method', 'other'];

/** The lowest tier that has each feature. Nothing is Pro any more (see TIERS). */
export const FEATURES = {
  // Free: what a syllabus and your own hands can build.
  syllabusDrop: 'free',
  manualItems: 'free',
  monthView: 'free',
  agendaView: 'free',
  nowBasic: 'free',
  // Free since 2026-10-25 (Loop 268): Halo sync when the student syncs or is on Halo, and Halo's own grades. A Free
  // planner that froze at the trial's end lost the students it was meant to keep.
  haloManualSync: 'free',
  haloGrades: 'free',
  // Free sees that an announcement changed something (the kind, never the details): "see it with Plus".
  announcementPeek: 'free',
  // Plus: what only Halo+ does. Auto-sync is Plus and Max (George, 2026-10-04): in the background, every 3 hours.
  haloAutoSync: 'plus',
  announcementAI: 'plus',
  nowSmart: 'plus',
  reminders: 'plus',
  heavyDayWarnings: 'plus',
  weeklyRecap: 'plus',
  gradeProjection: 'plus',
  gamification: 'plus',
  icsFeed: 'plus',
  // Max: every AI study tool, and your colour.
  aiChat: 'max',
  promptPanel: 'max',
  flashcards: 'max',
  examPlans: 'max',
  lectures: 'max',
  syllabusAI: 'max',
  themes: 'max',
  earlyAccess: 'max',
} as const satisfies Record<string, Tier>;
export type Feature = keyof typeof FEATURES;

/** One line per feature for the upgrade sheet. What it does, not what it is called. */
export const FEATURE_LINES: Record<Feature, string> = {
  syllabusDrop: 'Drop a syllabus PDF and every assignment lands on your calendar.',
  manualItems: 'Add anything by hand.',
  monthView: 'See the month at a glance.',
  agendaView: 'Your work, day by day.',
  nowBasic: 'What to do right now.',
  haloManualSync: "Halo syncs whenever you're on Halo (the Chrome extension), or any time with Sync now.",
  haloAutoSync: "Auto-sync: Halo syncs on its own every 3 hours while Chrome is open, even when you're not on Halo.",
  haloGrades: "Halo's real grades, exactly as Halo shows them, and your GPA.",
  announcementPeek: 'A heads-up when an announcement changed a due date or added a step.',
  announcementAI: 'Every announcement read for you: hidden due dates, moved dates and extra steps, put on the assignment.',
  nowSmart: 'Now ranks everything by due date, time it takes, and points, all term long.',
  reminders: 'A morning note with your day, and a nudge before something slips.',
  heavyDayWarnings: 'A heads-up the night before a heavy day, while there is still time.',
  weeklyRecap: 'Sunday: what you finished, what is coming, where you are behind.',
  gradeProjection: 'What you need on the rest of the term.',
  gamification: 'Points, streaks, and a bar that shows the term filling in.',
  icsFeed: 'Your deadlines in Google Calendar, Apple Calendar or Outlook, kept up to date.',
  aiChat: 'Ask anything about your classes: what to do next, what a professor wants, how a topic works, from your own slides and announcements.',
  promptPanel: 'A ready-made prompt for any assignment, built from its rubric and announcements.',
  flashcards: 'Practice for any quiz or exam: a study plan, a worksheet with answers, quiz me, flashcards, all from your own class material.',
  examPlans: 'A study plan for your next quiz or exam, spread over the days before it.',
  lectures: 'Paste or record a lecture, get notes and the key points.',
  syllabusAI: 'Reads syllabi and rubrics into real start dates and prep steps.',
  themes: 'Your colour: pick the accent the whole app wears.',
  earlyAccess: 'New features first.',
};

/** What each paid plan is, in the words every price card, locked message and the landing page share. */
export const PLAN_LINES: Record<'free' | Paid, string[]> = {
  free: ["Halo syncs whenever you're on Halo", "Due dates, points and grades as Halo shows them, and your GPA", 'Now, Calendar, Classes, and This week on Halo', 'A heads-up when an announcement changed a due date or added a step'],
  plus: ['Every announcement read for you: hidden due dates, moved dates, extra steps', "Auto-sync every 3 hours, even when you're not on Halo", 'Reminders: a morning note and a nudge before something slips', 'The Sunday preview and your deadlines in Google or Apple Calendar'],
  max: ['Everything in Plus, auto-sync included', 'Ask: a study partner that knows your classes, slides and announcements', 'Practice: study plans, worksheets with answers, quiz me, flashcards', 'Check my work against the rubric, lecture notes, your own colour'],
};

/** "part of Plus": the plan a feature is in, for every locked line, so no message ever names a plan by hand. */
export const planOf = (feature: Feature): string => TIER_NAMES[FEATURES[feature]];
