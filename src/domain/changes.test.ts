import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { changesLine, changesSince, snapshotOf } from './changes';

const at = (d: string) => `${d}T23:59:00-07:00`;
const day = (d: string) => d.slice(5);
const src = { kind: 'announcement' as const, id: 'p', title: 't', quote: 'q', at: '2026-10-05T00:00:00Z' };
const base = [
  mkItem({ id: 'a', courseId: 'c', title: 'Quiz 2', points: 50, dueAt: at('2026-10-06'), source: 'halo' }),
  mkItem({ id: 'b', courseId: 'c', title: 'Lab 3', points: 50, dueAt: at('2026-10-08'), source: 'halo', status: 'done', completedAt: '2026-10-04T00:00:00Z' }),
  mkItem({ id: 'm', courseId: 'c', title: 'My note', points: 0, dueAt: at('2026-10-09'), source: 'manual' }),
];

describe('since you last looked', () => {
  it('says nothing on a first visit, and nothing when nothing changed', () => {
    expect(changesSince(null, base, TZ, day)).toEqual([]);
    expect(changesSince(snapshotOf(base, TZ, 'x'), base, TZ, day)).toEqual([]);
    expect(changesLine([])).toBeNull();
  });
  it('finds new work, a moved date, a new grade and a new ask from an announcement', () => {
    const snap = snapshotOf(base, TZ, 'x');
    const now = [
      { ...base[0], dueAt: at('2026-10-09') },
      { ...base[1], score: 47, scoreSource: 'halo' as const },
      { ...base[2], requirements: [] },
      mkItem({ id: 'n', courseId: 'c', title: 'Topic 5 Homework', points: 20, dueAt: at('2026-10-12'), source: 'halo', requirements: [{ id: 'r1', text: 'Show your work', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: 'x' }] }),
    ];
    const ch = changesSince(snap, now, TZ, day);
    expect(ch.map((c) => [c.kind, c.item.title, c.detail])).toEqual([
      ['moved', 'Quiz 2', '10-06 → 10-09'],
      ['graded', 'Lab 3', '47/50'],
      ['new', 'Topic 5 Homework', 'due 10-12'],
    ]);
    expect(changesLine(ch)).toBe('1 new assignment, 1 due date moved, 1 new grade');
  });
  it('a requirement an announcement added to unfinished work is news; the student\'s own edits are not', () => {
    const snap = snapshotOf(base, TZ, 'x');
    const asks = [{ ...base[0], requirements: [{ id: 'r9', text: 'Bring a calculator', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: 'x' }] }, base[1], { ...base[2], dueAt: at('2026-10-11') }];
    expect(changesSince(snap, asks, TZ, day).map((c) => [c.kind, c.detail])).toEqual([['asks', 'Bring a calculator']]);
    // A score typed here by the student, not news.
    expect(changesSince(snap, [base[0], { ...base[1], score: 40, scoreSource: 'manual' as const }, base[2]], TZ, day)).toEqual([]);
  });
});
