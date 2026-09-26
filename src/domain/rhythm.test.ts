import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem as mkBase, TZ } from '../halo/fixtures';
import type { Item } from './types';

const mkItem = (o: Partial<Item> & { id: string; courseId: string; label: string }): Item => mkBase({ title: o.label, ...o });
import { awayDays, welcomeBack } from './away';
import { classWord, paceFor, paceLine } from './pace';
import type { Schedule } from './schedule';
import { finished, offered, shouldOfferSunday, skipped, weekReview } from './sunday';
import { nextExam, weakLine, weakSpots, weakTopicFor } from './weak';

const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const esg = mkCourse({ id: 'c2', code: 'ESG-162' });
const eng = mkCourse({ id: 'c3', code: 'ENG-105' });
const today = '2026-09-14';
const at = (d: string) => `${d}T23:59:00-07:00`;
const items = [
  mkItem({ id: 'a', courseId: 'c1', label: 'Chem Quiz 1', dueAt: at('2026-09-20') }),
  mkItem({ id: 'b', courseId: 'c1', label: 'Chem HW 1', dueAt: at('2026-09-22') }),
  mkItem({ id: 'c', courseId: 'c2', label: 'Math HW 2', dueAt: at('2026-09-15') }),
  mkItem({ id: 'd', courseId: 'c3', label: 'English Essay 1', dueAt: at('2026-09-12') }),
  mkItem({ id: 'e', courseId: 'c3', label: 'English DQ 1', dueAt: at('2026-09-16'), status: 'done', completedAt: '2026-09-11T20:00:00-07:00' }),
  mkItem({ id: 'p', courseId: 'c3', label: 'English Participation', type: 'participation', dueAt: at('2026-09-10') }),
];
const sched = (startBy: Record<string, string>): Schedule => ({ byItem: Object.fromEntries(items.map((i) => [i.id, { id: i.id, startBy: startBy[i.id] ?? i.dueAt.slice(0, 10), deadlineDay: i.dueAt.slice(0, 10), risk: 'ok' as const, minutes: 30 }])), days: {} }) as unknown as Schedule;

describe('pace, not hours', () => {
  it('names each class by the word its labels use', () => {
    expect(classWord(chm, items)).toBe('Chem');
    expect(classWord(eng, items)).toBe('English');
    expect(classWord(mkCourse({ id: 'zz', code: 'UNV-106' }), items)).toBe('UNV');
  });
  it('is behind past a deadline, ahead with three free days, on pace otherwise, clear with nothing open', () => {
    const s = sched({ a: '2026-09-17', b: '2026-09-20', c: '2026-09-14' });
    expect(paceFor(chm, items, s, today)).toEqual({ kind: 'ahead', days: 3 });
    expect(paceFor(esg, items, s, today)).toEqual({ kind: 'on' });
    expect(paceFor(eng, items, s, today)).toEqual({ kind: 'behind', n: 1 });
    expect(paceFor(eng, items.filter((i) => i.id !== 'd'), s, today)).toEqual({ kind: 'clear' });
    expect(paceLine([chm, esg, eng], items, s, today)).toBe('You are behind in English: 1 thing should have been started by now. Clearing English first fixes most of it.');
    const lab = mkCourse({ id: 'c4', code: 'CHM-113L' });
    const withLab = [...items, mkItem({ id: 'l1', courseId: 'c4', label: 'Chem Lab 1', dueAt: at('2026-09-11') })];
    expect(paceLine([chm, lab, eng], withLab, { byItem: { ...s.byItem, l1: { startBy: '2026-09-10', deadlineDay: '2026-09-11' } } } as unknown as Schedule, today)).toBe('You are behind in Chem Lab and English: 2 things should have been started by now. Clearing Chem Lab first fixes most of it.');
  });
  it('groups classes in the same state and drops clear ones', () => {
    const s = sched({ a: '2026-09-14', b: '2026-09-20', c: '2026-09-15' });
    expect(paceLine([chm, esg, eng], items.filter((i) => i.id !== 'd'), s, today)).toBe('You are on pace. Chem and Math start today.');
    expect(paceLine([chm], [], s, today)).toBeNull();
  });
});

describe('where points went', () => {
  const graded = [
    mkItem({ id: 'g1', courseId: 'c1', title: 'Topic 2 Quiz', label: 'Chem Quiz 2', points: 20, score: 12, status: 'done', dueAt: at('2026-09-08') }),
    mkItem({ id: 'g2', courseId: 'c1', title: 'Topic 1 Quiz', label: 'Chem Quiz 1', points: 20, score: 19, status: 'done', dueAt: at('2026-09-01') }),
    mkItem({ id: 'g3', courseId: 'c1', title: 'ALEKS 2', label: 'Chem ALEKS 2', points: 10, score: 7, status: 'done', dueAt: at('2026-09-10') }),
    mkItem({ id: 'x1', courseId: 'c1', title: 'Exam 1', label: 'Chem Exam 1', type: 'exam', points: 150, dueAt: at('2026-10-05') }),
    mkItem({ id: 'x0', courseId: 'c1', title: 'Exam 0', label: 'Chem Exam 0', type: 'exam', points: 150, status: 'done', dueAt: at('2026-09-01') }),
  ];
  it('lists graded items under 75%, lowest first, and finds the next open exam', () => {
    expect(weakSpots('c1', graded).map((s) => [s.item.id, s.pct])).toEqual([
      ['g1', 60],
      ['g3', 70],
    ]);
    expect(nextExam('c1', graded, today, TZ)?.id).toBe('x1');
    expect(nextExam('c2', graded, today, TZ)).toBeNull();
  });
  it('writes one calm line, with the exam that covers it and what practice keeps missing', () => {
    const stats = { 'c1:limiting reagent': { courseId: 'c1', topic: 'limiting reagent', attempts: 3, misses: 2, lastAt: 'x' } };
    expect(weakLine(chm, graded, stats, today, TZ)).toBe('Lowest so far: Topic 2 Quiz at 60% and 1 other. Chem Exam 1 is in 3 weeks. Practice keeps slipping on limiting reagent.');
    expect(weakLine(chm, graded.filter((i) => i.id !== 'g3' && i.id !== 'x1'), undefined, today, TZ)).toBe('Lowest so far: Topic 2 Quiz at 60%.');
    expect(weakLine(chm, [], undefined, today, TZ)).toBeNull();
    expect(weakTopicFor(chm, graded, stats)).toBe('Topic 2 Quiz');
    expect(weakTopicFor(esg, graded, { 'c2:vectors': { courseId: 'c2', topic: 'vectors', attempts: 2, misses: 2, lastAt: 'x' } })).toBe('vectors');
    expect(weakTopicFor(esg, graded, undefined)).toBeNull();
  });
});

describe('welcome back', () => {
  it('counts days away and what slipped or changed meanwhile', () => {
    expect(awayDays(null, today)).toBe(0);
    expect(awayDays('2026-09-08', today)).toBe(6);
    const s = sched({});
    const synced = mkItem({ id: 's1', courseId: 'c1', label: 'Chem Lab 2', source: 'halo', updatedAt: '2026-09-12T10:00:00Z', dueAt: at('2026-09-30') });
    const old = mkItem({ id: 's2', courseId: 'c1', label: 'Chem Lab 1', source: 'halo', updatedAt: '2026-09-01T10:00:00Z', dueAt: at('2026-09-30') });
    const w = welcomeBack([...items, synced, old], { byItem: { ...s.byItem, s1: { id: 's1', startBy: '2026-09-28', deadlineDay: '2026-09-30', risk: 'ok', minutes: 30 }, s2: { id: 's2', startBy: '2026-09-28', deadlineDay: '2026-09-30', risk: 'ok', minutes: 30 } } } as unknown as Schedule, '2026-09-08', today);
    expect(w.days).toBe(6);
    expect(w.missed.map((i) => i.id)).toEqual(['d']);
    expect(w.changed.map((i) => i.id)).toEqual(['s1']);
  });
});

describe('Sunday review', () => {
  it('offers itself on Sundays only, once, and gives up after two waves', () => {
    expect(shouldOfferSunday(undefined, '2026-09-14')).toBe(false);
    expect(shouldOfferSunday(undefined, '2026-09-13')).toBe(true);
    expect(shouldOfferSunday(offered(undefined, '2026-09-13'), '2026-09-13')).toBe(false);
    expect(shouldOfferSunday(offered(undefined, '2026-09-13'), '2026-09-20')).toBe(true);
    const once = skipped(undefined, '2026-09-13');
    expect(once).toEqual({ skips: 1, lastOffered: '2026-09-13', lastDone: null, off: undefined });
    expect(shouldOfferSunday(once, '2026-09-20')).toBe(true);
    const twice = skipped(once, '2026-09-20');
    expect(twice.off).toBe(true);
    expect(shouldOfferSunday(twice, '2026-09-27')).toBe(false);
    expect(finished(once, '2026-09-20')).toEqual({ skips: 0, lastOffered: '2026-09-20', lastDone: '2026-09-20', off: undefined });
  });
  it('sums the week in one sentence', () => {
    const s = sched({});
    const r = weekReview(items, s, today, TZ);
    expect(r.done.map((i) => i.id)).toEqual(['e']);
    expect(r.slipped.map((i) => i.id)).toEqual(['d']);
    expect(r.coming.map((i) => i.id)).toEqual(['c', 'a']);
    expect(r.sentence).toBe('Last week: 1 done, 1 slipped. This week: 2 coming.');
    const big = [...items, mkItem({ id: 'big', courseId: 'c1', label: 'Chem Exam 1', type: 'exam', points: 150, dueAt: at('2026-09-18') })];
    const sBig = { byItem: { ...s.byItem, big: { id: 'big', startBy: '2026-09-15', deadlineDay: '2026-09-18', risk: 'ok', minutes: 120 } } } as unknown as Schedule;
    expect(weekReview(big, sBig, today, TZ).sentence).toBe('Last week: 1 done, 1 slipped. This week: 3 coming, the biggest is Chem Exam 1 on Fri.');
  });
});
