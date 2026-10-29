/**
 * THE ONE PLACE prices, limits, trials and feature gating live. Nothing else in the app or the server knows a price
 * or a cap. Change a number here and it changes everywhere, client and Edge Functions alike: `scripts/sync-shared.mjs`
 * copies this file to `supabase/functions/_shared/` and a test fails if the copies drift.
 *
 * Money is in dollars. Time is in days unless the name says otherwise.
 */

/**
 * The plans (George, 2026-10-29: two plans, Free and Max; the rule: anything that costs AI tokens is Max, plus
 * auto-sync). Free: everything on Halo's pages (the extension's whole set), syncing whenever the student is on Halo or
 * presses Sync now, Halo's grades and the GPA, grade projection, Now, Calendar, Classes, the locked "an announcement
 * changed something" heads-up, the help kit, the colour picker. Max ($0.99 a month): every announcement read for you
 * (moved and hidden due dates, extra steps, the notes on Halo), auto-sync every 3 hours, reminders and the Sunday
 * preview, the calendar feed, and every AI study tool (Practice, Check my work, the AI brief, lecture notes, the AI
 * syllabus pass). Ask is gone. `plus` and `pro` are retired: no longer sold; they stay in the list only so an old row
 * still reads, and they count as Max (effectiveTier, plan_of), so nobody who paid for either loses anything.
 */
export const TIERS = ['free', 'plus', 'pro', 'max'] as const;
export type Tier = (typeof TIERS)[number];
/** The plan that is sold. */
export type Paid = 'max';
export const PAID: readonly Paid[] = ['max'];

export const TIER_NAMES: Record<Tier, string> = { free: 'Free', plus: 'Max', pro: 'Max', max: 'Max' };

/**
 * Billing intervals. Only what is in OFFERED_INTERVALS is shown or sold: monthly, as set by George on 2026-09-28. To
 * offer a semester again, add 'semester' to OFFERED_INTERVALS with its price below and its Stripe price id; the
 * checkout function, the webhook mapping and the plans card already take any offered interval.
 */
export type Interval = 'month' | 'semester';
export const OFFERED_INTERVALS: readonly Interval[] = ['month'];
/** Max at $0.99 a month (George, 2026-10-29). No intro offer any more: the price is the price. */
export const PRICES: Record<Paid, { month: number } & Partial<Record<Interval, number>>> = {
  max: { month: 0.99 },
};

/** Said right beside every price. */
export const CANCEL_LINE = 'Cancel anytime';
/** Beside every price too (George, 2026-09-30): prices are before tax, and Stripe adds sales tax at checkout where it applies. */
export const TAX_LINE = 'plus tax where applicable';

/**
 * The price Max sells at, found in Stripe by its lookup key (2026-10-29), in test and live mode alike: the checkout
 * asks Stripe for the active price with this key, so the code went live before the price was made, and a new price
 * later only moves the key.
 */
export const MAX_PRICE_LOOKUP_KEY = 'halo_max_month';

/**
 * Prices that are no longer sold but may be on a subscription, so every one still maps to a plan. Each counts as Max
 * now (Plus and Max at their old prices, 2026-10-29), so nobody on one ever drops to Free.
 */
export const LEGACY_PRICE_IDS: Record<string, { tier: Tier; interval: Interval }> = {
  // Sandbox Plus $4.99 and Max $7.99 (2026-09-28/29) and live Plus $4.99 and Max $7.99 (archived 2026-10-29).
  price_1UKvq702Mu8IT856LfKkvowe: { tier: 'max', interval: 'month' },
  price_1UKnhj02Mu8IT8560rhi1cqG: { tier: 'max', interval: 'month' },
  price_1ULCTR0OWuzOLCGMRBVW4GUL: { tier: 'max', interval: 'month' },
  price_1ULCTS0OWuzOLCGMr48BCHLp: { tier: 'max', interval: 'month' },
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
export const LEGACY_SYNC_NOTE = 'Halo sync is free on every plan. It stays on for you after';

/** After a failed payment the tier is kept this long before dropping to Free. */
export const GRACE_DAYS = 7;

/** Invite a friend: both get 30 days of Max (2026-10-29; it was Plus). */
export const REFERRAL = { rewardTier: 'max' as Tier, days: 30, both: true };

/** Per-day and per-week caps. `null` means unlimited. */
export const LIMITS = {
  /** Assignment checks a day (the AI brief, Check my work's draft and method): Max, 30. */
  aiMessagesPerDay: { free: 0, plus: 30, pro: 30, max: 30 } as Record<Tier, number>,
  /** Lectures processed a week (transcript → notes). */
  lecturesPerWeek: { free: 0, plus: 10, pro: 10, max: 10 } as Record<Tier, number>,
  /** How far ahead Now's smart suggestions look. Free sees this week only. */
  smartSuggestionDays: { free: 7, plus: null, pro: null, max: null } as Record<Tier, number | null>,
};

/**
 * Hard monthly ceiling on what a student may cost in AI, in dollars, per tier. Tracked from real usage. At
 * AI_WARN_AT they get a heads-up; at 100% AI features pause until the first of next month. No student ever costs more
 * in AI than they pay.
 */
// Free's is only for the kinds-only announcement check (about $0.0002 a post on Haiku 5.5, so about 500 posts a month).
// Free's only AI call is the locked heads-up's small check (2026-10-29, George: kept, with its cap and rate limit).
export const AI_CEILING_USD: Record<Tier, number> = { free: 0.05, plus: 4.0, pro: 4.0, max: 4.0 };
export const AI_WARN_AT = 0.8;

/**
 * Every AI call has a hard output cap, per kind of call. Nothing runs without one. The wrapper takes the lower of what
 * a caller asks for and this. Adaptive thinking spends from the same cap, which is why the reasoning passes are large.
 */
export const MAX_TOKENS = {
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
  /** Free's look at an announcement: which assignment it changed and how, nothing more (announcementPeek). */
  changes: 600,
} as const;
export type AiKind = keyof typeof MAX_TOKENS;

/** Which feature each kind of AI call belongs to, so the meter can gate it by tier. */
export const AI_KIND_FEATURE: Record<AiKind, Feature> = {
  brief: 'aiWork',
  draft: 'aiWork',
  method: 'aiWork',
  announcement: 'announcementAI',
  changes: 'announcementPeek',
  class_plan: 'syllabusAI',
  term_plan: 'syllabusAI',
  links: 'syllabusAI',
  lecture: 'lectures',
  study: 'flashcards',
  quiz: 'flashcards',
  worksheet: 'flashcards',
};

/** Kinds that count against the daily cap (an assignment's brief and checks). */
export const MESSAGE_KINDS: readonly AiKind[] = ['brief', 'draft', 'method'];

/** The lowest tier that has each feature: Free or Max (2026-10-29). */
export const FEATURES = {
  // Free: what a syllabus and your own hands can build, and everything Halo shows, kept current.
  syllabusDrop: 'free',
  manualItems: 'free',
  monthView: 'free',
  agendaView: 'free',
  nowBasic: 'free',
  haloManualSync: 'free',
  haloGrades: 'free',
  // The one AI call on Free: that an announcement changed something (the kind, never the details): "see it with Max".
  announcementPeek: 'free',
  // Free by the rule (no AI): what you need on the rest of the term, your colour, the help kit, Halo+ on Halo's pages.
  gradeProjection: 'free',
  themes: 'free',
  helpKit: 'free',
  onHalo: 'free',
  // Max: what costs AI tokens, and auto-sync with what works while you are away (reminders, the Sunday preview, the
  // calendar feed).
  haloAutoSync: 'max',
  announcementAI: 'max',
  reminders: 'max',
  weeklyRecap: 'max',
  icsFeed: 'max',
  flashcards: 'max',
  examPlans: 'max',
  aiWork: 'max',
  lectures: 'max',
  syllabusAI: 'max',
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
  reminders: 'A morning note with your day, and a nudge before something slips.',
  weeklyRecap: 'Sunday: what you finished, what is coming, where you are behind.',
  gradeProjection: 'What you need on the rest of the term.',
  icsFeed: 'Your deadlines in Google Calendar, Apple Calendar or Outlook, kept up to date.',
  flashcards: 'Practice for any quiz or exam: a study plan, a worksheet with answers, quiz me, flashcards, all from your own class material.',
  examPlans: 'A study plan for your next quiz or exam, spread over the days before it.',
  aiWork: 'What an assignment really asks, and your draft or method checked against the rubric.',
  lectures: 'Paste or record a lecture, get notes and the key points.',
  syllabusAI: 'Reads syllabi and rubrics into real start dates and prep steps.',
  themes: 'Your colour: pick the accent the whole app wears.',
  helpKit: 'A help kit for any assignment: its instructions, rubric and files in one download.',
  onHalo: "Halo+ on Halo's own pages: search, one calendar for all classes, what's next on every class, the rubric on the page.",
};

/** What each plan is, in the words every price card, locked message and the landing page share. */
export const PLAN_LINES: Record<'free' | Paid, string[]> = {
  free: ["Everything on Halo's pages: search, one calendar for all classes, what's next and your grade on every class", "Syncs whenever you're on Halo", 'Grades and GPA, Now, Calendar, Classes', 'A heads-up when an announcement changed a due date'],
  max: ['Every announcement read for you: hidden and moved due dates, extra steps', "Auto-sync every 3 hours, even when you're not on Halo", 'Reminders, the Sunday preview and your calendar feed', 'Practice, Check my work and lecture notes'],
};

/** "part of Max": the plan a feature is in, for every locked line, so no message ever names a plan by hand. */
export const planOf = (feature: Feature): string => TIER_NAMES[FEATURES[feature]];
