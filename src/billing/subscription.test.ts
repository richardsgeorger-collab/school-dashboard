import { describe, expect, it } from 'vitest';
import { GRACE_DAYS, STRIPE_PRICE_IDS } from '../config/tiers';
import { cancelScheduled, profilePatch, subscriptionLine, subscriptionRow, tierForPrice } from './subscription';

const NOW = '2026-09-24T12:00:00.000Z';
const pro = STRIPE_PRICE_IDS.plus.month;

describe('subscription → plan', () => {
  it('maps a price id back to its plan and interval', () => {
    expect(tierForPrice(STRIPE_PRICE_IDS.max.month)).toEqual({ tier: 'max', interval: 'month' });
    // A subscription on a retired sandbox price still maps to its plan.
    expect(tierForPrice('price_1UJPwp02Mu8IT856WwAw4KUl')).toEqual({ tier: 'max', interval: 'semester' });
    expect(tierForPrice('price_someone_elses')).toBeNull();
    expect(tierForPrice(null)).toBeNull();
  });
  it('active keeps the plan, past due keeps it for the grace period, anything else is Free', () => {
    expect(profilePatch({ status: 'active', priceId: pro, currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW)).toEqual({ tier: 'plus', grace_until: null });
    const late = profilePatch({ status: 'past_due', priceId: pro, currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW);
    expect(late.tier).toBe('plus');
    expect(late.grace_until).toBe(new Date(new Date(NOW).getTime() + GRACE_DAYS * 86_400_000).toISOString());
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'paused', 'incomplete']) {
      expect(profilePatch({ status, priceId: pro, currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW)).toEqual({ tier: 'free', grace_until: null });
    }
    // An unknown price never grants a plan.
    expect(profilePatch({ status: 'active', priceId: 'price_x', currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW).tier).toBe('free');
  });
  it('writes the row the account card reads', () => {
    const row = subscriptionRow({ status: 'active', priceId: STRIPE_PRICE_IDS.plus.month, currentPeriodEnd: '2027-09-24T00:00:00.000Z', cancelAtPeriodEnd: true }, 'u1', 'sub_1', NOW);
    expect(row).toMatchObject({ user_id: 'u1', tier: 'plus', interval: 'month', cancel_at_period_end: true });
    expect(subscriptionRow({ status: 'active', priceId: 'price_x', currentPeriodEnd: null, cancelAtPeriodEnd: false }, 'u1', 'sub_1', NOW)).toBeNull();
  });
  it('says the one thing the account card needs', () => {
    const day = (iso: string) => iso.slice(0, 10);
    expect(subscriptionLine({ tier: 'plus', interval: 'month', status: 'active', current_period_end: '2026-10-24T00:00:00.000Z', cancel_at_period_end: false }, null, day)).toBe('Renews 2026-10-24, monthly.');
    expect(subscriptionLine({ tier: 'plus', interval: 'month', status: 'active', current_period_end: '2026-10-24T00:00:00.000Z', cancel_at_period_end: true }, null, day)).toBe('Ends 2026-10-24. Nothing more will be charged.');
    expect(subscriptionLine(null, '2999-01-01T00:00:00.000Z', day)).toContain('Payment failed');
    expect(subscriptionLine(null, null, day)).toBeNull();
  });
  it('a cancel from the portal counts whether Stripe records it as the old flag or as cancel_at', () => {
    expect(cancelScheduled({ cancel_at_period_end: true, cancel_at: null })).toBe(true);
    // What the sandbox portal actually wrote on 2026-09-28 (scripts/e2e-cancel.mjs).
    expect(cancelScheduled({ cancel_at_period_end: false, cancel_at: 1_819_152_000 })).toBe(true);
    expect(cancelScheduled({ cancel_at_period_end: false, cancel_at: null })).toBe(false);
  });
});
