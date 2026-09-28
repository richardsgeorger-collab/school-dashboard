import { describe, expect, it } from 'vitest';
import { basedOn, courseGrade, gradeLine, gradeMismatch, gradeText } from './grades';
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

describe('the class grade', () => {
  it('counts every scored item with points, participation included, the way Halo does; 0-point posts are not a grade', () => {
    const intro = [item({ points: 0, score: 0, status: 'done' }), item({ points: 250 })];
    expect(courseGrade('c1', intro).pct).toBeNull();
    expect(courseGrade('c1', intro).source).toBe('none');
    // ESG-162L: participation scored 10/10 is a grade.
    const part = [item({ type: 'participation', points: 10, score: 10, status: 'done' }), item({ points: 990 })];
    expect(courseGrade('c1', part).pct).toBe(100);
    expect(basedOn(courseGrade('c1', part))).toBe('based on 1 item');
  });

  it('shows Halo’s own grade whenever the sync carried it, letter and percent as Halo shows them, with no footnote', () => {
    // ESG-162: Halo says A (95.6%) while only one review is scored here.
    const items = [item({ points: 25, score: 13.67, status: 'done' }), item({ points: 975 })];
    const g = courseGrade('c1', items, { haloGrade: { letter: 'A', points: 172.1, maxPoints: 180, percent: (172.1 / 180) * 100, at: 'x' } });
    expect(g.source).toBe('halo');
    expect(gradeText(g)).toBe('A (95.6%)');
    expect(gradeLine(g, [{ label: 'F', minPercent: 0, maxPercent: 59.99 }])).toBe('A (95.6%)');
    expect(basedOn(g)).toBeNull();
    expect(g.earned).toBe(172.1);
    // The items do not add up to Halo's number: flagged for Advanced, never shown instead of it.
    expect(gradeMismatch(g)).toBe('Halo says 95.6%; the items here add up to 54.7%.');
  });

  it('matches Halo’s one-decimal format for every one of George’s classes', () => {
    const cases: [string, number, number, string][] = [
      ['B-', 81.3, 100, 'B- (81.3%)'],
      ['A', 96, 100, 'A (96.0%)'],
      ['D', 62.5, 100, 'D (62.5%)'],
      ['A', 95.6, 100, 'A (95.6%)'],
      ['A', 100, 100, 'A (100.0%)'],
    ];
    for (const [letter, points, maxPoints, want] of cases) {
      expect(gradeText(courseGrade('c1', [], { haloGrade: { letter, points, maxPoints, percent: (points / maxPoints) * 100, at: 'x' } }))).toBe(want);
    }
    expect(gradeMismatch(courseGrade('c1', [item({ points: 100, score: 96, status: 'done' })], { haloGrade: { letter: 'A', points: 96, maxPoints: 100, percent: 96, at: 'x' } }))).toBeNull();
  });
});
