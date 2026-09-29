import { describe, expect, it } from 'vitest';
import type { Action } from '../halo/actions';
import { planFromActions } from '../halo/autoRead';
import type { StoredAnnouncement } from '../halo/announce';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { foldParticipation, isParticipationWork, participationFor } from './participation';

const NOW = '2026-09-21T12:00:00.000Z';
const course = mkCourse({ id: 'c1', code: 'CHM-113' });
const w3 = mkItem({ id: 'p3', courseId: 'c1', title: 'Week 3 Participation', type: 'participation', points: 10, dueAt: '2026-09-27T23:59:00-07:00' });
const w4 = mkItem({ id: 'p4', courseId: 'c1', title: 'Week 4 Participation', type: 'participation', points: 10, dueAt: '2026-10-04T23:59:00-07:00' });
const lab = mkItem({ id: 'lab', courseId: 'c1', title: 'Lab 3', type: 'lab', points: 50, dueAt: '2026-09-25T23:59:00-07:00' });
const items = [w3, w4, lab];
const post = { id: 'a1', courseId: 'c1', title: 'Week 3', text: 'b', publishedAt: '2026-09-21T15:00:00.000Z', modifiedAt: null, review: {} } as unknown as StoredAnnouncement;
const act = (o: Partial<Action> & { kind: Action['kind']; text: string }): Action => ({ itemId: null, dueAt: '2026-09-24T06:59:00.000Z', points: null, gradedOn: true, redefinesDone: false, confidence: 'high', source: { kind: 'announcement', id: 'a1', title: 'Week 3', quote: 'q', at: NOW }, ...o });
const plan = (actions: Action[], its = items) => planFromActions({ actions, announcement: post, course, items: its, courses: [course], now: NOW, tz: TZ });

describe('participation is never its own item', () => {
  it('knows participation when it sees it', () => {
    for (const t of ['Acknowledge this week’s announcement', 'Reply to 2 classmates on 2 different days', 'Post your introduction in the forum', 'Attend Thursday’s review session', 'Complete the in-class activity', 'Participate in the discussion']) expect(isParticipationWork(t), t).toBe(true);
    for (const t of ['Submit Lab 3 report as one PDF', 'Take the Week 3 quiz', 'Upload the signed essay draft']) expect(isParticipationWork(t), t).toBe(false);
  });
  it('picks the participation item for that week', () => {
    expect(participationFor(items, 'c1', '2026-09-23', TZ)?.id).toBe('p3');
    expect(participationFor(items, 'c1', '2026-09-29', TZ)?.id).toBe('p4');
    expect(participationFor(items, 'other', '2026-09-23', TZ)).toBeNull();
  });
  it('files "acknowledge the announcement" on that week’s participation item, even when the reader called it new work', () => {
    const p = plan([act({ kind: 'new_work', text: 'Acknowledge this week’s announcement' })]);
    expect(p.added).toHaveLength(0);
    expect(p.upserts.find((i) => i.id === 'p3')?.requirements?.map((r) => r.text)).toEqual(['Acknowledge this week’s announcement']);
  });
  it('takes the reader’s own participation kind to the right week', () => {
    const p = plan([act({ kind: 'participation', text: 'Reply to 2 classmates by Sunday', dueAt: '2026-10-01T06:59:00.000Z' })]);
    expect(p.upserts.find((i) => i.id === 'p4')?.requirements).toHaveLength(1);
    expect(p.added).toHaveLength(0);
  });
  it('makes a class note, not an item, when the class has no participation item', () => {
    const p = plan([act({ kind: 'new_work', text: 'Acknowledge this week’s announcement' })], [lab]);
    expect(p.added).toHaveLength(0);
    expect(p.noted).toBe(1);
  });
  it('still adds real graded work with a deliverable', () => {
    const p = plan([act({ kind: 'new_work', text: 'Submit the Week 3 worksheet as one PDF' })]);
    expect(p.added).toHaveLength(1);
  });
  it('keeps ungraded "new work" as a note', () => {
    const p = plan([act({ kind: 'new_work', text: 'Watch the optional review video', gradedOn: false })]);
    expect(p.added).toHaveLength(0);
    expect(p.noted).toBe(1);
  });
  it('leaves a forum reply that belongs to a discussion assignment on that assignment', () => {
    const dq = mkItem({ id: 'dq', courseId: 'c1', title: 'Topic 3 DQ 1', type: 'discussion', points: 5, dueAt: '2026-09-24T23:59:00-07:00' });
    const p = plan([act({ kind: 'requirement', itemId: 'dq', text: 'Reply to 2 classmates on 2 different days' })], [...items, dq]);
    expect(p.upserts.find((i) => i.id === 'dq')?.requirements).toHaveLength(1);
    expect(p.upserts.find((i) => i.id === 'p3')).toBeUndefined();
  });
});

describe('the clean-up of items made before', () => {
  const junk = mkItem({ id: 'junk', courseId: 'c1', title: 'Acknowledge the Week 3 announcement', type: 'homework', points: 0, dueAt: '2026-09-24T23:59:00-07:00', origin: { kind: 'announcement', id: 'a1', title: 'Week 3', quote: 'Please acknowledge this announcement.', at: NOW } });
  const real = mkItem({ id: 'real', courseId: 'c1', title: 'Print, sign, and upload 2 documents', type: 'homework', points: 0, dueAt: '2026-09-24T23:59:00-07:00', origin: { kind: 'announcement', id: 'a2', title: 'Docs', quote: 'print these 2 documents, sign them and then upload it here', at: NOW } });
  it('moves participation onto that week’s item, ticked if it was done, and keeps real work', () => {
    const f = foldParticipation([...items, { ...junk, status: 'done', completedAt: NOW }, real], TZ, NOW);
    expect(f.deletedIds).toEqual(['junk']);
    const line = f.upserts[0].requirements?.[0];
    expect(f.upserts[0].id).toBe('p3');
    expect(line?.text).toBe('Acknowledge the Week 3 announcement');
    expect(line?.done).toBe(true);
    expect(line?.source.quote).toBe('Please acknowledge this announcement.');
  });
  it('changes nothing twice', () => {
    const once = foldParticipation([...items, junk], TZ, NOW);
    const after = [...items.map((i) => once.upserts.find((u) => u.id === i.id) ?? i)];
    expect(foldParticipation(after, TZ, NOW).deletedIds).toEqual([]);
  });
});
