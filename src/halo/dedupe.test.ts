import { describe, expect, it } from 'vitest';
import { dedupeData } from './dedupe';
import type { AppData, HaloPull } from '../domain/types';
import { mkCourse, mkData, mkItem } from './fixtures';

const withPulls = (d: AppData, haloPulls: Record<string, HaloPull>): AppData => ({ ...d, settings: { ...d.settings, haloPulls } });

const chm = mkCourse({ id: 'chm-a', code: 'CHM-113', haloClassId: 'halo-chm', haloSlugId: 'CHM-113-WF700A-20260908' });
const chmOld = mkCourse({ id: 'chm-b', code: 'CHM-113', haloClassId: null, haloSlugId: null });
const unv = mkCourse({ id: 'unv-a', code: 'UNV-106', haloClassId: 'halo-unv' });
const unvCopy = mkCourse({ id: 'unv-b', code: 'UNV-106', haloClassId: 'halo-unv' });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', haloClassId: 'halo-eng' });

describe('dedupeData (George, 2026-10-09: one class, one course; one assessment, one item)', () => {
  const data = withPulls(mkData(
    [chm, chmOld, unv, unvCopy, eng],
    [
      mkItem({ id: 'i1', courseId: 'chm-a', haloId: 'h1', title: 'Quiz 1', status: 'todo', plan: { at: '2026-09-16T00:00:00Z', asks: 'x' } as never }),
      mkItem({ id: 'i2', courseId: 'chm-b', haloId: 'h1', title: 'Quiz 1', status: 'done', completedAt: '2026-10-01T00:00:00Z', halo: { status: 'GRADED', submittedAt: '2026-09-30T00:00:00Z', checkedAt: '2026-10-01T00:00:00Z' } }),
      mkItem({ id: 'i3', courseId: 'chm-b', haloId: 'h2', title: 'Lab 2', status: 'todo' }),
      mkItem({ id: 'i4', courseId: 'chm-b', haloId: null, title: 'My own reminder', status: 'todo' }),
      mkItem({ id: 'i5', courseId: 'unv-a', haloId: 'u1', title: 'DQ 1', status: 'todo', labelOverridden: true, label: 'My DQ' }),
      mkItem({ id: 'i6', courseId: 'unv-b', haloId: 'u1', title: 'DQ 1', status: 'todo' }),
      mkItem({ id: 'i7', courseId: 'eng', haloId: 'e1', title: 'Essay', status: 'todo' }),
    ],
  ), { 'chm-a': { assessments: '2026-10-09T21:38:00Z' }, 'unv-b': { assessments: '2026-10-09T21:38:00Z', grades: '2026-10-09T21:38:00Z' }, 'unv-a': { assessments: '2026-10-09T20:43:00Z', announcements: '2026-10-09T20:43:00Z' } });
  const r = dedupeData(data);
  it('keeps the synced, worked-in copy of each class and removes the rest', () => {
    expect(r.data.courses.map((c) => c.id).sort()).toEqual(['chm-a', 'eng', 'unv-a']);
    expect(r.removedCourses.sort()).toEqual(['chm-b', 'unv-b']);
  });
  it("moves the removed copies' items over and keeps one item per Halo assessment, done when either copy was", () => {
    const quiz = r.data.items.filter((i) => i.haloId === 'h1');
    expect(quiz).toHaveLength(1);
    expect(quiz[0].id).toBe('i2');
    expect(quiz[0].courseId).toBe('chm-a');
    expect(quiz[0].plan).toBeTruthy();
    expect(r.data.items.find((i) => i.id === 'i3')?.courseId).toBe('chm-a');
    expect(r.data.items.find((i) => i.id === 'i4')?.courseId).toBe('chm-a');
    const dq = r.data.items.filter((i) => i.haloId === 'u1');
    expect(dq.map((i) => i.id)).toEqual(['i5']);
    expect(dq[0].label).toBe('My DQ');
    expect(r.removedItems.sort()).toEqual(['i1', 'i6']);
    expect(r.data.items.find((i) => i.id === 'i7')?.courseId).toBe('eng');
  });
  it("a copy's done status from Halo carries to the kept item", () => {
    const d = dedupeData(withPulls(mkData([unv, unvCopy], [mkItem({ id: 'a', courseId: 'unv-a', haloId: 'u2', title: 'DQ 2', status: 'todo', labelOverridden: true }), mkItem({ id: 'b', courseId: 'unv-b', haloId: 'u2', title: 'DQ 2', status: 'todo', halo: { status: 'SUBMITTED', submittedAt: '2026-10-05T00:00:00Z', checkedAt: '2026-10-05T00:00:00Z' } })]), { 'unv-a': { assessments: '2026-10-09T00:00:00Z' } }));
    const kept = d.data.items.find((i) => i.haloId === 'u2')!;
    expect(kept.id).toBe('a');
    expect(kept.status).toBe('done');
    expect(kept.completedAt).toBe('2026-10-05T00:00:00Z');
  });
  it('pull stamps fold into the kept copy, newest per kind', () => {
    expect(r.data.settings.haloPulls?.['unv-a']).toEqual({ assessments: '2026-10-09T21:38:00Z', grades: '2026-10-09T21:38:00Z', announcements: '2026-10-09T20:43:00Z' });
    expect(r.data.settings.haloPulls?.['unv-b']).toBeUndefined();
  });
  it('does nothing when every class is one course', () => {
    const clean = mkData([chm, eng], [mkItem({ id: 'x', courseId: 'chm-a', haloId: 'h9', title: 'Quiz 9' })]);
    const d = dedupeData(clean);
    expect(d.data).toBe(clean);
    expect(d.removedCourses).toEqual([]);
  });
});
