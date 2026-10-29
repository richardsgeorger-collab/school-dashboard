import { describe, expect, it } from 'vitest';
import { monthlyRevenue, BUCKETS } from './AdminGrowth';
import { ago } from './AdminAccounts';

describe('Admin growth numbers', () => {
  it('monthly revenue from what the paying students are on, at the app prices', () => {
    expect(monthlyRevenue([])).toBe(0);
    // Plus and Pro are retired and count as Max (2026-10-29), at Max's price.
    expect(monthlyRevenue([{ tier: 'plus', interval: 'month' }, { tier: 'max', interval: 'month' }, { tier: 'max', interval: 'month' }])).toBeCloseTo(0.99 * 3, 2);
    expect(monthlyRevenue([{ tier: 'pro', interval: 'month' }])).toBeCloseTo(0.99, 2);
  });
  it('five groups, each student in exactly one: Free and Max only (2026-10-29)', () => {
    expect(BUCKETS.map(([, l]) => l)).toEqual(['Free trial (Max, 7 days of use)', 'Free', 'Max (paid)', 'Max (invite credit)', 'Max (friend link)']);
  });
  it('says when in plain words', () => {
    const now = Date.parse('2026-09-30T20:00:00Z');
    expect(ago('2026-09-30T19:59:40Z', now)).toBe('just now');
    expect(ago('2026-09-30T18:00:00Z', now)).toBe('2h ago');
    expect(ago('2026-09-27T20:00:00Z', now)).toBe('3d ago');
    expect(ago(null, now)).toBe('never');
  });
});
