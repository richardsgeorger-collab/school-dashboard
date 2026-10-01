import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../../domain/types';
import { inAssignment, storyLines, type StoryInput } from './story';

const since = '2026-09-24T07:00:00.000Z';
const until = '2026-10-01T07:00:00.000Z';
const now = '2026-10-01T15:00:00.000Z';
const courses = [{ id: 'eng', code: 'ENG-105', haloSlugId: 'eng-x' }, { id: 'chm', code: 'CHM-113L', haloSlugId: 'chm-x' }] as Course[];
let n = 0;
const item = (p: Partial<Item>): Item => ({ id: `i${n++}`, courseId: 'eng', title: 'Item', label: '', type: 'homework', points: 10, dueAt: '2026-10-05T06:59:00.000Z', status: 'todo', completedAt: null, notes: '', source: 'halo', ...p }) as Item;
const ann = (text: string, addedAt = '2026-09-27T12:00:00.000Z') => ({ id: text, text, dueAt: null, done: false, doneAt: null, gradedOn: true, source: { kind: 'announcement' as const, id: 'p1', title: 't', quote: 'q', at: addedAt }, addedAt });
const base = (items: Item[], recap = { asked: 0, practice: 0, read: 0 }): StoryInput => ({ items, courses, since, until, now, tz: 'America/Phoenix', recap });

describe('only put in an announcement', () => {
  it('is said only when the assignment itself does not already say it', () => {
    expect(inAssignment({ text: 'Reply to 2 classmates on 2 different days' }, { title: 'Topic 3 DQ', notes: 'Post your answer, then reply to at least two classmates.', brief: null })).toBe(true);
    expect(inAssignment({ text: 'Bring your own splash goggles to lab' }, { title: 'Lab 4', notes: 'Complete the titration and write up results.', brief: null })).toBe(false);
    expect(inAssignment({ text: 'Use APA 7 headings' }, { title: 'Essay', notes: '', brief: { asks: ['Format with APA 7 headings'], rubric: [], steps: [], at: '', source: 'local' } })).toBe(true);
  });
  it('names the real requirements, two at most, and counts only the ones the assignment did not say', () => {
    const lines = storyLines(base([
      item({ title: 'Topic 3 DQ', notes: 'Reply to two classmates.', requirements: [ann('Reply to 2 classmates on 2 different days')] }),
      item({ courseId: 'chm', title: 'Lab 4', requirements: [ann('Bring your own splash goggles'), ann('Print the prelab sheet')] }),
    ]));
    const only = lines.find((l) => l.key === 'only')!;
    expect(only.n).toBe(2);
    expect(only.after).toBe(' things your professors only put in announcements, Halo+ caught:');
    expect(only.examples).toEqual(['CHM-113L: Bring your own splash goggles', 'CHM-113L: Print the prelab sheet']);
  });
  it('with nothing only-in-announcements, says it put the instructions on the right assignment instead', () => {
    const lines = storyLines(base([item({ title: 'Topic 3 DQ', notes: 'Reply to two classmates on different days.', requirements: [ann('Reply to 2 classmates on 2 different days')] })]));
    expect(lines.find((l) => l.key === 'only')).toBeUndefined();
    expect(lines.find((l) => l.key === 'found')?.examples).toEqual(['ENG-105: Reply to 2 classmates on 2 different days']);
  });
});

describe('the story', () => {
  it('a moved date, with "you knew before it mattered" only when caught before the old date', () => {
    const early = storyLines(base([item({ courseId: 'chm', title: 'Lab 4', dueAt: '2026-10-05T06:59:00.000Z', dateChange: { from: '2026-10-03T06:59:00.000Z', at: '2026-09-28T12:00:00.000Z', source: ann('x').source } })]));
    expect(early.find((l) => l.key === 'moved')).toMatchObject({ before: 'Your CHM-113L Lab 4 moved from Oct 2 to Oct 4.', after: ' You knew before it mattered.' });
    const late = storyLines(base([item({ courseId: 'chm', title: 'Lab 4', dueAt: '2026-10-05T06:59:00.000Z', dateChange: { from: '2026-09-26T06:59:00.000Z', at: '2026-09-28T12:00:00.000Z', source: ann('x').source } })]));
    expect(late.find((l) => l.key === 'moved')?.after).toBe('');
  });
  it('"on time for everything" only when every item due so far was handed in by its due time', () => {
    const due = (submittedAt: string) => item({ dueAt: '2026-09-28T06:59:00.000Z', status: 'done', completedAt: '2026-09-29T00:00:00.000Z', halo: { status: 'SUBMITTED', submittedAt, checkedAt: now } });
    expect(storyLines(base([due('2026-09-27T20:00:00.000Z'), due('2026-09-27T21:00:00.000Z')])).find((l) => l.key === 'ontime')).toMatchObject({ before: 'On time for all ', n: 2, after: ' things due this week.' });
    expect(storyLines(base([due('2026-09-27T20:00:00.000Z'), due('2026-09-28T09:00:00.000Z')])).find((l) => l.key === 'ontime')).toBeUndefined();
    expect(storyLines(base([due('2026-09-27T20:00:00.000Z'), item({ dueAt: '2026-09-28T06:59:00.000Z' })])).find((l) => l.key === 'ontime')).toBeUndefined();
  });
  it('names the test it built practice for', () => {
    const lines = storyLines(base([item({ title: 'APA Quiz', type: 'quiz', practicedAt: '2026-09-29T12:00:00.000Z' })]));
    expect(lines.find((l) => l.key === 'practice')?.before).toBe('Built practice for your ENG-105 APA Quiz.');
  });
  it('keeps the 3 to 5 most impressive lines, specific catches first, and skips anything with nothing behind it', () => {
    const items = [
      item({ courseId: 'chm', title: 'Lab 4', requirements: [ann('Bring your own splash goggles')] }),
      item({ courseId: 'chm', title: 'Lab 5', dueAt: '2026-10-05T06:59:00.000Z', dateChange: { from: '2026-10-03T06:59:00.000Z', at: '2026-09-28T12:00:00.000Z', source: ann('x').source } }),
      ...Array.from({ length: 12 }, () => item({ status: 'done', completedAt: '2026-09-29T00:00:00.000Z', dueAt: '2026-10-08T00:00:00.000Z' })),
    ];
    const lines = storyLines(base(items, { asked: 13, practice: 0, read: 6 }));
    expect(lines.map((l) => l.key)).toEqual(['only', 'moved', 'checked', 'asked', 'read']);
    expect(lines.find((l) => l.key === 'asked')).toMatchObject({ before: 'Answered ', n: 13, after: ' questions about your classes.' });
    expect(lines.some((l) => l.key === 'practice')).toBe(false);
  });
  it('a light week is never empty and claims nothing', () => {
    expect(storyLines(base([])).map((l) => l.key)).toEqual(['light-classes', 'light-next']);
    expect(storyLines({ ...base([]), courses: [] })[0].key).toBe('light-start');
  });
});
