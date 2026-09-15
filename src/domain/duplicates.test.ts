import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { findDuplicates, merged } from './duplicates';

const a = mkItem({ id: 'a', courseId: 'c1', title: 'Topic 3 Quiz', dueAt: '2026-09-25T23:59:00-07:00', source: 'ics', icsUid: 'u1', updatedAt: '2026-09-10T00:00:00Z' });
const b = mkItem({ id: 'b', courseId: 'c1', title: 'Topic 3 Quiz', dueAt: '2026-09-26T23:59:00-07:00', source: 'manual', notes: 'from the audit', updatedAt: '2026-09-14T00:00:00Z' });
const c = mkItem({ id: 'c', courseId: 'c1', title: 'Topic 3 Quiz', dueAt: '2026-10-10T23:59:00-07:00' });
const d = mkItem({ id: 'd', courseId: 'c2', title: 'Topic 3 Quiz', dueAt: '2026-09-25T23:59:00-07:00' });
const e = mkItem({ id: 'e', courseId: 'c1', title: 'Topic 3 Quiz: Stoichiometry', dueAt: '2026-09-25T23:59:00-07:00', status: 'in_progress', updatedAt: '2026-09-01T00:00:00Z' });

describe('near-duplicates from three syncs', () => {
  it('pairs same-class look-alikes due within three days, keeps the linked one, and leaves the rest alone', () => {
    const pairs = findDuplicates([a, b, c, d], TZ);
    expect(pairs.map((p) => [p.keep.id, p.drop.id, p.reason])).toEqual([['a', 'b', 'Same title, due 1 day apart.']]);
    expect(findDuplicates([a, c], TZ)).toEqual([]);
    expect(findDuplicates([a, d], TZ)).toEqual([]);
    const near = findDuplicates([b, e], TZ);
    expect(near.map((p) => [p.keep.id, p.drop.id])).toEqual([['e', 'b']]);
  });
  it('merges into the kept record without losing notes, progress, or links', () => {
    const m = merged({ keep: a, drop: b, reason: '' });
    expect(m.id).toBe('a');
    expect(m.notes).toBe('from the audit');
    expect(m.icsUid).toBe('u1');
    const done = merged({ keep: a, drop: { ...b, status: 'done', completedAt: '2026-09-20T00:00:00Z', score: 9, scoreSource: 'halo' }, reason: '' });
    expect(done.status).toBe('done');
    expect(done.score).toBe(9);
    expect(done.scoreSource).toBe('halo');
  });
});
