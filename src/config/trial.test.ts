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
