import { describe, expect, it } from 'vitest';
import { applyHaloPlan, countVisible, defaultSelection, planFromDiff } from './apply';
import { diffHalo } from './diff';
import { mkAssessment, mkClass, mkCourse, mkData, mkExport, mkItem, NOW, TZ } from './fixtures';
import { haloItemId } from './normalize';

const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const items = [
  mkItem({ id: 'moved', courseId: 'c1', title: 'Topic 1 Homework', points: 10 }),
  mkItem({ id: 'gone', courseId: 'c1', title: 'Removed thing', haloId: 'h-gone' }),
  mkItem({ id: 'turned', courseId: 'c1', title: 'Lab Safety', points: 5 }),
  mkItem({ id: 'mine', courseId: 'c1', title: 'My own reminder', source: 'manual' }),
];
const payload = mkExport([
  mkClass({
    id: 'hc1',
    courseCode: 'CHM-113',
    assessments: [
      mkAssessment({ id: 'h-moved', title: 'Topic 1 Homework', points: 10, dueDate: '2026-09-19T06:59:00Z' }),
      mkAssessment({ id: 'h-new', title: 'Brand New Assignment', points: 30 }),
      mkAssessment({ id: 'h-turned', title: 'Lab Safety', points: 5, status: 'PUBLISHED', submittedAt: '2026-09-10T20:00:00Z', score: 4 }),
    ],
  }),
]);
const data = mkData([chm], items);
const diff = diffHalo(payload, data, { tz: TZ, now: NOW });

describe('plan and apply', () => {
  it('defaults to everything Halo proposes, removals only for untouched items', () => {
    const sel = defaultSelection(diff);
    expect([...sel.added]).toEqual([haloItemId('h-new')]);
    expect([...sel.changed]).toEqual(['moved']);
    expect([...sel.missing]).toEqual(['gone']);
    expect([...sel.submitted]).toEqual(['s:turned']);
    expect(countVisible(sel)).toBe(4);
  });
  it('applies the approved plan and leaves manual items alone', () => {
    const plan = planFromDiff(diff, defaultSelection(diff));
    const r = applyHaloPlan(data, plan, () => '2026-09-09', NOW, TZ);
    const byId = new Map(r.data.items.map((i) => [i.id, i]));
    expect(byId.get('moved')?.dueAt).toBe('2026-09-18T23:59:00-07:00');
    expect(byId.get('moved')?.haloId).toBe('h-moved');
    expect(byId.has('gone')).toBe(false);
    expect(byId.get(haloItemId('h-new'))?.source).toBe('halo');
    const turned = byId.get('turned')!;
    expect(turned.status).toBe('done');
    expect(turned.completedAt).toBe('2026-09-10T13:00:00-07:00');
    expect(turned.score).toBe(4);
    expect(turned.award?.base).toBe(5);
    expect(turned.award?.scoreFactor).toBeCloseTo(0.8);
    expect(byId.get('mine')).toEqual(items[3]);
    expect(r.data.courses[0].haloClassId).toBe('hc1');
    expect(r.ops.map((o) => o.kind)).toEqual(['courses', 'items', 'deleteItem']);
  });
  it('respects deselection', () => {
    const sel = defaultSelection(diff);
    sel.missing.clear();
    sel.submitted.clear();
    sel.added.clear();
    const plan = planFromDiff(diff, sel);
    const r = applyHaloPlan(data, plan, () => undefined, NOW, TZ);
    const byId = new Map(r.data.items.map((i) => [i.id, i]));
    expect(byId.has('gone')).toBe(true);
    expect(byId.get('turned')?.status).toBe('todo');
    expect(byId.has(haloItemId('h-new'))).toBe(false);
    expect(byId.get('moved')?.points).toBe(10);
  });
  it('never re-awards an item that is already done', () => {
    const done = mkItem({ id: 'turned', courseId: 'c1', title: 'Lab Safety', status: 'done', completedAt: NOW, award: { base: 5, multiplier: 1.5, earnedAt: NOW, scoreFactor: null } });
    const d = diffHalo(payload, mkData([chm], [done]), { tz: TZ, now: NOW });
    expect(d.submitted.map((s) => s.id)).not.toContain('turned');
  });
});
