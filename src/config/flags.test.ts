import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { can, effectiveTier, tierFor, trialDaysLeft } from './flags';
import { FEATURES, PRICES, REFERRAL, STRIPE_PRICE_IDS, TIERS, TRIAL } from './tiers';

describe('feature flags', () => {
  it('each tier has everything below it and nothing above it', () => {
    expect(can('nowBasic', 'free')).toBe(true);
    expect(can('haloAutoSync', 'free')).toBe(false);
    expect(can('haloAutoSync', 'plus')).toBe(true);
    expect(can('aiChat', 'plus')).toBe(false);
    expect(can('aiChat', 'pro')).toBe(true);
    expect(can('lectures', 'pro')).toBe(false);
    expect(can('lectures', 'max')).toBe(true);
    expect(tierFor('weeklyRecap')).toBe('max');
  });

  it('a live trial is the trial tier; an expired one is the paid tier', () => {
    const now = '2026-09-24T12:00:00.000Z';
    expect(effectiveTier({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z' }, now)).toBe(TRIAL.tier);
    expect(effectiveTier({ tier: 'free', trialEndsAt: '2026-09-20T00:00:00.000Z' }, now)).toBe('free');
    expect(effectiveTier({ tier: 'pro', trialEndsAt: '2026-09-20T00:00:00.000Z' }, now)).toBe('pro');
    expect(effectiveTier(null, now)).toBe('free');
    expect(trialDaysLeft({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z' }, now)).toBe(6);
    expect(trialDaysLeft({ tier: 'free', trialEndsAt: null }, now)).toBeNull();
    // A referral reward lifts a Free account to Plus for its month, never lowers a paid Pro.
    expect(effectiveTier({ tier: 'free', rewardTier: 'plus', rewardUntil: '2026-10-20T00:00:00.000Z' }, now)).toBe('plus');
    expect(effectiveTier({ tier: 'pro', rewardTier: 'plus', rewardUntil: '2026-10-20T00:00:00.000Z' }, now)).toBe('pro');
    expect(effectiveTier({ tier: 'free', rewardTier: 'plus', rewardUntil: '2026-09-01T00:00:00.000Z' }, now)).toBe('free');
  });

  it('the SQL mirrors the config: trial days and referral days', () => {
    // 0006 redefines the trial: started on purpose, five days.
    const sql1 = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '0006_trial_usage.sql'), 'utf8');
    const sql2 = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '0002_referrals_rewards.sql'), 'utf8');
    expect(sql1).toContain(`interval '${TRIAL.days} days'`);
    expect(sql2).toContain(`interval '${REFERRAL.days} days'`);
  });

  it('config is complete: every paid tier has prices and price ids, every feature names a real tier', () => {
    for (const t of TIERS.filter((x) => x !== 'free') as ('plus' | 'pro' | 'max')[]) {
      expect(PRICES[t].month).toBeGreaterThan(0);
      expect(PRICES[t].year).toBeLessThan(PRICES[t].month * 12);
      expect(STRIPE_PRICE_IDS[t].month).toMatch(/^price_/);
      expect(STRIPE_PRICE_IDS[t].year).toMatch(/^price_/);
    }
    for (const tier of Object.values(FEATURES)) expect(TIERS).toContain(tier);
  });

  it('annual really is about two months free', () => {
    for (const t of ['plus', 'pro', 'max'] as const) {
      const monthsFree = 12 - PRICES[t].year / PRICES[t].month;
      expect(monthsFree).toBeGreaterThanOrEqual(1.9);
      expect(monthsFree).toBeLessThanOrEqual(5.2);
    }
  });
});
