import { describe, expect, it } from 'vitest';
import { awardValue, completeItem, computeProgress, levelFor, reopenItem, timingMultiplier, withScore } from './points';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, type Item } from './types';

const TZ = 'America/Phoenix';
let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`,
    courseId: 'c1',
    title: `Item ${n}`,
    label: `Item ${n}`,
    labelOverridden: false,
    type: 'homework',
    points: 20,
    opensAt: null,
    dueAt: '2026-09-20T23:59:00-07:00',
    estimatedMinutes: 120,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'manual',
    award: null,
    updatedAt: '2026-09-09T00:00:00-07:00',
    ...over,
  };
}
/** Done on time at `at`, with a locked award. */
const doneAt = (at: string, over: Partial<Item> = {}, startBy = '2026-09-30') =>
  completeItem(item({ ...over }), startBy, at, TZ);

describe('timingMultiplier', () => {
  const due = '2026-09-20T23:59:00-07:00';
  it('is 1.5 on or before start-by, 1 before due, 0.5 after', () => {
    expect(timingMultiplier('2026-09-15T20:00:00-07:00', due, '2026-09-15', TZ)).toBe(1.5);
    expect(timingMultiplier('2026-09-10T08:00:00-07:00', due, '2026-09-15', TZ)).toBe(1.5);
    expect(timingMultiplier('2026-09-16T00:30:00-07:00', due, '2026-09-15', TZ)).toBe(1);
    expect(timingMultiplier('2026-09-20T23:59:00-07:00', due, '2026-09-15', TZ)).toBe(1);
    expect(timingMultiplier('2026-09-21T00:01:00-07:00', due, '2026-09-15', TZ)).toBe(0.5);
  });
});

describe('awards', () => {
  it('locks on first completion and survives undo and redo', () => {
    const a = completeItem(item({ points: 50 }), '2026-09-15', '2026-09-10T10:00:00-07:00', TZ);
    expect(a.status).toBe('done');
    expect(a.award).toEqual({ base: 50, multiplier: 1.5, earnedAt: '2026-09-10T10:00:00-07:00', scoreFactor: null });
    expect(awardValue(a.award!)).toBe(75);
    const undone = reopenItem(a);
    expect(undone.status).toBe('todo');
    expect(undone.completedAt).toBeNull();
    expect(undone.award).toEqual(a.award);
    const redone = completeItem(undone, '2026-09-15', '2026-09-25T10:00:00-07:00', TZ);
    expect(redone.award).toEqual(a.award);
    expect(redone.completedAt).toBe('2026-09-25T10:00:00-07:00');
  });

  it('applies the score factor and rounds', () => {
    const a = completeItem(item({ points: 45 }), '2026-09-15', '2026-09-18T10:00:00-07:00', TZ);
    expect(awardValue(a.award!)).toBe(45);
    const scored = withScore(a, 40);
    expect(scored.award!.scoreFactor).toBeCloseTo(40 / 45);
    expect(awardValue(scored.award!)).toBe(40);
    expect(withScore(scored, null).award!.scoreFactor).toBeNull();
    expect(awardValue(withScore(a, 0).award!)).toBe(0);
  });

  it('gives zero for zero-point items', () => {
    const a = completeItem(item({ points: 0 }), '2026-09-15', '2026-09-10T10:00:00-07:00', TZ);
    expect(awardValue(a.award!)).toBe(0);
  });
});

describe('levelFor', () => {
  it('follows the square-root curve', () => {
    expect(levelFor(0)).toEqual({ level: 1, floor: 0, ceil: 60 });
    expect(levelFor(59)).toEqual({ level: 1, floor: 0, ceil: 60 });
    expect(levelFor(60)).toEqual({ level: 2, floor: 60, ceil: 240 });
    expect(levelFor(239).level).toBe(2);
    expect(levelFor(240).level).toBe(3);
    expect(levelFor(5999).level).toBe(10);
    expect(levelFor(6000).level).toBe(11);
  });
});

describe('computeProgress', () => {
  const settings = DEFAULT_SETTINGS;
  const TODAY = '2026-09-23'; // Wednesday
  const NOW = '2026-09-23T12:00:00-07:00';
  const run = (items: Item[], today = TODAY, now = NOW) => computeProgress(items, settings, today, now);

  it('sums XP only for items currently done', () => {
    const a = doneAt('2026-09-10T10:00:00-07:00', { points: 100 }); // 150
    const b = reopenItem(doneAt('2026-09-11T10:00:00-07:00', { points: 100 }));
    const p = run([a, b]);
    expect(p.xp).toBe(150);
    expect(p.level).toBe(2);
  });

  it('counts the daily streak through today or yesterday', () => {
    const three = [doneAt('2026-09-23T09:00:00-07:00'), doneAt('2026-09-22T09:00:00-07:00'), doneAt('2026-09-21T09:00:00-07:00')];
    expect(run(three).dailyStreak).toBe(3);
    const two = [doneAt('2026-09-22T09:00:00-07:00'), doneAt('2026-09-21T09:00:00-07:00')];
    expect(run(two).dailyStreak).toBe(2);
    expect(run([doneAt('2026-09-21T09:00:00-07:00')]).dailyStreak).toBe(0);
    expect(run([]).dailyStreak).toBe(0);
  });

  it('counts consecutive clean weeks and reports the current week', () => {
    const w1a = doneAt('2026-09-10T10:00:00-07:00', { dueAt: '2026-09-12T23:59:00-07:00' });
    const w1b = doneAt('2026-09-11T10:00:00-07:00', { dueAt: '2026-09-12T23:59:00-07:00' });
    const w2 = doneAt('2026-09-18T10:00:00-07:00', { dueAt: '2026-09-19T23:59:00-07:00' });
    expect(run([w1a, w1b, w2]).weeklyCleanStreak).toBe(2);

    const w2late = doneAt('2026-09-20T10:00:00-07:00', { dueAt: '2026-09-19T23:59:00-07:00' });
    expect(run([w1a, w1b, w2late]).weeklyCleanStreak).toBe(0);

    const w1late = doneAt('2026-09-13T10:00:00-07:00', { dueAt: '2026-09-12T23:59:00-07:00' });
    expect(run([w1late, w2]).weeklyCleanStreak).toBe(1);

    const openOverdue = item({ dueAt: '2026-09-21T23:59:00-07:00' });
    expect(run([w1a, w2]).currentWeekClean).toBe(true);
    expect(run([w1a, w2, openOverdue]).currentWeekClean).toBe(false);
  });

  it('awards Early Bird on the fifth early completion', () => {
    const early = (k: number) => doneAt(`2026-09-1${k}T10:00:00-07:00`, {}, '2026-09-19');
    const four = [1, 2, 3, 4].map(early);
    expect(run(four).badges.early_bird).toBeNull();
    expect(run(four).earlyCount).toBe(4);
    const five = [...four, early(5)];
    expect(run(five).badges.early_bird).toBe('2026-09-15T10:00:00-07:00');
  });

  it('awards Survived the Week when a full-capacity week is cleared on time', () => {
    const big = [1, 2, 3].map((k) =>
      doneAt(`2026-09-1${k + 3}T10:00:00-07:00`, { dueAt: '2026-09-19T23:59:00-07:00', estimatedMinutes: 500 }),
    ); // 1500 min >= 25h capacity
    expect(run(big).badges.survived_week).toBe('2026-09-19');
    const small = big.map((i) => ({ ...i, estimatedMinutes: 100 }));
    expect(run(small).badges.survived_week).toBeNull();
    const oneLate = [big[0], big[1], doneAt('2026-09-20T10:00:00-07:00', { dueAt: '2026-09-19T23:59:00-07:00', estimatedMinutes: 500 })];
    expect(run(oneLate).badges.survived_week).toBeNull();
  });

  it('awards Clean Sweep when one class is fully cleared in a week', () => {
    const a = doneAt('2026-09-15T10:00:00-07:00', { courseId: 'chem', dueAt: '2026-09-19T23:59:00-07:00' });
    const b = doneAt('2026-09-16T10:00:00-07:00', { courseId: 'chem', dueAt: '2026-09-19T23:59:00-07:00' });
    const other = item({ courseId: 'eng', dueAt: '2026-09-19T23:59:00-07:00' });
    expect(run([a, b, other]).badges.clean_sweep).toBe('2026-09-19');
    expect(run([a, other]).badges.clean_sweep).toBeNull();
  });

  it('builds last week’s recap', () => {
    const early = doneAt('2026-09-14T10:00:00-07:00', { points: 40, dueAt: '2026-09-19T23:59:00-07:00' }, '2026-09-19'); // 60
    const onTime = doneAt('2026-09-18T10:00:00-07:00', { points: 20, dueAt: '2026-09-19T23:59:00-07:00' }, '2026-09-10'); // 20
    const late = doneAt('2026-09-20T10:00:00-07:00', { points: 10, dueAt: '2026-09-19T23:59:00-07:00' }, '2026-09-10'); // 5, earned this week
    const missed = item({ dueAt: '2026-09-18T23:59:00-07:00' });
    const r = run([early, onTime, late, missed]).lastWeek;
    expect(r.weekStart).toBe('2026-09-13');
    expect(r.weekEnd).toBe('2026-09-19');
    expect(r.points).toBe(80);
    expect(r.completed).toBe(2);
    expect(r.early).toBe(1);
    expect(r.late).toBe(1);
    expect(r.missed.map((i) => i.id)).toEqual([missed.id]);
    expect(r.clean).toBe(false);
    expect(r.dueCount).toBe(4);
  });
});
