import { describe, expect, it } from 'vitest';
import { mkItem } from '../halo/fixtures';
import { neededFor, projectWith, weights } from './whatif';

const items = [
  mkItem({ id: 'dq', courseId: 'c1', title: 'DQ 1', points: 5, score: 5 }),
  mkItem({ id: 'hw', courseId: 'c1', title: 'HW 1', points: 45, score: 36 }),
  mkItem({ id: 'ex', courseId: 'c1', title: 'Exam 1', points: 150 }),
  mkItem({ id: 'fin', courseId: 'c1', title: 'Final', points: 300 }),
  mkItem({ id: 'other', courseId: 'c2', title: 'Elsewhere', points: 999 }),
];

describe('grade what-if', () => {
  it('shows each item as a share of the class, biggest first', () => {
    const w = weights('c1', items);
    expect(w.map((x) => [x.item.id, x.pct, x.graded])).toEqual([
      ['fin', 60, false],
      ['ex', 30, false],
      ['hw', 9, true],
      ['dq', 1, true],
    ]);
  });
  it('projects a hypothetical score without touching the stored items', () => {
    const p = projectWith('c1', items, 'ex', 120);
    expect(p.average).toBe(80.5);
    expect(p.projected).toBe(80.5);
    expect(items.find((i) => i.id === 'ex')?.score).toBeNull();
  });
  it('says what the final needs for an A, at the current average or with the rest perfect', () => {
    // earned 41 of 50 graded (82%); exam assumed at 82% → 123; need 450 for 90% of 500 → final needs 286.
    const n = neededFor('c1', items, 'fin', 90)!;
    expect(n.restAt).toBe(82);
    expect(n.points).toBe(286);
    expect(n.pctOfItem).toBe(95.3);
    expect(n.reachable).toBe(true);
    const perfect = neededFor('c1', items, 'fin', 90, 'perfect')!;
    expect(perfect.points).toBe(259);
    expect(neededFor('c1', items, 'fin', 99)?.reachable).toBe(false);
    expect(neededFor('c1', items, 'dq', 50)).toBeNull();
    expect(neededFor('c1', items, 'fin', 10)?.alreadyThere).toBe(true);
  });
});
