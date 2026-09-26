import { describe, expect, it } from 'vitest';
import { needsPlan, trialState } from './flags';

const NOW = '2026-09-26T12:00:00.000Z';
describe('the trial', () => {
  it('is available once, active while it runs, used after, and moot on Max', () => {
    expect(trialState({ tier: 'free', trialEndsAt: null, trialStartedAt: null }, NOW)).toBe('available');
    expect(trialState({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z', trialStartedAt: '2026-09-25T00:00:00.000Z' }, NOW)).toBe('active');
    expect(trialState({ tier: 'free', trialEndsAt: '2026-09-20T00:00:00.000Z', trialStartedAt: '2026-09-15T00:00:00.000Z' }, NOW)).toBe('used');
    expect(trialState({ tier: 'plus', trialEndsAt: '2026-09-20T00:00:00.000Z', trialStartedAt: '2026-09-15T00:00:00.000Z' }, NOW)).toBe('used');
    expect(trialState({ tier: 'max', trialEndsAt: null, trialStartedAt: null }, NOW)).toBe('paid');
  });
  it('asks for a plan only with the free plan off, no plan paid for, and the trial used up', () => {
    const used = { tier: 'free' as const, trialEndsAt: '2026-09-20T00:00:00.000Z', trialStartedAt: '2026-09-15T00:00:00.000Z' };
    expect(needsPlan(used, false, NOW)).toBe(true);
    expect(needsPlan(used, true, NOW)).toBe(false);
    expect(needsPlan({ tier: 'free', trialEndsAt: null, trialStartedAt: null }, false, NOW)).toBe(false);
    expect(needsPlan({ ...used, tier: 'plus' }, false, NOW)).toBe(false);
    expect(needsPlan({ tier: 'free', trialEndsAt: '2026-09-30T00:00:00.000Z', trialStartedAt: '2026-09-25T00:00:00.000Z' }, false, NOW)).toBe(false);
  });
});
