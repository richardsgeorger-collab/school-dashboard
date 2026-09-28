import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { can, effectiveTier, tierFor, trialDaysLeft, syncAccess } from './flags';
import { FEATURES, PRICES, REFERRAL, STRIPE_PRICE_IDS, TIERS, TRIAL, PAID } from './tiers';

describe('feature flags', () => {
  it('each tier has everything below it and nothing above it', () => {
    expect(can('nowBasic', 'free')).toBe(true);
    expect(can('syllabusDrop', 'free')).toBe(true);
    expect(can('haloManualSync', 'free')).toBe(false);
    expect(can('haloManualSync', 'plus')).toBe(true);
    expect(can('announcementAI', 'plus')).toBe(true);
    expect(can('aiChat', 'plus')).toBe(false);
    // A retired Pro row keeps Plus and nothing of Max.
    expect(can('haloManualSync', 'pro')).toBe(true);
    expect(can('aiChat', 'pro')).toBe(false);
    expect(can('lectures', 'max')).toBe(true);
    expect(tierFor('weeklyRecap')).toBe('plus');
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
    // 0010 redefines the trial: seven days, started at signup (and by start_trial for older accounts).
    const sql1 = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '0010_plans_2026_09_28.sql'), 'utf8');
    const sql2 = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '0002_referrals_rewards.sql'), 'utf8');
    expect(sql1).toContain(`interval '${TRIAL.days} days'`);
    expect(sql2).toContain(`interval '${REFERRAL.days} days'`);
  });

  it('config is complete: every sold plan has both prices and price ids, every feature names a real tier', () => {
    for (const t of PAID) {
      expect(PRICES[t].month).toBeGreaterThan(0);
      expect(STRIPE_PRICE_IDS[t].month).toMatch(/^price_/);
      expect(STRIPE_PRICE_IDS[t].semester).toMatch(/^price_/);
    }
    for (const tier of Object.values(FEATURES)) expect(TIERS).toContain(tier);
    // Nothing is sold as Pro any more, and no feature is Pro's alone.
    expect(Object.values(FEATURES)).not.toContain('pro');
  });

  it('a semester costs a little under four months', () => {
    for (const t of PAID) {
      expect(PRICES[t].semester).toBeLessThan(PRICES[t].month * 4);
      expect(PRICES[t].semester).toBeGreaterThan(PRICES[t].month * 3.5);
    }
  });

  it('the plans are what George set on 2026-09-28', () => {
    expect(PRICES.plus.month).toBe(3.99);
    expect(PRICES.max.month).toBe(7.99);
    expect(TRIAL.days).toBe(7);
    for (const f of ['syllabusDrop', 'manualItems', 'monthView', 'agendaView', 'nowBasic'] as const) expect(FEATURES[f]).toBe('free');
    for (const f of ['haloManualSync', 'haloAutoSync', 'haloGrades', 'announcementAI', 'reminders', 'weeklyRecap'] as const) expect(FEATURES[f]).toBe('plus');
    for (const f of ['aiChat', 'promptPanel', 'flashcards', 'examPlans', 'lectures', 'themes'] as const) expect(FEATURES[f]).toBe('max');
  });

  it('Halo sync: Plus, Max, a live trial or a kept legacy account; otherwise paused since the latest end', () => {
    const now = '2026-10-05T12:00:00.000Z';
    expect(syncAccess({ tier: 'plus' }, now)).toMatchObject({ allowed: true, via: 'plan' });
    expect(syncAccess({ tier: 'max' }, now)).toMatchObject({ allowed: true, via: 'plan' });
    expect(syncAccess({ tier: 'free', trialEndsAt: '2026-10-08T00:00:00.000Z' }, now)).toMatchObject({ allowed: true, via: 'trial' });
    expect(syncAccess({ tier: 'free', trialEndsAt: '2026-10-03T07:00:00.000Z', trialStartedAt: '2026-09-26T07:00:00.000Z' }, now)).toEqual({ allowed: false, via: 'none', pausedSince: '2026-10-03T07:00:00.000Z', legacyUntil: null });
    expect(syncAccess({ tier: 'free', legacySyncUntil: '2026-12-21T00:00:00.000Z' }, now)).toMatchObject({ allowed: true, via: 'legacy', legacyUntil: '2026-12-21T00:00:00.000Z' });
    expect(syncAccess({ tier: 'free', legacySyncUntil: '2026-12-21T00:00:00.000Z', trialEndsAt: '2026-09-01T00:00:00.000Z' }, '2027-01-02T00:00:00.000Z').pausedSince).toBe('2026-12-21T00:00:00.000Z');
    expect(syncAccess({ tier: 'free' }, now)).toEqual({ allowed: false, via: 'none', pausedSince: null, legacyUntil: null });
  });
});
