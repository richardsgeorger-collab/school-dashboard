import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, NOW, TZ } from '../halo/fixtures';
import type { Item } from '../domain/types';
import { applyProposal, describeProposal, gatedIds } from './apply';
import { matchMention, proposalFor } from './match';
import type { Mention } from './notes';

const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const talk = mkItem({ id: 'talk', courseId: 'c1', title: 'Chemistry Connections Presentation', label: 'Chem Lab Connections Talk', type: 'project', points: 75, dueAt: '2026-09-27T23:59:00-07:00' });
const essay = mkItem({ id: 'essay', courseId: 'c1', title: 'Chemistry Connections Essay', label: 'Chem Connections Essay', type: 'paper', points: 100, dueAt: '2026-10-09T23:59:00-07:00' });
const quiz = mkItem({ id: 'q1', courseId: 'c1', title: 'Topic 1 Quiz', label: 'Chem Quiz 1', type: 'quiz', dueAt: '2026-09-18T23:59:00-07:00' });
const items = [talk, essay, quiz];
const claim: Mention = { id: 'a1', quote: 'The Sept 12 announcement says Chemistry Connections topics must be claimed by 9/20 11:59 PM, before the 9/27 presentation and the 10/9 essay.', kind: 'date_change', title: 'Claim your Chemistry Connections topic', date: '2026-09-20', time: '23:59', points: 0, confidence: 'medium', itemId: null, courseId: 'c1', audit: { status: 'announce', prefix: null }, note: 'gates the presentation and essay', gates: ['Chemistry Connections Presentation', 'Chemistry Connections Essay'] };

function fakeActions() {
  const upserts: Item[] = [];
  const deletes: string[] = [];
  return { upserts, deletes, actions: { upsertItem: (i: Item) => void upserts.push(i), deleteItem: (id: string) => void deletes.push(id), applyScore: () => undefined } };
}

describe('a gating deadline found in an announcement', () => {
  it('never matches the item it gates, even when the titles share words', () => {
    expect(matchMention(claim, items, 'c1')).toBeNull();
    expect(matchMention({ ...claim, gates: [], note: 'prerequisite for the presentation' }, items, 'c1')).toBeNull();
    // The same words without any gating would land on the presentation; gating is what keeps it separate.
    expect(matchMention({ ...claim, title: 'Chemistry Connections presentation topic', gates: [], note: '' }, items, 'c1')?.id).toBe('talk');
    expect(matchMention({ ...claim, title: 'Chemistry Connections presentation topic' }, items, 'c1')).toBeNull();
  });
  it('proposes a new item, and applying it links the gated items without touching their dates', () => {
    const p = proposalFor(claim, matchMention(claim, items, 'c1'), chm, TZ, '2026-09-14', NOW);
    expect(p.kind).toBe('add');
    if (p.kind !== 'add') return;
    expect(p.item.title).toBe('Claim your Chemistry Connections topic');
    expect(p.item.dueAt).toBe('2026-09-20T23:59:00-07:00');
    expect(gatedIds(claim, 'c1', items)).toEqual(['talk', 'essay']);
    expect(describeProposal(p, TZ, undefined, ['the presentation', 'the essay'])).toBe('Add Claim your Chemistry Connections topic to the planner, due Sep 20 11:59 PM (it unlocks the presentation and the essay)');
    const { upserts, actions } = fakeActions();
    const said = applyProposal(p, claim, actions, TZ, '2026-09-14', false, {}, items);
    expect(said).toBe('Added Claim your Chemistry Connections topic, due Sep 20 11:59 PM, gating 2 items');
    expect(upserts.length).toBe(1);
    expect(upserts[0].blocks).toEqual(['talk', 'essay']);
    expect(upserts[0].dueAt).toBe('2026-09-20T23:59:00-07:00');
    expect(upserts[0].points).toBe(0);
    expect(items.find((i) => i.id === 'talk')!.dueAt).toBe('2026-09-27T23:59:00-07:00');
  });
  it('recognizes itself on a second audit instead of adding twice', () => {
    const existing = mkItem({ id: 'claim', courseId: 'c1', title: 'Claim your Chemistry Connections topic', label: 'Chem Topic Claim', points: 0, dueAt: '2026-09-20T23:59:00-07:00', blocks: ['talk', 'essay'] });
    const match = matchMention(claim, [...items, existing], 'c1');
    expect(match?.id).toBe('claim');
    expect(proposalFor(claim, match, chm, TZ, '2026-09-14', NOW).kind).toBe('confirm');
  });
});

describe('a late flag', () => {
  it('notes it on the item and leaves the status alone', () => {
    const done = { ...quiz, status: 'done' as const };
    const m: Mention = { id: 'a2', quote: 'CHM-113 | Topic 1 Quiz | overdue | | Halo shows Late', kind: 'info', title: 'Topic 1 Quiz', date: null, time: null, points: null, confidence: 'high', itemId: null, courseId: 'c1', audit: { status: 'overdue', prefix: null }, note: 'Halo shows Late' };
    const p = proposalFor(m, matchMention(m, [done], 'c1'), chm, TZ, '2026-09-14', NOW);
    expect(p.kind).toBe('flag');
    const { upserts, actions } = fakeActions();
    applyProposal(p, m, actions, TZ, '2026-09-14', false);
    expect(upserts[0]).toMatchObject({ id: 'q1', status: 'done', haloLate: 'Halo shows Late' });
  });
});
