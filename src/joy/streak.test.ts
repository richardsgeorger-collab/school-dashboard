import { describe, expect, it } from 'vitest';
import type { Item } from '../domain/types';
import { streakFor, streakMilestone } from './streak';

const TZ = 'America/Phoenix';
let n = 0;
const doneOn = (day: string, viaHalo = false): Item => ({ id: `i${n++}`, courseId: 'c', points: 10, status: viaHalo ? 'todo' : 'done', completedAt: viaHalo ? null : `${day}T19:00:00Z`, score: null, source: 'halo', halo: viaHalo ? { status: 'SUBMITTED', submittedAt: `${day}T19:00:00Z`, checkedAt: '' } : null }) as unknown as Item;
// 2026-10-07 is a Wednesday; weeks start Monday (Oct 5).
const TODAY = '2026-10-07';

describe('the streak', () => {
  it('counts days in a row with something finished; today not done yet does not break it', () => {
    expect(streakFor([doneOn('2026-10-07'), doneOn('2026-10-06'), doneOn('2026-10-05')], TODAY, TZ).days).toBe(3);
    expect(streakFor([doneOn('2026-10-06'), doneOn('2026-10-05')], TODAY, TZ).days).toBe(2);
  });
  it('a Halo submission counts on the day Halo says it was turned in', () => {
    expect(streakFor([doneOn('2026-10-07', true), doneOn('2026-10-06', true)], TODAY, TZ).days).toBe(2);
  });
  it('one skip day a week is forgiven, a second is not', () => {
    const one = streakFor([doneOn('2026-10-07'), doneOn('2026-10-05'), doneOn('2026-10-04'), doneOn('2026-10-03')], TODAY, TZ);
    expect(one).toEqual({ days: 4, skipUsedThisWeek: true });
    // Oct 6 missed (this week's skip), Oct 2 missed in the week before (that week's own skip): 5 days.
    expect(streakFor([doneOn('2026-10-07'), doneOn('2026-10-05'), doneOn('2026-10-04'), doneOn('2026-10-03'), doneOn('2026-10-01')], TODAY, TZ).days).toBe(5);
    // Two missed in the same week: it stops at the second.
    expect(streakFor([doneOn('2026-10-09'), doneOn('2026-10-07'), doneOn('2026-10-05')], '2026-10-09', TZ).days).toBe(2);
    // Yesterday missed, the day before finished: alive.
    expect(streakFor([doneOn('2026-10-05'), doneOn('2026-10-04')], TODAY, TZ).days).toBe(2);
  });
  it('unchecking takes it back; milestones are 3, 7, 14, 30', () => {
    const a = doneOn('2026-10-07');
    expect(streakFor([{ ...a, status: 'todo', completedAt: null }], TODAY, TZ).days).toBe(0);
    expect([0, 2, 3, 6, 7, 13, 14, 29, 30, 45].map(streakMilestone)).toEqual([0, 0, 3, 3, 7, 7, 14, 14, 30, 30]);
  });
});
