import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { nudgeLine, splitPrereq, todoLines, whenLine } from './sheet';

const src = { kind: 'announcement' as const, id: 'p1', title: 'Week 3', quote: 'q', at: '2026-10-05T00:00:00Z' };
const today = '2026-10-08';

describe('the assignment sheet (2026-10-08 redesign)', () => {
  it('says when, worth and how long in one line, with the weekday', () => {
    expect(whenLine({ dueAt: '2026-10-11T23:59:00-07:00', points: 100 }, 120, TZ, today)).toBe('Due Sun, Oct 11 · 100 pts · ~2h');
    expect(whenLine({ dueAt: '2026-10-08T17:00:00-07:00', points: 0 }, 25, TZ, today)).toBe('Due today 5:00 PM · ~25m');
    expect(whenLine({ dueAt: '2026-10-03T23:59:00-07:00', points: 10 }, 0, TZ, today)).toBe('Was due Sat, Oct 3 · 10 pts');
  });
  it('one nudge, only while it helps', () => {
    const due = '2026-10-11T23:59:00-07:00';
    expect(nudgeLine({ status: 'todo', dueAt: due }, '2026-10-08', '2026-10-10T23:59:00-07:00', today, TZ)).toBe('Start today to finish by Sat.');
    expect(nudgeLine({ status: 'todo', dueAt: due }, '2026-10-09', null, today, TZ)).toBe('Start tomorrow.');
    expect(nudgeLine({ status: 'todo', dueAt: '2026-10-20T23:59:00-07:00' }, '2026-10-15', null, today, TZ)).toBe('Start by Thu, Oct 15.');
    expect(nudgeLine({ status: 'done', dueAt: due }, '2026-10-08', null, today, TZ)).toBeNull();
    expect(nudgeLine({ status: 'todo', dueAt: '2026-10-03T23:59:00-07:00' }, '2026-10-01', null, today, TZ)).toBe('It is past due: the sooner it is in, the better.');
  });
  it('splits a run-on prerequisite into short items and drops the "(syllabus)" tails', () => {
    expect(splitPrereq('Claim a topic in the forum (syllabus). Read chapter 4 (syllabus); bring the handout (Halo description).')).toEqual(['Claim a topic in the forum', 'Read chapter 4', 'bring the handout']);
    expect(splitPrereq('Post your main response by Wednesday.')).toEqual(['Post your main response by Wednesday']);
  });
  it('merges asks, announcement parts and prerequisites into one list with a tag each, nothing twice', () => {
    const item = mkItem({
      id: 'a',
      courseId: 'c',
      title: 'Case Study Analysis',
      points: 50,
      dueAt: '2026-10-19T23:59:00-07:00',
      brief: { asks: ['Write 1,200 to 1,500 words in APA format', 'Case Study Analysis'], rubric: [], steps: [], at: 'x', source: 'local' },
      requirements: [
        { id: 'r1', text: 'Cite three peer-reviewed sources', dueAt: null, done: true, doneAt: 'x', gradedOn: true, source: src, addedAt: 'x' },
        { id: 'r2', text: 'Use APA throughout the term', dueAt: null, done: false, doneAt: null, gradedOn: true, scope: 'rule', source: src, addedAt: 'x' },
      ],
      plan: { asks: '', startBy: null, minutes: null, milestones: [], prerequisites: [{ text: 'Pick a case from the list (syllabus). Email the professor your pick (syllabus)', source: 'syllabus', itemId: null }, { text: 'Finish the draft', source: 'Halo', itemId: 'd1' }], flags: { lopesWrite: false, timed: false, group: false, inPerson: false }, topics: [], feeds: null, sources: [], citations: [], model: 'm', at: 'x', inputHash: 'h' },
      askDone: ['ask:pick a case from the list'],
    });
    const lines = todoLines(item, TZ);
    expect(lines.map((l) => [l.text, l.tag, l.done, l.kind])).toEqual([
      ['Write 1,200 to 1,500 words in APA format', 'Halo', false, 'ask'],
      ['Cite three peer-reviewed sources', 'announcement', true, 'req'],
      ['Pick a case from the list', 'syllabus', true, 'pre'],
      ['Email the professor your pick', 'syllabus', false, 'pre'],
    ]);
    // The steps of a big piece of work are not in this list (they have their own fold).
    expect(todoLines({ ...item, points: 100, steps: [{ id: 's1', label: 'Outline', done: false }] }, TZ).some((l) => l.text === 'Outline')).toBe(false);
  });
});
