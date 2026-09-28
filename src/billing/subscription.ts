import { GRACE_DAYS, LEGACY_PRICE_IDS, PAID, STRIPE_PRICE_IDS, type Interval, type Paid, type Tier } from '../config/tiers';

/**
 * What a Stripe subscription means for a profile. Pure, shared with the webhook, so the client and the server
 * agree on what "past due" and "canceled" do to a plan. Stripe's statuses: trialing, active, past_due, unpaid,
 * canceled, incomplete, incomplete_expired, paused.
 */
export interface SubscriptionFacts {
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export type { Interval, Paid };

/** The plan a Stripe price id stands for (a retired price still maps), or null for a price this build does not know. */
export function tierForPrice(priceId: string | null): { tier: Tier; interval: Interval } | null {
  if (!priceId) return null;
  for (const tier of PAID) {
    for (const [interval, id] of Object.entries(STRIPE_PRICE_IDS[tier]) as [Interval, string][]) {
      if (id === priceId) return { tier, interval };
    }
  }
  return LEGACY_PRICE_IDS[priceId] ?? null;
}

/**
 * Whether the plan is set to end rather than renew. Stripe's portal (2026 API) records a cancel at the period end as
 * `cancel_at`, a date, and leaves the old `cancel_at_period_end` flag false; either one means it ends.
 */
export const cancelScheduled = (s: { cancel_at_period_end?: boolean | null; cancel_at?: number | null }): boolean => !!s.cancel_at_period_end || !!s.cancel_at;

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

/**
 * The profile columns a subscription sets. Active or trialing keeps the paid tier. Past due keeps it too, for the
 * grace period, so a card that expired on the 1st does not lock a student out mid-week. Everything else is Free.
 */
export function profilePatch(facts: SubscriptionFacts, now: string): { tier: Tier; grace_until: string | null } {
  const known = tierForPrice(facts.priceId);
  const tier: Tier = known?.tier ?? 'free';
  switch (facts.status) {
    case 'active':
    case 'trialing':
      return { tier, grace_until: null };
    case 'past_due':
      return { tier, grace_until: addDays(now, GRACE_DAYS) };
    default:
      return { tier: 'free', grace_until: null };
  }
}

/** The row for the subscriptions table, or null when the price is not one of ours. */
export function subscriptionRow(facts: SubscriptionFacts, userId: string, subscriptionId: string, now: string) {
  const known = tierForPrice(facts.priceId);
  if (!known) return null;
  return {
    user_id: userId,
    stripe_subscription_id: subscriptionId,
    tier: known.tier,
    interval: known.interval,
    status: facts.status,
    current_period_end: facts.currentPeriodEnd,
    cancel_at_period_end: facts.cancelAtPeriodEnd,
    updated_at: now,
  };
}

/** One line for the account card. */
export function subscriptionLine(row: { tier: Paid; interval: Interval; status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null, graceUntil: string | null, fmtDay: (iso: string) => string): string | null {
  if (graceUntil && new Date(graceUntil).getTime() > Date.now()) return `Payment failed. Update your card by ${fmtDay(graceUntil)} to keep your plan.`;
  if (!row) return null;
  const when = row.current_period_end ? fmtDay(row.current_period_end) : null;
  if (row.status === 'canceled') return 'Your plan has ended.';
  if (row.cancel_at_period_end && when) return `Ends ${when}. Nothing more will be charged.`;
  if (when) return `Renews ${when}, ${row.interval === 'month' ? 'monthly' : 'each semester'}.`;
  return null;
}
