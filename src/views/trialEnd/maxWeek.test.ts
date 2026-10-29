import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../../domain/types';
import { maxWeek, type MaxCounts } from './maxWeek';

const since = '2026-10-20T07:00:00.000Z';
const until = '2026-10-27T07:00:00.000Z';
const tz = 'America/Phoenix';
const courses = [{ id: 'bio', code: 'BIO-181L' }, { id: 'psy', code: 'PSY-102' }, { id: 'eng', code: 'ENG-105' }] as Course[];
let k = 0;
const item = (p: Partial<Item>): Item => ({ id: `i${k++}`, courseId: 'bio', title: 'Item', label: '', type: 'homework', points: 10, dueAt: '2026-10-30T06:59:00.000Z', status: 'todo', completedAt: null, notes: '', source: 'halo', ...p }) as Item;
const src = (at: string) => ({ kind: 'announcement' as const, id: 'p1', title: 't', quote: 'q', at });
const ann = (text: string, addedAt = '2026-10-22T12:00:00.000Z', extra: Record<string, unknown> = {}) => ({ id: text, text, dueAt: null, done: false, doneAt: null, gradedOn: true, source: src(addedAt), addedAt, ...extra });
const zero: MaxCounts = { read: 0, autoSyncs: 0, reminders: 0, sundays: 0, practice: 0 };
const week = (items: Item[], counts: Partial<MaxCounts> = {}) => maxWeek({ items, courses, since, until, tz, counts: { ...zero, ...counts } });

describe("Max's week", () => {
  it('a busy week: every kind of catch, the strongest first, and only Max lines, none of them zero', () => {
    const w = week(
      [
        item({ title: 'Lab 4: Photosynthesis', points: 50, notes: 'Complete the lab.', requirements: [ann('Bring your own splash goggles'), ann('Sign the lab safety waiver before lab', undefined, { dueAt: '2026-10-28T06:59:00.000Z' })] }),
        item({ courseId: 'psy', title: 'Topic 3 Homework', points: 30, dueAt: '2026-10-29T06:59:00.000Z', dateChange: { from: '2026-10-27T06:59:00.000Z', at: '2026-10-23T12:00:00.000Z', source: src('2026-10-23T12:00:00.000Z') } }),
        item({ courseId: 'eng', title: 'Peer review', points: 20, origin: src('2026-10-24T12:00:00.000Z') }),
        // Done work and checked-off work are not Max: nothing here counts them.
        item({ title: 'Lab 3', status: 'done', completedAt: '2026-10-22T12:00:00.000Z' }),
      ],
      { read: 12, autoSyncs: 14, reminders: 9, sundays: 1, practice: 0 },
    );
    expect(w.headline).toBe("Max caught 4 things this week you'd have missed.");
    // A step with its own hidden deadline on a 50-point lab is the strongest; then the moved date, the new assignment.
    expect(w.caught.map((c) => c.kind)).toEqual(['step', 'moved', 'new', 'step']);
    expect(w.caught[1]).toMatchObject({ code: 'PSY-102', what: 'Topic 3 Homework moved to Wed, Oct 28 (was Mon, Oct 26)', on: null });
    expect(w.caught[2]).toMatchObject({ code: 'ENG-105', what: 'Peer review, only announced, due Thu, Oct 29' });
    expect(w.caught[0]).toMatchObject({ code: 'BIO-181L', what: 'Sign the lab safety waiver before lab', on: 'Lab 4: Photosynthesis' });
    expect(w.lines.map((l) => [l.key, l.n])).toEqual([['read', 12], ['moved', 1], ['steps', 2], ['syncs', 14], ['reminders', 9], ['sunday', 1]]);
    expect(w.lines.find((l) => l.key === 'sunday')).toMatchObject({ before: '', after: ' Sunday preview of your week' });
    expect(JSON.stringify(w)).not.toMatch(/checked off|on time|\b0 /i);
  });

  it('never counts what the assignment already said, a class rule, or a generic line', () => {
    const w = week([
      item({ courseId: 'psy', title: 'Topic 3 DQ', notes: 'Reply to at least two classmates.', requirements: [ann('Reply to 2 classmates on 2 different days', undefined, { gradedOn: false }), ann('Acknowledge this announcement'), ann('Cite any AI-generated content', undefined, { scope: 'rule' })] }),
    ]);
    expect(w.caught).toEqual([]);
  });

  it('only this week: a catch from before the trial does not count', () => {
    const w = week([item({ requirements: [ann('Bring a calculator', '2026-10-10T12:00:00.000Z')] })], { read: 2 });
    expect(w.caught).toEqual([]);
    expect(w.headline).toBe('Max read 2 announcements for you this week.');
  });

  it('a quiet week: no zeros anywhere, and an honest headline', () => {
    const quiet = week([item({ status: 'done', completedAt: '2026-10-22T12:00:00.000Z' })]);
    expect(quiet).toEqual({ caught: [], lines: [], headline: 'Your free week is over. Everything you have stays.', any: false });
    const syncs = week([], { autoSyncs: 6 });
    expect(syncs.headline).toBe('Max kept Halo synced 6 times while you were away.');
    expect(syncs.lines).toEqual([{ key: 'syncs', n: 6, before: '', after: " times Halo synced on its own while you weren't on it" }]);
    expect(week([], { reminders: 1 }).headline).toBe('Max sent you 1 reminder this week.');
  });

  it('a moved date only counts when the day really changed', () => {
    const same = week([item({ dueAt: '2026-10-29T06:59:00.000Z', dateChange: { from: '2026-10-29T05:00:00.000Z', at: '2026-10-23T12:00:00.000Z', source: src('2026-10-23T12:00:00.000Z') } })]);
    expect(same.caught).toEqual([]);
  });
});
