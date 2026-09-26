import { describe, expect, it } from 'vitest';
import { skipImpact, skipLine } from './impact';
import type { Item } from './types';

const base = (over: Partial<Item>): Item =>
  ({ id: over.id ?? 'x', courseId: 'c1', title: 't', label: 'l', labelOverridden: false, type: 'homework', dueAt: '2026-10-01T23:59:00-07:00', opensAt: null, points: 10, estimatedMinutes: 30, estimateOverridden: false, startByOverride: null, status: 'todo', score: null, notes: '', flags: { inClass: false, group: false }, source: 'manual', updatedAt: '', completedAt: null, ...over }) as Item;

describe('what skipping one thing does to the grade', () => {
  const graded = [
    base({ id: 'g1', status: 'done', score: 90, points: 100 }),
    base({ id: 'g2', status: 'done', score: 80, points: 100 }),
    base({ id: 'g3', status: 'done', score: 100, points: 100 }),
  ];
  it('says nothing before enough is graded (one item, under a tenth of the term)', () => {
    const paper = base({ id: 'p', points: 100 });
    expect(skipImpact(paper, [graded[0], paper, base({ id: 'rest', points: 1800 })])).toBeNull();
  });
  it('a zero on a big item moves the class grade; a tiny post does not earn a line', () => {
    const paper = base({ id: 'p', points: 200 });
    const post = base({ id: 'd', points: 5 });
    const items = [...graded, paper, post, base({ id: 'rest', points: 395 })];
    const s = skipImpact(paper, items)!;
    expect(s.from).toBe(90);
    expect(s.to).toBeLessThan(s.from);
    expect(skipLine(paper, items, 'ENG-105')).toMatch(/^Skip it and ENG-105 goes from 90% to \d+%/);
    expect(skipLine(post, items, 'ENG-105')).toBeNull();
  });
  it('never speaks about something already done or scored', () => {
    const items = [...graded, base({ id: 'p', points: 200 })];
    expect(skipImpact(base({ id: 'p', points: 200, status: 'done' }), items)).toBeNull();
    expect(skipImpact(base({ id: 'p', points: 200, score: 150 }), items)).toBeNull();
  });
});
