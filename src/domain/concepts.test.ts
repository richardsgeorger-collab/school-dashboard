import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { conceptLine, conceptWarnings, topicScores, weakConcepts } from './concepts';
import type { QuizStat, TopicLink } from './types';

const at = (d: string) => `${d}T23:59:00-07:00`;
const today = '2026-09-15';
const chm = mkCourse({ id: 'chm', code: 'CHM-113', termStart: '2026-08-31', topics: [{ name: 'stoichiometry', week: 3, buildsOn: ['moles'] }, { name: 'limiting reagent', week: 5, buildsOn: ['stoichiometry'] }, { name: 'gas laws', week: 9, buildsOn: ['moles'] }] });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', termStart: '2026-08-31', topics: [{ name: 'dimensional analysis', week: 2, buildsOn: [] }, { name: 'derivatives', week: 6, buildsOn: [] }, { name: 'optimization', week: 12, buildsOn: ['derivatives'] }] });
const items = [
  mkItem({ id: 'q2', courseId: 'chm', title: 'Topic 2 Quiz', topic: 'stoichiometry', points: 20, score: 12, status: 'done', dueAt: at('2026-09-10') }),
  mkItem({ id: 'hw2', courseId: 'chm', title: 'HW 2', points: 10, score: 6, status: 'done', dueAt: at('2026-09-11'), plan: { asks: '', startBy: null, minutes: null, milestones: [], prerequisites: [], flags: { lopesWrite: false, timed: false, group: false, inPerson: false }, topics: ['stoichiometry', 'moles'], feeds: null, sources: [], citations: [], model: 'm', at: '', inputHash: 'h' } }),
  mkItem({ id: 'hw3', courseId: 'chm', title: 'HW 3', topic: 'limiting reagent', points: 10, dueAt: at('2026-09-27') }),
  mkItem({ id: 'ex1', courseId: 'esg', title: 'Exam 1', topic: 'derivatives', points: 100, score: 91, status: 'done', dueAt: at('2026-09-12') }),
  mkItem({ id: 'hw5', courseId: 'esg', title: 'Homework 5', topic: 'dimensional analysis', points: 20, dueAt: at('2026-10-05') }),
];
const links: TopicLink[] = [{ a: { courseId: 'chm', topic: 'stoichiometry' }, b: { courseId: 'esg', topic: 'dimensional analysis' }, note: 'Mole ratios are unit conversions.' }];

describe('scores by topic, not by class', () => {
  it('groups graded points by the topics an item carries and folds in what practice keeps missing', () => {
    const stats: Record<string, QuizStat> = { a: { courseId: 'chm', topic: 'gas laws', attempts: 6, misses: 4, lastAt: '' } };
    const scores = topicScores('chm', items, stats);
    expect(scores.map((s) => [s.topic, s.pct, s.graded, s.misses])).toEqual([
      ['stoichiometry', 60, 2, 0],
      ['moles', 60, 1, 0],
      ['gas laws', null, 0, 4],
    ]);
    expect(weakConcepts('chm', items, stats).map((w) => w.topic)).toEqual(['stoichiometry', 'moles', 'gas laws']);
    expect(weakConcepts('esg', items, undefined)).toEqual([]);
  });
});

describe('one line when a weak topic meets later material', () => {
  it('follows the class map and the cross-class links to the first open item, and says how far out it is', () => {
    const w = conceptWarnings([chm, esg], items, links, undefined, today, TZ);
    // Gas laws (syllabus week 9, Oct 26) sits past the five-week horizon and stays quiet.
    expect(w.map((x) => [x.weak, x.dependent, x.dependentCourseId, x.when, x.weeksOut, x.itemId])).toEqual([
      ['stoichiometry', 'limiting reagent', 'chm', '2026-09-27', 2, 'hw3'],
      ['stoichiometry', 'dimensional analysis', 'esg', '2026-10-05', 3, 'hw5'],
    ]);
    expect(conceptWarnings([chm, esg], items, links, undefined, today, TZ, 60).map((x) => [x.dependent, x.when, x.itemId])).toContainEqual(['gas laws', '2026-10-26', null]);
    expect(w[0].line).toBe("You're not getting stoichiometry (60% so far). CHM-113 limiting reagent assumes it and it's 2 weeks out.");
    expect(conceptLine(w)).toBe(w[0].line);
    // Nothing inside three weeks: nothing on Now.
    expect(conceptLine(w.filter((x) => x.weeksOut > 3))).toBeNull();
    // A strong topic raises nothing even with dependents ahead.
    expect(conceptWarnings([esg], items, [], undefined, today, TZ)).toEqual([]);
  });
  it('a syllabus week dates a dependent with no item yet, and the horizon cuts off the far ones', () => {
    const w = conceptWarnings([chm, esg], items, links, undefined, today, TZ, 15);
    expect(w.map((x) => x.dependent)).toEqual(['limiting reagent']);
  });
});
