import { describe, expect, it } from 'vitest';
import { mkItem, NOW } from './fixtures';
import { foldDuplicates, isLocked, sameAssignment, workKey } from './sameAssignment';

describe('the same assignment, by numbering and meaning', () => {
  it('reads the numbering however it is written', () => {
    expect(workKey('Topic 3 DQ 1')).toBe('dq 3.1');
    expect(workKey('DQ 3.1: Rhetorical situation')).toBe('dq 3.1');
    expect(workKey('Reply to two classmates on DQ 3-1')).toBe('dq 3.1');
    expect(workKey('Topic 3 Discussion Question 1')).toBe('dq 3.1');
    expect(workKey('Quiz #2')).toBe('quiz 2');
    expect(workKey('Practice Quiz 2')).toBe('practice quiz 2');
    expect(workKey('Week 5 Participation')).toBe('week 5 participation');
    expect(workKey('Formal Lab Report')).toBeNull();
  });
  it('matches on meaning when there is no number, within a week', () => {
    const lab = { title: 'Electron Structure and Molecular Shape Lab', dueAt: '2026-10-02T06:59:00Z' };
    expect(sameAssignment(lab, { title: 'Submit Lab Notebook images PDF for Week-3 Structure and Molecular Shape', dueAt: '2026-10-03T06:59:00Z' })).toBe(true);
    expect(sameAssignment(lab, { title: 'Complete Week-3 post-lab quiz', dueAt: '2026-10-03T06:59:00Z' })).toBe(false);
    expect(sameAssignment(lab, { title: 'Molecular structure notes', dueAt: '2026-11-20T06:59:00Z' })).toBe(false);
    expect(sameAssignment({ title: 'Quiz #2', dueAt: '2026-10-23T06:59:00Z' }, { title: 'Practice Quiz 2', dueAt: '2026-10-18T06:59:00Z' })).toBe(false);
  });
  it('locks what Halo has as turned in or graded', () => {
    expect(isLocked(mkItem({ id: 'a', courseId: 'c', title: 't', score: 9 }))).toBe(true);
    expect(isLocked(mkItem({ id: 'a', courseId: 'c', title: 't', halo: { status: 'SUBMITTED', submittedAt: NOW, checkedAt: NOW } }))).toBe(true);
    expect(isLocked(mkItem({ id: 'a', courseId: 'c', title: 't', haloId: 'h', halo: { status: 'ACTIVE', submittedAt: null, checkedAt: NOW } }))).toBe(false);
  });
  it('folds an announcement-made copy into the Halo item, keeping ticks', () => {
    const src = { kind: 'announcement' as const, id: 'p1', title: 'Week 3', quote: 'q', at: NOW };
    const halo = mkItem({ id: 'h', courseId: 'c1', title: 'Topic 3 DQ 1', haloId: 'hd', dueAt: '2026-09-24T06:59:00Z' });
    const copy = mkItem({ id: 'x', courseId: 'c1', title: 'DQ 3.1 initial post', dueAt: '2026-09-25T06:59:00Z', source: 'halo', origin: src, status: 'done', completedAt: NOW, requirements: [{ id: 'r1', text: 'Cite the reading', dueAt: null, done: true, doneAt: NOW, gradedOn: true, source: src, addedAt: NOW }] });
    const other = mkItem({ id: 'y', courseId: 'c1', title: 'Bring goggles to lab', dueAt: '2026-09-25T06:59:00Z', source: 'halo', origin: src });
    const out = foldDuplicates([halo, copy, other], NOW);
    expect(out.deletes).toEqual(['x']);
    const into = out.upserts.find((i) => i.id === 'h')!;
    expect(into.dueAt).toBe('2026-09-24T06:59:00Z');
    expect(into.requirements?.map((r) => [r.text, r.done])).toEqual([['Cite the reading', true], ['DQ 3.1 initial post', true]]);
  });
});
