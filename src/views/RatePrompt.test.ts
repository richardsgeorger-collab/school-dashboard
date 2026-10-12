import { describe, expect, it } from 'vitest';
import { shouldAskForRating } from './RatePrompt';

describe('the rate-us card (George, 2026-10-12)', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  const base = { tier: 'plus', createdAt: '2026-10-01T00:00:00Z', syncCount: 3, answered: false, extension: true, demo: false, now };
  it('a week in, three syncs, paying or on the trial, with the extension: yes', () => {
    expect(shouldAskForRating(base)).toBe(true);
    expect(shouldAskForRating({ ...base, tier: 'max' })).toBe(true);
  });
  it('never free, brand-new, under three syncs, without the extension, in the demo, or once answered', () => {
    expect(shouldAskForRating({ ...base, tier: 'free' })).toBe(false);
    expect(shouldAskForRating({ ...base, createdAt: '2026-10-08T00:00:00Z' })).toBe(false);
    expect(shouldAskForRating({ ...base, syncCount: 2 })).toBe(false);
    expect(shouldAskForRating({ ...base, extension: false })).toBe(false);
    expect(shouldAskForRating({ ...base, demo: true })).toBe(false);
    expect(shouldAskForRating({ ...base, answered: true })).toBe(false);
    expect(shouldAskForRating({ ...base, createdAt: null })).toBe(false);
  });
});
