import { describe, expect, it } from 'vitest';
import { trialUse } from './trialUse';

const NOW = '2026-10-22T18:00:00.000Z';
const day = (n: number) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();
const p = (o: Record<string, unknown>) => ({ tier: 'free' as const, trialStartedAt: day(-3), ...o });
// NOW is Thursday Oct 22, 11 AM in Phoenix.
const TODAY = '2026-10-22';
const YESTERDAY = '2026-10-21';

describe('the trial in days of use', () => {
  it('waits for the first sync: 7 days, nothing counted', () => {
    expect(trialUse(p({ trialEndsAt: day(7), trialSyncedAt: null }), NOW)).toMatchObject({ used: 0, left: 7, started: false });
  });
  it('day 1 is 7 left; the 7th day of use is the last; days away do not count', () => {
    expect(trialUse(p({ trialSyncedAt: day(0), trialDaysUsed: 1, trialLastDay: TODAY, trialEndsAt: day(30) }), NOW)).toMatchObject({ left: 7, capFirst: false });
    expect(trialUse(p({ trialSyncedAt: day(-12), trialDaysUsed: 4, trialLastDay: TODAY, trialEndsAt: day(18) }), NOW)).toMatchObject({ used: 4, left: 4 });
    expect(trialUse(p({ trialSyncedAt: day(-20), trialDaysUsed: 7, trialLastDay: TODAY, trialEndsAt: day(0.25) }), NOW)?.left).toBe(1);
  });
  it('the same count before and after today is counted: today is one of the days left either way', () => {
    const before = trialUse(p({ trialSyncedAt: day(-5), trialDaysUsed: 2, trialLastDay: YESTERDAY, trialEndsAt: day(25) }), NOW);
    const after = trialUse(p({ trialSyncedAt: day(-5), trialDaysUsed: 3, trialLastDay: TODAY, trialEndsAt: day(25) }), NOW);
    expect(before?.left).toBe(5);
    expect(after?.left).toBe(5);
    // Six days used before today: today is the last.
    expect(trialUse(p({ trialSyncedAt: day(-9), trialDaysUsed: 6, trialLastDay: YESTERDAY, trialEndsAt: day(21) }), NOW)?.left).toBe(1);
  });
  it('the 30-day limit wins when it is nearer', () => {
    const u = trialUse(p({ trialSyncedAt: day(-28.5), trialDaysUsed: 2, trialLastDay: TODAY, trialEndsAt: day(1.5) }), NOW);
    expect(u).toMatchObject({ left: 2, capFirst: true });
    expect(u?.capAt).toBe(day(1.5));
  });
  it('an ended trial is none', () => {
    expect(trialUse(p({ trialSyncedAt: day(-40), trialDaysUsed: 3, trialEndsAt: day(-10) }), NOW)).toBeNull();
  });
});
