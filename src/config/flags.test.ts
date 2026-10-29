import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { can, effectiveTier, tierFor, trialDaysLeft, syncAccess } from './flags';
import { FEATURES, MAX_PRICE_LOOKUP_KEY, PRICES, REFERRAL, TIERS, TRIAL, PAID, OFFERED_INTERVALS } from './tiers';

describe('feature flags', () => {
  it('each tier has everything below it and nothing above it', () => {
    expect(can('nowBasic', 'free')).toBe(true);
    expect(can('syllabusDrop', 'free')).toBe(true);
    // Free syncs Halo; auto-sync and announcements are Max (2026-10-29).
    expect(can('haloManualSync', 'free')).toBe(true);
    expect(can('haloAutoSync', 'free')).toBe(false);
    expect(can('announcementAI', 'free')).toBe(false);
    expect(can('onHalo', 'free')).toBe(true);
    // Retired Plus and Pro rows count as Max: nobody who paid loses anything.
    for (const t of ['plus', 'pro'] as const) {
      expect(can('announcementAI', t)).toBe(true);
      expect(can('aiWork', t)).toBe(true);
      expect(can('lectures', t)).toBe(true);
    }
    expect(can('lectures', 'max')).toBe(true);
    expect(tierFor('weeklyRecap')).toBe('max');
  });

  it('a live trial is the trial tier; an expired one is the paid tier', () => {
    const now = '2026-09-24T12:00:00.000Z';
    expect(effectiveTier({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z' }, now)).toBe(TRIAL.tier);
    expect(effectiveTier({ tier: 'free', trialEndsAt: '2026-09-20T00:00:00.000Z' }, now)).toBe('free');
    expect(effectiveTier({ tier: 'pro', trialEndsAt: '2026-09-20T00:00:00.000Z' }, now)).toBe('pro');
    expect(effectiveTier(null, now)).toBe('free');
    // Days of use (2026-10-22): before the first sync all 7 wait; after it, today counts once opened.
    expect(trialDaysLeft({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z' }, now)).toBe(7);
    expect(trialDaysLeft({ tier: 'free', trialEndsAt: '2026-10-20T00:00:00.000Z', trialSyncedAt: '2026-09-20T00:00:00.000Z', trialDaysUsed: 2, trialLastDay: null }, now)).toBe(5);
    expect(trialDaysLeft({ tier: 'free', trialEndsAt: null }, now)).toBeNull();
    // A referral reward lifts a Free account for its month (an old Plus one counts as Max), never lowers a paid Pro.
    expect(effectiveTier({ tier: 'free', rewardTier: 'plus', rewardUntil: '2026-10-20T00:00:00.000Z' }, now)).toBe('plus');
    expect(can('announcementAI', effectiveTier({ tier: 'free', rewardTier: 'plus', rewardUntil: '2026-10-20T00:00:00.000Z' }, now))).toBe(true);
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

  it('config is complete: every sold plan has a price and a price id for every offered interval, every feature names a real tier', () => {
    expect(OFFERED_INTERVALS).toEqual(['month']);
    for (const t of PAID) {
      for (const i of OFFERED_INTERVALS) {
        expect(PRICES[t][i]).toBeGreaterThan(0);
        expect(MAX_PRICE_LOOKUP_KEY).toBeTruthy();
      }
    }
    for (const tier of Object.values(FEATURES)) expect(TIERS).toContain(tier);
    expect(Object.values(FEATURES)).not.toContain('pro');
  });

  it('the plans are what George set on 2026-10-29: Free and Max ($0.99); the rule: what costs AI tokens is Max, plus auto-sync', () => {
    expect(PAID).toEqual(['max']);
    expect(PRICES.max.month).toBe(0.99);
    expect(TRIAL.days).toBe(7);
    expect(REFERRAL.rewardTier).toBe('max');
    for (const f of ['syllabusDrop', 'manualItems', 'monthView', 'agendaView', 'nowBasic', 'haloManualSync', 'haloGrades', 'announcementPeek', 'gradeProjection', 'themes', 'helpKit', 'onHalo'] as const) expect(FEATURES[f]).toBe('free');
    for (const f of ['haloAutoSync', 'announcementAI', 'reminders', 'weeklyRecap', 'icsFeed', 'flashcards', 'examPlans', 'aiWork', 'lectures', 'syllabusAI'] as const) expect(FEATURES[f]).toBe('max');
    expect(Object.values(FEATURES).every((t) => t === 'free' || t === 'max')).toBe(true);
    // A trial or a friend link is Max, so it auto-syncs.
    expect(can('haloAutoSync', effectiveTier({ tier: 'free', trialEndsAt: '2099-01-01T00:00:00.000Z' }))).toBe(true);
    expect(can('haloAutoSync', effectiveTier({ tier: 'free', rewardTier: 'max', rewardUntil: '2099-01-01T00:00:00.000Z', friendFrom: 'A' }))).toBe(true);
    expect(can('haloAutoSync', 'free')).toBe(false);
  });

  it('Halo sync: every signed-in plan since 2026-10-25 (Free when it syncs or is on Halo); the reason says which', () => {
    const now = '2026-10-04T00:00:00.000Z';
    expect(syncAccess({ tier: 'plus' }, now)).toMatchObject({ allowed: true, via: 'plan' });
    expect(syncAccess({ tier: 'max' }, now)).toMatchObject({ allowed: true, via: 'plan' });
    expect(syncAccess({ tier: 'free', trialEndsAt: '2026-10-08T00:00:00.000Z' }, now)).toMatchObject({ allowed: true, via: 'trial' });
    // The trial ended with nothing paid: still syncing, on Free. Nothing freezes, nothing is "paused".
    expect(syncAccess({ tier: 'free', trialEndsAt: '2026-10-03T07:00:00.000Z', trialStartedAt: '2026-09-26T07:00:00.000Z' }, now)).toEqual({ allowed: true, via: 'plan', pausedSince: null, legacyUntil: null });
    expect(syncAccess({ tier: 'free' }, now)).toEqual({ allowed: true, via: 'plan', pausedSince: null, legacyUntil: null });
    expect(syncAccess(null, now)).toMatchObject({ allowed: false, via: 'none' });
  });
});
