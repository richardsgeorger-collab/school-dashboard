import { describe, expect, it } from 'vitest';
import { syncAccess, trialState } from './flags';

const NOW = '2026-09-26T12:00:00.000Z';
describe('the trial', () => {
  it('is available once, active while it runs, used after, and moot on Max', () => {
    expect(trialState({ tier: 'free', trialEndsAt: null, trialStartedAt: null }, NOW)).toBe('available');
    expect(trialState({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z', trialStartedAt: '2026-09-25T00:00:00.000Z' }, NOW)).toBe('active');
    expect(trialState({ tier: 'free', trialEndsAt: '2026-09-20T00:00:00.000Z', trialStartedAt: '2026-09-15T00:00:00.000Z' }, NOW)).toBe('used');
    expect(trialState({ tier: 'plus', trialEndsAt: '2026-09-20T00:00:00.000Z', trialStartedAt: '2026-09-15T00:00:00.000Z' }, NOW)).toBe('used');
    expect(trialState({ tier: 'max', trialEndsAt: null, trialStartedAt: null }, NOW)).toBe('paid');
  });
  it('sync stops when the trial ends with nothing paid; Plus brings it back; the trial itself syncs', () => {
    const used = { tier: 'free' as const, trialEndsAt: '2026-09-20T00:00:00.000Z', trialStartedAt: '2026-09-13T00:00:00.000Z' };
    expect(syncAccess(used, NOW).allowed).toBe(false);
    expect(syncAccess({ ...used, tier: 'plus' }, NOW).allowed).toBe(true);
    expect(syncAccess({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z', trialStartedAt: '2026-09-23T00:00:00.000Z' }, NOW).allowed).toBe(true);
  });
});

describe('a friend link', () => {
  const gift = { tier: 'free' as const, trialStartedAt: '2026-09-20T00:00:00.000Z', trialEndsAt: '2026-09-20T00:00:00.000Z', rewardTier: 'max' as const, rewardUntil: '2026-12-21T06:59:00.000Z', friendFrom: 'George' };
  it('is Max from the friend through the date, with no trial talk and sync on', async () => {
    const { effectiveTier, friendGift, syncAccess } = await import('./flags');
    expect(friendGift(gift, NOW)).toEqual({ from: 'George', until: '2026-12-21T06:59:00.000Z' });
    expect(effectiveTier(gift, NOW)).toBe('max');
    expect(trialState(gift, NOW)).toBe('paid');
    expect(syncAccess(gift, NOW).allowed).toBe(true);
  });
  it('ends at its date like any reward, and then the account is on its own plan', async () => {
    const { friendGift } = await import('./flags');
    expect(friendGift(gift, '2027-01-02T00:00:00.000Z')).toBeNull();
    expect(syncAccess(gift, '2027-01-02T00:00:00.000Z').allowed).toBe(false);
  });
});
