import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { isParticipation } from './participation';
import { statusLine } from './now';
import { checklistFor, lateCount, participationThisWeek, policyLine, tickLine, weekLine } from './participationWeek';
import type { Requirement } from './types';

const NOW = '2026-09-29T15:00:00.000Z';
const today = '2026-09-29';
const req = (id: string, text: string, done = false): Requirement => ({ id, text, dueAt: null, done, doneAt: null, gradedOn: true, source: { kind: 'announcement', id: 'a', title: 'Week 4', quote: 'q', at: NOW }, addedAt: NOW });
const unv = mkCourse({ id: 'unv', code: 'UNV-106', participation: { description: 'Participating…', days: 2, posts: 2 } });
const chm = mkCourse({ id: 'chm', code: 'CHM-113', participation: { description: 'Participating…', days: 0, posts: 0 } });
const esg = mkCourse({ id: 'esg', code: 'ESG-162' });
const p = (id: string, courseId: string, due: string, reqs: Requirement[] = [], status: 'todo' | 'done' = 'todo') => mkItem({ id, courseId, title: `${courseId} Week Participation`, type: 'participation', points: 10, dueAt: `${due}T23:59:00-07:00`, requirements: reqs, status });

describe('participation this week', () => {
  it('turns Halo’s rule into a line, only when it sets numbers', () => {
    expect(policyLine(unv)).toBe('2 forum posts on 2 different days');
    expect(policyLine(chm)).toBeNull();
    expect(policyLine(esg)).toBeNull();
  });
  it('lists what earns the points: the announcement lines, then Halo’s rule unless a line already says it', () => {
    const a = p('a', 'unv', '2026-10-04', [req('r1', 'Acknowledge this week’s announcement')]);
    expect(checklistFor(a, unv, NOW).map((r) => r.text)).toEqual(['Acknowledge this week’s announcement', '2 forum posts on 2 different days']);
    const b = p('b', 'unv', '2026-10-04', [req('r2', 'Reply to 2 classmates on 2 different days')]);
    expect(checklistFor(b, unv, NOW).map((r) => r.text)).toEqual(['Reply to 2 classmates on 2 different days']);
  });
  it('counts what is left across the week, one per class with nothing listed', () => {
    const items = [p('u4', 'unv', '2026-10-04', [req('r1', 'Acknowledge this week’s announcement', true)]), p('c4', 'chm', '2026-10-04', [req('r3', 'Attend in-class activities Day 1 and Day 2')]), p('e4', 'esg', '2026-10-04'), p('c5', 'chm', '2026-10-11')];
    const week = participationThisWeek(items, [unv, chm, esg], today, TZ, NOW);
    expect(week.map((e) => e.item.id).sort()).toEqual(['c4', 'e4', 'u4']);
    expect(weekLine(week)).toBe('Participation this week: 3 left');
  });
  it('says done when everything is', () => {
    const week = participationThisWeek([p('u4', 'unv', '2026-10-04', [], 'done'), p('c4', 'chm', '2026-10-04', [req('r3', 'Attend', true)], 'done')], [unv, chm], today, TZ, NOW);
    expect(weekLine(week)).toBe('Participation done this week.');
  });
  it('stores Halo’s rule line when ticked, and says when the last line is done', () => {
    const a = p('a', 'unv', '2026-10-04', [req('r1', 'Acknowledge', true)]);
    const lines = checklistFor(a, unv, NOW);
    const t = tickLine(a, lines, lines[1].id, NOW);
    expect(t.allDone).toBe(true);
    expect(t.item.requirements?.map((r) => [r.text, r.done])).toEqual([['Acknowledge', true], ['2 forum posts on 2 different days', true]]);
  });
});

describe('day-by-day participation (CHM-113, 2026-10-08)', () => {
  // As Halo sends them: 0-point discussions with a dropbox, "participation" only in the title.
  const day = (id: string, title: string, due: string, status: 'todo' | 'done' = 'todo') => mkItem({ id, courseId: 'chm', title, label: title, type: 'discussion', points: 0, dueAt: due, status, source: 'halo' });
  const d1 = day('d1', 'Week 5, Day 1 Participation', '2026-09-28T23:59:00-07:00');
  const d2 = day('d2', 'Week 5 Day 2 participation', '2026-09-30T09:00:00-07:00');
  const old = day('d0', 'Week 3, Day 1 Participation', '2026-09-14T23:59:00-07:00');
  const real = mkItem({ id: 'r', courseId: 'chm', title: 'Summary of Current Course Content Knowledge', type: 'discussion', points: 20, dueAt: '2026-09-30T08:00:00-07:00', notes: 'Your reply counts toward participation this week.' });

  it('is participation by Halo’s type or by title, any case; never by its instructions', () => {
    expect([d1, d2].every(isParticipation)).toBe(true);
    expect(isParticipation(p('w', 'chm', '2026-10-04'))).toBe(true);
    expect(isParticipation(real)).toBe(false);
  });
  it('joins the participation line: due this week, or missed in the past week as late; the hero never sees it', () => {
    const week = participationThisWeek([d1, d2, old, real, p('c5', 'chm', '2026-10-04')], [chm], today, TZ, NOW);
    expect(week.map((e) => [e.item.id, e.day, e.late])).toEqual([
      ['c5', false, false],
      ['d1', true, true],
      ['d2', true, false],
    ]);
    expect(weekLine(week)).toBe('Participation this week: 3 left');
    expect(lateCount(week)).toBe(1);
    // Done: off the count, still on the line to untick; no longer late.
    const after = participationThisWeek([{ ...d1, status: 'done' as const, completedAt: NOW }, d2, { ...old, status: 'done' as const, completedAt: '2026-09-15T01:00:00Z' }], [chm], today, TZ, NOW);
    expect(after.map((e) => [e.item.id, e.left, e.late])).toEqual([['d1', 0, false], ['d2', 1, false]]);
  });
  it('a late day is not "1 thing needs you" on Now', () => {
    expect(statusLine([d1], today, NOW, TZ).needs).toBe(0);
    expect(statusLine([d1, { ...real, dueAt: '2026-09-28T23:59:00-07:00' }], today, NOW, TZ).needs).toBe(1);
  });
});
