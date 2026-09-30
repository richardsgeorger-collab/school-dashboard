import { describe, expect, it } from 'vitest';
import { monthlyRevenue, BUCKETS } from './AdminGrowth';
import { ago } from './AdminAccounts';

describe('Admin growth numbers', () => {
  it('monthly revenue from what the paying students are on, at the app prices', () => {
    expect(monthlyRevenue([])).toBe(0);
    expect(monthlyRevenue([{ tier: 'plus', interval: 'month' }, { tier: 'max', interval: 'month' }, { tier: 'max', interval: 'month' }])).toBeCloseTo(4.99 + 7.99 * 2, 2);
    // The old name for Plus counts as Plus.
    expect(monthlyRevenue([{ tier: 'pro', interval: 'month' }])).toBeCloseTo(4.99, 2);
  });
  it('six plans, each student in exactly one, in the order George asked for', () => {
    expect(BUCKETS.map(([, l]) => l)).toEqual(['Free trial (Max, 7 days)', 'Free', 'Plus (paid)', 'Plus (referral credit)', 'Max (paid)', 'Max (friend link)']);
  });
  it('says when in plain words', () => {
    const now = Date.parse('2026-09-30T20:00:00Z');
    expect(ago('2026-09-30T19:59:40Z', now)).toBe('just now');
    expect(ago('2026-09-30T18:00:00Z', now)).toBe('2h ago');
    expect(ago('2026-09-27T20:00:00Z', now)).toBe('3d ago');
    expect(ago(null, now)).toBe('never');
  });
});
