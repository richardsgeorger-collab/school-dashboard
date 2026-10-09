import { describe, expect, it } from 'vitest';
import { mkItem } from './fixtures';
import { withStudentState } from './backgroundRead';

const src = { kind: 'announcement' as const, id: 'p1', title: 'Lab 4', quote: 'q', at: '2026-10-08T00:00:00Z' };

describe('the announcement reader writing after the student touched the item (2026-10-08)', () => {
  const at = '2026-10-08T17:00:00Z';
  const before = mkItem({ id: 'a', courseId: 'c', title: 'Topic 3 DQ 1', points: 10, dueAt: '2026-10-08T23:59:00-07:00' });
  it('keeps the check-off and the score, takes the parts, a moved date and changed points', () => {
    // The reader started from `before`; meanwhile the student checked it off and typed a score.
    const live = { ...before, status: 'done' as const, completedAt: at, score: 9, scoreSource: 'manual' as const, startedAt: at, updatedAt: at };
    const found = { ...before, requirements: [{ id: 'r1', text: 'Post by Wednesday', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: at }], dueAt: '2026-10-09T23:59:00-07:00', dateChange: { from: before.dueAt, at, source: src }, points: 15, updatedAt: '2026-10-08T17:00:30Z' };
    const out = withStudentState(live, found);
    expect(out.status).toBe('done');
    expect(out.completedAt).toBe(at);
    expect(out.score).toBe(9);
    expect(out.scoreSource).toBe('manual');
    expect(out.requirements?.map((r) => r.text)).toEqual(['Post by Wednesday']);
    expect(out.dueAt).toBe('2026-10-09T23:59:00-07:00');
    expect(out.dateChange?.from).toBe(before.dueAt);
    expect(out.points).toBe(15);
  });
  it('an item the planner does not have yet is written as found', () => {
    expect(withStudentState(undefined, before)).toBe(before);
  });
});
