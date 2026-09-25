import { describe, expect, it } from 'vitest';
import { GRACE_DAYS, STRIPE_PRICE_IDS } from '../config/tiers';
import { profilePatch, subscriptionLine, subscriptionRow, tierForPrice } from './subscription';

const NOW = '2026-09-24T12:00:00.000Z';
const pro = STRIPE_PRICE_IDS.pro.month;

describe('subscription → plan', () => {
  it('maps a price id back to its plan and interval', () => {
    expect(tierForPrice(STRIPE_PRICE_IDS.max.year)).toEqual({ tier: 'max', interval: 'year' });
    expect(tierForPrice('price_someone_elses')).toBeNull();
    expect(tierForPrice(null)).toBeNull();
  });
  it('active keeps the plan, past due keeps it for the grace period, anything else is Free', () => {
    expect(profilePatch({ status: 'active', priceId: pro, currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW)).toEqual({ tier: 'pro', grace_until: null });
    const late = profilePatch({ status: 'past_due', priceId: pro, currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW);
    expect(late.tier).toBe('pro');
    expect(late.grace_until).toBe(new Date(new Date(NOW).getTime() + GRACE_DAYS * 86_400_000).toISOString());
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'paused', 'incomplete']) {
      expect(profilePatch({ status, priceId: pro, currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW)).toEqual({ tier: 'free', grace_until: null });
    }
    // An unknown price never grants a plan.
    expect(profilePatch({ status: 'active', priceId: 'price_x', currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW).tier).toBe('free');
  });
  it('writes the row the account card reads', () => {
    const row = subscriptionRow({ status: 'active', priceId: STRIPE_PRICE_IDS.plus.year, currentPeriodEnd: '2027-09-24T00:00:00.000Z', cancelAtPeriodEnd: true }, 'u1', 'sub_1', NOW);
    expect(row).toMatchObject({ user_id: 'u1', tier: 'plus', interval: 'year', cancel_at_period_end: true });
    expect(subscriptionRow({ status: 'active', priceId: 'price_x', currentPeriodEnd: null, cancelAtPeriodEnd: false }, 'u1', 'sub_1', NOW)).toBeNull();
  });
  it('says the one thing the account card needs', () => {
    const day = (iso: string) => iso.slice(0, 10);
    expect(subscriptionLine({ tier: 'pro', interval: 'month', status: 'active', current_period_end: '2026-10-24T00:00:00.000Z', cancel_at_period_end: false }, null, day)).toBe('Renews 2026-10-24, monthly.');
    expect(subscriptionLine({ tier: 'pro', interval: 'month', status: 'active', current_period_end: '2026-10-24T00:00:00.000Z', cancel_at_period_end: true }, null, day)).toBe('Ends 2026-10-24. Nothing more will be charged.');
    expect(subscriptionLine(null, '2999-01-01T00:00:00.000Z', day)).toContain('Payment failed');
    expect(subscriptionLine(null, null, day)).toBeNull();
  });
});
