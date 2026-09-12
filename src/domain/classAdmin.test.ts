import { describe, expect, it } from 'vitest';
import { mkCourse, mkData, mkItem, NOW, TZ } from '../halo/fixtures';
import { actualStats } from './calibration';
import { applyOnline, bankedAsItems, logTiming, resetCourseItems } from './classAdmin';
import { computeProgress } from './points';

const eng = mkCourse({ id: 'eng', code: 'ENG-105' });
const chm = mkCourse({ id: 'chm', code: 'CHM-113' });
const award = { base: 10, multiplier: 1.5 as const, earnedAt: '2026-09-10T20:00:00Z', scoreFactor: null };
const items = [
  mkItem({ id: 'e1', courseId: 'eng', title: 'Essay 1', status: 'done', completedAt: '2026-09-10T20:00:00Z', award, actualMinutes: 50, notes: 'eng note', dueAt: '2026-09-11T23:59:00-07:00' }),
  mkItem({ id: 'e2', courseId: 'eng', title: 'Essay 2', flags: { inClass: true, group: false, lopesWrite: false, timed: false, practice: false } }),
  mkItem({ id: 'c1', courseId: 'chm', title: 'Quiz 1', status: 'done', completedAt: '2026-09-10T21:00:00Z', award, actualMinutes: 20, notes: 'chem note' }),
  mkItem({ id: 'c2', courseId: 'chm', title: 'Quiz 2' }),
];
const data = { ...mkData([eng, chm], items), settings: { ...mkData([eng, chm], []).settings, timings: [{ itemId: 'c1', courseId: 'chm', type: 'homework' as const, minutes: 20, at: NOW }] } };

describe('resetting one class', () => {
  const plan = resetCourseItems(data, 'eng', NOW);
  it('deletes only that class and reports the count', () => {
    expect(plan.deletedIds).toEqual(['e1', 'e2']);
    expect(plan.items.map((i) => i.id)).toEqual(['c1', 'c2']);
    expect(plan.items.find((i) => i.id === 'c1')).toEqual(items[2]);
  });
  it('keeps XP and streaks through the bank', () => {
    const before = computeProgress(data.items, data.settings, '2026-09-11');
    const live = new Set(plan.items.map((i) => i.id));
    const after = computeProgress([...plan.items, ...bankedAsItems(plan.settings.bankedAwards, live)], plan.settings, '2026-09-11');
    expect(before.xp).toBe(30);
    expect(after.xp).toBe(before.xp);
    expect(after.dailyStreak).toBe(before.dailyStreak);
    expect(plan.settings.bankedAwards?.map((b) => b.itemId)).toEqual(['e1']);
  });
  it('keeps logged minutes in the ledger so calibration still sees them', () => {
    expect(plan.settings.timings?.map((t) => [t.itemId, t.minutes])).toEqual([
      ['c1', 20],
      ['e1', 50],
    ]);
    const stats = actualStats(plan.items, plan.settings.timings);
    expect(stats.get('eng|homework')).toEqual({ n: 1, mean: 50 });
    expect(stats.get('chm|homework')).toEqual({ n: 1, mean: 20 });
  });
  it('does not double count a timing the item still carries', () => {
    const stats = actualStats(data.items, logTiming(data.settings.timings, items[0], 50, NOW));
    expect(stats.get('eng|homework')).toEqual({ n: 1, mean: 50 });
  });
});

describe('online classes', () => {
  it('clears in-class flags for that class only', () => {
    const r = applyOnline(items, 'eng', true);
    expect(r.touched).toEqual(['e2']);
    expect(r.items.find((i) => i.id === 'e2')?.flags.inClass).toBe(false);
    expect(r.items.find((i) => i.id === 'c2')).toBe(items[3]);
    expect(applyOnline(items, 'eng', false).touched).toEqual([]);
  });
});

describe('fixtures sanity', () => {
  it('uses the Phoenix zone', () => {
    expect(TZ).toBe('America/Phoenix');
  });
});
