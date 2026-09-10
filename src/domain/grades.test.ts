import { describe, expect, it } from 'vitest';
import { courseGrade } from './grades';
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
