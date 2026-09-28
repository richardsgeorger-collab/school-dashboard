import { describe, expect, it } from 'vitest';
import { basedOn, courseGrade } from './grades';
import { DEFAULT_FLAGS, type Item } from './types';

function item(over: Partial<Item>): Item {
  return {
    id: Math.random().toString(36).slice(2),
    courseId: 'c1',
    title: 'x',
    label: 'x',
    labelOverridden: false,
    type: 'homework',
    points: 10,
    opensAt: null,
    dueAt: '2026-09-20T23:59:00-07:00',
    estimatedMinutes: 60,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    award: null,
    source: 'manual',
    updatedAt: '2026-09-09T00:00:00-07:00',
    ...over,
  };
}

describe('courseGrade', () => {
  it('sums scored items and projects the rest at the current average', () => {
    const items = [
      item({ points: 20, score: 18, status: 'done' }),
      item({ points: 50, score: 45, status: 'done' }),
      item({ points: 30 }),
      item({ courseId: 'other', points: 100, score: 10, status: 'done' }),
    ];
    const g = courseGrade('c1', items);
    expect(g.earned).toBe(63);
    expect(g.possibleGraded).toBe(70);
    expect(g.pct).toBe(90);
    expect(g.remaining).toBe(30);
    expect(g.totalPossible).toBe(100);
    expect(g.projected).toBe(90);
  });

  it('returns null percentages with nothing graded', () => {
    const g = courseGrade('c1', [item({ points: 30 })]);
    expect(g.pct).toBeNull();
    expect(g.projected).toBeNull();
    expect(g.remaining).toBe(30);
  });
});

describe('when a percentage is allowed to show', () => {
  it('one real scored item is enough; 0-point posts and participation are not a grade', () => {
    // ESG-162L: only 0-point intro posts graded. That is not 0%.
    const intro = [item({ points: 0, score: 0, status: 'done' }), item({ points: 0, score: 0, status: 'done' }), item({ points: 250 }), item({ points: 250 })];
    expect(courseGrade('c1', intro).pct).toBeNull();
    expect(courseGrade('c1', intro).enough).toBe(false);
    expect(courseGrade('c1', intro).graded).toBe(0);
    // ESG-162: one graded item out of a thousand points shows, as 54.7% based on 1 item.
    const one = [item({ points: 20, score: 11, status: 'done' }), item({ points: 980 })];
    expect(courseGrade('c1', one).pct).toBe(55);
    expect(courseGrade('c1', one).graded).toBe(1);
    expect(basedOn(courseGrade('c1', one))).toBe('based on 1 item');
    // Participation scored 0/10 is attendance, not a grade: the class stays "not graded yet".
    const part = [item({ type: 'participation', points: 10, score: 0, status: 'done' }), item({ points: 990 })];
    expect(courseGrade('c1', part).pct).toBeNull();
    expect(courseGrade('c1', part).graded).toBe(0);
    // Three real graded items, as before.
    const three = [item({ points: 20, score: 11, status: 'done' }), item({ points: 20, score: 20, status: 'done' }), item({ points: 20, score: 18, status: 'done' }), item({ points: 940 })];
    expect(courseGrade('c1', three).pct).toBe(81.7);
    expect(basedOn(courseGrade('c1', three))).toBe('based on 3 items');
  });
});
