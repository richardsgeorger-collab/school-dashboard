import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../domain/types';
import { classProgress, doneLine, gradeUps, isTurnedIn, milestoneOf, turnedInSince } from './joy';

let n = 0;
const it_ = (p: Partial<Item>): Item => ({ id: `i${n++}`, courseId: 'c', title: 't', label: 't', points: 10, dueAt: '2026-10-05T06:59:00Z', status: 'todo', completedAt: null, score: null, source: 'halo', halo: null, ...p }) as Item;
const course = (id: string, pct: number | null) => ({ id, code: id.toUpperCase(), haloGrade: pct === null ? null : { percent: pct } }) as unknown as Course;

describe('class progress', () => {
  it('is points of work turned in or done over the real total from Halo, never an assumed 1,000', () => {
    const items = [it_({ points: 50, status: 'done' }), it_({ points: 30, halo: { status: 'SUBMITTED', submittedAt: '2026-10-01', checkedAt: '' } }), it_({ points: 120 }), it_({ points: 40, source: 'manual', status: 'done' })];
    expect(classProgress('c', items)).toEqual({ done: 80, total: 200, pct: 40 });
  });
  it('none when Halo gave the class no points; unchecking takes it back', () => {
    expect(classProgress('c', [it_({ points: 0 })])).toBeNull();
    const a = it_({ points: 50, status: 'done' });
    const b = it_({ points: 50 });
    expect(classProgress('c', [a, b])!.pct).toBe(50);
    expect(classProgress('c', [{ ...a, status: 'todo', completedAt: null }, b])!.pct).toBe(0);
  });
  it('milestones are 25, 50, 75 and 100', () => {
    expect([0, 24, 25, 49, 50, 74, 75, 99, 100].map(milestoneOf)).toEqual([0, 0, 25, 25, 50, 50, 75, 75, 100]);
  });
});

describe('what a sync found', () => {
  it('counts only items newly turned in, never on a first sync', () => {
    const a = it_({});
    const b = it_({ halo: { status: 'SUBMITTED', submittedAt: '2026-10-01', checkedAt: '' } });
    const c = it_({});
    const after = [{ ...a, halo: { status: 'SUBMITTED', submittedAt: '2026-10-02', checkedAt: '' } }, b, { ...c, score: 9 }];
    expect(turnedInSince([a, b, c], after)).toBe(2);
    expect(turnedInSince([], after)).toBe(0);
    expect(isTurnedIn(it_({ halo: { status: 'PUBLISHED', submittedAt: null, checkedAt: '' } }))).toBe(true);
  });
  it('grade ups only: a rise of half a point or more, never a drop or a first grade', () => {
    expect(gradeUps([course('a', 88), course('b', 91), course('c', null)], [course('a', 91.2), course('b', 89), course('c', 95)])).toEqual([{ courseId: 'a', code: 'A', percent: 91 }]);
  });
  it('the line under a check-off', () => {
    expect(doneLine(50, 'CHM-113L', 34)).toBe('+50 pts done · CHM-113L is 34% complete');
    expect(doneLine(20, null, null)).toBe('+20 pts done');
  });
});
