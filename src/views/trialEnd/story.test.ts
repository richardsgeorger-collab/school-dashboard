import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../../domain/types';
import { exampleRank, inAssignment, storyLines, type StoryInput } from './story';

const since = '2026-09-24T07:00:00.000Z';
const until = '2026-10-01T07:00:00.000Z';
const now = '2026-10-01T15:00:00.000Z';
const courses = [{ id: 'eng', code: 'ENG-105', haloSlugId: 'eng-x' }, { id: 'chm', code: 'CHM-113L', haloSlugId: 'chm-x' }] as Course[];
let n = 0;
const item = (p: Partial<Item>): Item => ({ id: `i${n++}`, courseId: 'eng', title: 'Item', label: '', type: 'homework', points: 10, dueAt: '2026-10-05T06:59:00.000Z', status: 'todo', completedAt: null, notes: '', source: 'halo', ...p }) as Item;
const ann = (text: string, addedAt = '2026-09-27T12:00:00.000Z', extra: { scope?: 'instance' | 'rule' | 'reference'; dueAt?: string | null; gradedOn?: boolean } = {}) => ({ id: text, text, dueAt: null, done: false, doneAt: null, gradedOn: true, source: { kind: 'announcement' as const, id: 'p1', title: 't', quote: 'q', at: addedAt }, addedAt, ...extra });
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
    // Four at most, so the rating shows without scrolling on a laptop.
    expect(lines.map((l) => l.key)).toEqual(['only', 'moved', 'checked', 'asked']);
    expect(lines.find((l) => l.key === 'asked')).toMatchObject({ before: 'Answered ', n: 13, after: ' questions about your classes.' });
    expect(lines.some((l) => l.key === 'practice')).toBe(false);
    expect(lines.some((l) => l.key === 'read')).toBe(false);
  });
  it('a light week is never empty and claims nothing', () => {
    expect(storyLines(base([])).map((l) => l.key)).toEqual(['light-classes', 'light-next']);
    expect(storyLines({ ...base([]), courses: [] })[0].key).toBe('light-start');
  });
});

describe('which announcement requirements make the examples', () => {
  it('a deadline, a grade or a thing to do beats a standing class rule', () => {
    expect(exampleRank({ text: 'Reply to 2 classmates by Sunday', dueAt: null, gradedOn: true, scope: 'instance' })).toBeGreaterThan(0);
    expect(exampleRank({ text: 'Sign the lab safety waiver before lab', dueAt: null, gradedOn: false })).toBeGreaterThan(0);
    expect(exampleRank({ text: 'Turn in the prelab sheet', dueAt: '2026-10-02T06:59:00.000Z', gradedOn: true })).toBeGreaterThan(0);
    expect(exampleRank({ text: 'Cite any AI-generated content', dueAt: null, gradedOn: true, scope: 'rule' })).toBeLessThanOrEqual(0);
    expect(exampleRank({ text: 'Avoid Grammarly on written work', dueAt: null, gradedOn: true })).toBeLessThanOrEqual(0);
    expect(exampleRank({ text: 'Office hours are on Zoom', dueAt: null, gradedOn: false, scope: 'reference' })).toBeLessThanOrEqual(0);
  });
  it('shows actions first, never pads a real action out with a rule, and falls back to rules only when that is all there is', () => {
    const mixed = storyLines(base([
      item({ courseId: 'chm', title: 'Lab 4', requirements: [ann('Cite any AI-generated content', undefined, { scope: 'rule' }), ann('Avoid Grammarly on written work'), ann('Sign the lab safety waiver before lab', undefined, { scope: 'instance' })] }),
    ])).find((l) => l.key === 'only')!;
    expect(mixed.n).toBe(3);
    expect(mixed.examples).toEqual(['CHM-113L: Sign the lab safety waiver before lab']);
    const rulesOnly = storyLines(base([item({ courseId: 'chm', title: 'Lab 4', requirements: [ann('Cite any AI-generated content', undefined, { scope: 'rule' }), ann('Avoid Grammarly on written work')] })])).find((l) => l.key === 'only')!;
    expect([...rulesOnly.examples!].sort()).toEqual(['CHM-113L: Avoid Grammarly on written work', 'CHM-113L: Cite any AI-generated content']);
  });
});
