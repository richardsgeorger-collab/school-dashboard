import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../domain/types';
import { bestDay, fasterMoment, gradeUpBody, gradeUpText, termMilestone, turnedInCount, weekCleared } from './joy';
import { classProgress, daysEarly, doneLine, gradedLine, gradedWell, gradeUps, isTurnedIn, milestoneOf, topicsCleared, turnedInSince } from './joy';

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

describe('phase 7: graded well, topics cleared, days early', () => {
  it('celebrates a new Halo score of 90% or better, never a lower one, never on a first sync', () => {
    const a = it_({ points: 50, label: 'Lab 3', status: 'done' });
    const b = it_({ points: 50, label: 'Lab 4', status: 'done' });
    const c = it_({ points: 50, label: 'Lab 5', status: 'done', score: 40 });
    const after = [{ ...a, score: 47 }, { ...b, score: 44 }, { ...c, score: 49 }];
    const got = gradedWell([a, b, c], after);
    expect(got.map((g) => g.label)).toEqual(['Lab 3']);
    expect(gradedLine(got[0])).toBe('Graded: 47/50 on Lab 3.');
    expect(gradedWell([], after)).toEqual([]);
  });
  it('clears a topic only when every assignment with points in it is done, and takes it back when one is unchecked', () => {
    const t1 = it_({ haloUnitId: 'u4', topic: 'Topic 4', status: 'done' });
    const t2 = it_({ haloUnitId: 'u4', topic: 'Topic 4', halo: { status: 'SUBMITTED', submittedAt: '2026-10-01T00:00:00Z', checkedAt: '' } });
    const zero = it_({ haloUnitId: 'u4', points: 0 });
    const solo = it_({ haloUnitId: 'u5', status: 'done' });
    expect(topicsCleared([t1, t2, zero, solo])).toEqual([{ key: 'c|u4', courseId: 'c', topic: 'Topic 4' }]);
    expect(topicsCleared([{ ...t1, status: 'todo' }, t2])).toEqual([]);
  });
  it('says days early only when it was at least a day ahead', () => {
    expect(daysEarly('2026-10-05T06:59:00Z', '2026-10-02T20:00:00Z')).toBe(2);
    expect(daysEarly('2026-10-05T06:59:00Z', '2026-10-04T20:00:00Z')).toBeNull();
    expect(daysEarly(null, '2026-10-04T20:00:00Z')).toBeNull();
    expect(doneLine(50, 'CHM-113L', 34, 2)).toBe('+50 pts done, 2 days early · CHM-113L is 34% complete');
    expect(doneLine(50, 'CHM-113L', 34, 1)).toBe('+50 pts done, 1 day early · CHM-113L is 34% complete');
  });
});

describe('round two: letters, full marks, the term, best day, week cleared, faster', () => {
  const scale = [{ label: 'A', minPercent: 93, maxPercent: null }, { label: 'A-', minPercent: 90, maxPercent: 92.99 }, { label: 'B+', minPercent: 87, maxPercent: 89.99 }];
  const withScale = (id: string, pct: number) => ({ ...course(id, pct), gradeScale: scale }) as unknown as Course;
  it('names the letter only when the rise crossed into a new one', () => {
    expect(gradeUps([withScale('a', 91)], [withScale('a', 93.4)])).toEqual([{ courseId: 'a', code: 'A', percent: 93, letter: 'A' }]);
    expect(gradeUps([withScale('a', 93.1)], [withScale('a', 95)])).toEqual([{ courseId: 'a', code: 'A', percent: 95 }]);
    expect(gradeUpText({ courseId: 'a', code: 'BIO-181', percent: 93, letter: 'A' })).toBe('Your BIO-181 grade went up to 93%, now an A.');
    expect(gradeUpText({ courseId: 'a', code: 'BIO-181', percent: 88, letter: 'B+' })).toBe('Your BIO-181 grade went up to 88%, now a B+.');
    expect(gradeUpBody([{ courseId: 'a', code: 'BIO-181', percent: 93, letter: 'A' }])).toBe('Your BIO-181 grade went up to 93%, now an A.');
  });
  it('says full marks for a perfect score', () => {
    expect(gradedLine({ id: 'x', label: 'Lab 3', score: 50, points: 50 })).toBe('Full marks: 50/50 on Lab 3.');
  });
  it('counts things turned in on Halo for the term marks', () => {
    const items = Array.from({ length: 26 }, (_, k) => it_({ halo: { status: 'SUBMITTED', submittedAt: '2026-09-01T00:00:00Z', checkedAt: '' }, id: `t${k}` }));
    expect(turnedInCount([...items, it_({ status: 'done', source: 'manual' }), it_({})])).toBe(26);
    expect(termMilestone(26)).toBe(25);
    expect(termMilestone(9)).toBe(0);
  });
  it('finds a best day only after a week of history, with three or more, beating every earlier day', () => {
    const tz = 'America/Phoenix';
    const on = (day: string, n: number) => Array.from({ length: n }, () => it_({ status: 'done', completedAt: `${day}T19:00:00Z` }));
    const history = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'].flatMap((d) => on(d, 2));
    expect(bestDay([...history, ...on('2026-10-02', 3)], '2026-10-02', tz)).toEqual({ today: 3, best: 2, record: true });
    expect(bestDay([...history, ...on('2026-10-02', 2)], '2026-10-02', tz).record).toBe(false);
    expect(bestDay([...history.slice(2), ...on('2026-10-02', 3)], '2026-10-02', tz).record).toBe(false);
  });
  it('clears the week with a day to spare, not on its last day, and never with one thing left', () => {
    const tz = 'America/Phoenix';
    const due = (d: string, done: boolean) => it_({ dueAt: `${d}T06:59:00Z`, status: done ? 'done' : 'todo', completedAt: done ? '2026-09-30T19:00:00Z' : null });
    // Monday-start week of Sep 28 to Oct 4 (Phoenix): due Oct 1 and Oct 3.
    expect(weekCleared([due('2026-10-02', true), due('2026-10-04', true)], '2026-10-01', tz, 1)).toBe('2026-09-28');
    expect(weekCleared([due('2026-10-02', true), due('2026-10-04', false)], '2026-10-01', tz, 1)).toBeNull();
    expect(weekCleared([due('2026-10-02', true), due('2026-10-04', true)], '2026-10-04', tz, 1)).toBeNull();
    expect(weekCleared([due('2026-10-02', true)], '2026-10-01', tz, 1)).toBeNull();
  });
  it('says faster only when it was a quarter quicker, never slower', () => {
    expect(fasterMoment(30, 60)?.text).toBe('Faster than planned: 30m, planned 1h.');
    expect(fasterMoment(50, 60)).toBeNull();
    expect(fasterMoment(90, 60)).toBeNull();
    expect(fasterMoment(5, 15)).toBeNull();
  });
});
