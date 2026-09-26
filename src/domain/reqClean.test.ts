import { describe, expect, it } from 'vitest';
import { cleanAll, cleanRequirements, instanceParts, looksLikeRule, overlap, restatesItem, rulesFor, hasDate, readingRefs, readingCovers, foldReadings, referenceParts } from './reqClean';
import type { Item, Requirement } from './types';
import { mkItem, TZ } from '../halo/fixtures';

void TZ;
const at = '2026-09-18T12:00:00.000Z';
const req = (id: string, text: string, o: Partial<Requirement> & { post?: string } = {}): Requirement => ({
  id,
  text,
  dueAt: o.dueAt ?? null,
  done: o.done ?? false,
  doneAt: null,
  gradedOn: o.gradedOn ?? true,
  addedAt: at,
  source: { kind: 'announcement', id: o.post ?? 'a1', title: o.post ?? 'Post', quote: text.toLowerCase(), at },
  ...(o.scope ? { scope: o.scope } : {}),
});

const item = (title: string, reqs: Requirement[], id = 'i1', courseId = 'c1'): Item => ({ ...mkItem({ id, courseId, title }), requirements: reqs });

describe('the same instruction from several posts', () => {
  it('collapses into one part that keeps every source', () => {
    const it0 = item('Chemistry Connections', [
      req('r1', 'Go to the Discussion Forum thread and claim your topic', { post: 'a7', dueAt: '2026-09-21T06:59:00.000Z' }),
      req('r2', 'Go to the Discussion Forum thread to claim a topic', { post: 'a8', dueAt: '2026-09-22T06:59:00.000Z' }),
      req('r3', 'Do not choose a topic already claimed by a classmate', { post: 'a7' }),
      req('r4', 'Do not pick a topic another student has already claimed', { post: 'a8' }),
    ]);
    const r = cleanRequirements(it0);
    expect(r.parts).toHaveLength(2);
    expect(r.merged).toBe(2);
    // Every post that said it is kept, so the part can link back to all of them.
    expect(r.parts[0].sources?.map((s) => s.id).sort()).toEqual(['a7', 'a8']);
    // The earlier of the two deadlines wins: it is the one that can be missed.
    expect(r.parts[0].dueAt).toBe('2026-09-21T06:59:00.000Z');
  });

  it('reads through different wording for the same thing', () => {
    expect(overlap('Choose your Rhetorical Analysis topic', 'Choose your topic for the Rhetorical Analysis')).toBeGreaterThan(0.9);
    expect(overlap('Choose your Rhetorical Analysis topic', 'Pick a Rhetorical Analysis topic before Sunday')).toBeGreaterThanOrEqual(0.6);
    // And does not merge things that merely share a noun.
    expect(overlap('Cite two peer-reviewed sources', 'Use the APA 7 template')).toBeLessThan(0.6);
  });

  it('collapses the three topic-choice parts the user saw into one', () => {
    const r = cleanRequirements(
      item('Rhetorical Analysis Pre-writing', [
        req('r5', 'Choose your Rhetorical Analysis topic', { post: 'a1', dueAt: '2026-09-21T06:59:00.000Z' }),
        req('r6', 'Choose your topic for the Rhetorical Analysis', { post: 'a4' }),
        req('r7', 'Pick a Rhetorical Analysis topic before Sunday', { post: 'a5', dueAt: '2026-09-21T06:59:00.000Z' }),
        req('r8', 'Use the APA 7 student paper template posted in Resources', { post: 'a3' }),
        req('r9', 'Cite two peer-reviewed sources from the GCU library', { post: 'a4' }),
      ]),
    );
    expect(r.parts.map((p) => p.text)).toEqual(['Choose your Rhetorical Analysis topic', 'Use the APA 7 student paper template posted in Resources', 'Cite two peer-reviewed sources from the GCU library']);
  });
});

describe('parts that only repeat the assignment', () => {
  it('are dropped, and parts that say something new are not', () => {
    expect(restatesItem('Complete and submit Practice Quiz 1 by Sunday', { title: 'Practice Quiz 1' })).toBe(true);
    expect(restatesItem('Complete APA Quiz 1, due Sep 20', { title: 'APA Quiz 1' })).toBe(true);
    expect(restatesItem('Complete APA Quiz 1 by Sunday (2026-09-20)', { title: 'APA Quiz 1' })).toBe(true);
    expect(restatesItem('Submit one PDF only, no handwriting', { title: 'APA Quiz 1' })).toBe(false);
    expect(restatesItem('Reply to two classmates', { title: 'Topic 2 DQ 1' })).toBe(false);

    const r = cleanRequirements(item('Practice Quiz 1', [req('r20', 'Complete and submit Practice Quiz 1 by Sunday', { dueAt: '2026-09-21T06:59:00.000Z' })]));
    expect(r.parts).toEqual([]);
    expect(r.dropped).toBe(1);
  });
});

describe('standing class rules', () => {
  it('are recognised by their shape and never carry a date', () => {
    expect(looksLikeRule('Every DQ post must be 150-200 words')).toBe(true);
    expect(looksLikeRule('Late work receives zero points')).toBe(true);
    expect(looksLikeRule('Submit one PDF only, no handwriting')).toBe(true);
    expect(looksLikeRule('Post 2 peer replies on 3 separate days')).toBe(true);
    expect(looksLikeRule('Bring safety goggles to Thursday lab')).toBe(false);

    const r = cleanRequirements(item('APA Quiz 1', [req('r3', 'Submit one PDF only, no handwriting', { dueAt: '2026-09-21T06:59:00.000Z' }), req('r19', 'Bring safety goggles to Thursday lab', { dueAt: '2026-09-25T06:59:00.000Z' })]));
    const rule = r.parts.find((p) => p.scope === 'rule')!;
    expect(rule.dueAt).toBeNull();
    const task = r.parts.find((p) => p.scope === 'instance')!;
    expect(task.dueAt).toBe('2026-09-25T06:59:00.000Z');
    // Only the concrete, dated one belongs on a day.
    expect(instanceParts({ requirements: r.parts })).toHaveLength(1);
  });

  it('are recognised when the same text lands on two assignments in a class, whatever its wording', () => {
    const a = item('Topic 2 DQ 1', [req('r1', 'Keep it under three paragraphs', { dueAt: '2026-09-21T06:59:00.000Z' })], 'i1');
    const b = item('Topic 2 DQ 2', [req('r2', 'Keep it under three paragraphs', { dueAt: '2026-09-21T06:59:00.000Z' })], 'i2');
    const cleaned = cleanAll([a, b]);
    expect(cleaned.items.every((i) => i.requirements[0].scope === 'rule')).toBe(true);
    expect(cleaned.items.every((i) => i.requirements[0].dueAt === null)).toBe(true);
    // And they gather into one rule for the class rather than two tasks.
    expect(rulesFor(cleaned.items, 'c1')).toHaveLength(1);
    expect(rulesFor(cleaned.items, 'c1')[0].items).toEqual(['Topic 2 DQ 1', 'Topic 2 DQ 2']);
  });
});

describe('the whole pile the user actually had', () => {
  const pile = [
    item('APA Quiz 1', [
      req('r1', 'Complete APA Quiz 1, due Sep 20', { dueAt: '2026-09-21T06:59:00.000Z' }),
      req('r2', 'Complete APA Quiz 1 by Sunday (2026-09-20)', { dueAt: '2026-09-21T06:59:00.000Z' }),
      req('r3', 'Submit one PDF only, no handwriting'),
      req('r4', 'Late work receives zero points'),
    ], 'i-apa'),
    item('Chemistry Connections', [
      req('r15', 'Go to the Discussion Forum thread and claim your topic', { dueAt: '2026-09-21T06:59:00.000Z' }),
      req('r16', 'Do not choose a topic already claimed by a classmate'),
      req('r17', 'Go to the Discussion Forum thread to claim a topic', { dueAt: '2026-09-21T06:59:00.000Z' }),
      req('r18', 'Do not pick a topic another student has already claimed'),
      req('r19', 'Bring safety goggles to Thursday lab', { dueAt: '2026-09-25T06:59:00.000Z' }),
    ], 'i-chem'),
    item('Practice Quiz 1', [req('r20', 'Complete and submit Practice Quiz 1 by Sunday', { dueAt: '2026-09-21T06:59:00.000Z' })], 'i-prac'),
  ];

  it('goes from ten parts to three things to do and two class rules', () => {
    const before = pile.reduce((n, i) => n + (i.requirements?.length ?? 0), 0);
    expect(before).toBe(10);
    const after = cleanAll(pile);
    const parts = after.items.flatMap((i) => i.requirements);
    // Three restatements dropped outright, two duplicate claims merged: ten becomes five.
    expect(parts).toHaveLength(5);
    expect(after.merged).toBe(2);
    expect(after.dropped).toBe(3);
    // What is left on the agenda, once rules move out of the way.
    expect(after.items.flatMap((i) => instanceParts(i)).map((p) => p.text)).toEqual([
      'Go to the Discussion Forum thread and claim your topic',
      'Do not choose a topic already claimed by a classmate',
      'Bring safety goggles to Thursday lab',
    ]);
    expect(rulesFor(after.items, 'c1').map((r) => r.text)).toEqual(['Submit one PDF only, no handwriting', 'Late work receives zero points']);
  });
});

describe('what is a task, a note, or a rule', () => {
  const on = (title: string, texts: string[]) => cleanRequirements({ title, requirements: texts.map((text, i) => ({ id: `r${i}`, text, dueAt: '2026-09-20T23:59:00-07:00', done: false, doneAt: null, gradedOn: true, source: { kind: 'announcement', id: 'a1', title: 'Week 3', quote: text, at: null }, addedAt: '2026-09-18T00:00:00.000Z' })) });
  it('a negation or an exception is a note, never a checkbox', () => {
    const r = on('Career Reflection', ['LopesWrite submission is NOT required for this assignment.', 'Cite two peer-reviewed sources.']);
    expect(r.parts.map((p) => p.scope)).toEqual(['reference', 'instance']);
    expect(r.parts[0].dueAt).toBeNull();
    expect(instanceParts({ requirements: r.parts })).toHaveLength(1);
    expect(referenceParts({ requirements: r.parts })).toHaveLength(1);
  });
  it('a part that restates the item with its points and week attached is dropped', () => {
    const r = on('UNV Career Reflection', ['Complete the Career Reflection assignment (100 points) by the end of Topic 3.', 'Answer all four prompts in one document.']);
    expect(r.dropped).toBe(1);
    expect(r.parts.map((p) => p.text)).toEqual(['Answer all four prompts in one document.']);
  });
  it('a dated instruction is never a class rule, however many assignments it lands on', () => {
    const dated = 'Submit Practice Quiz 1 by Sunday 09/20.';
    expect(hasDate(dated)).toBe(true);
    const items = ['Practice Quiz 1', 'Practice Quiz 2'].map((title, i) => ({ id: `i${i}`, courseId: 'c1', title, requirements: [{ id: `r${i}`, text: dated, dueAt: null, done: false, doneAt: null, gradedOn: true, source: { kind: 'announcement' as const, id: 'a1', title: 'Week 3', quote: dated, at: null }, addedAt: '2026-09-18T00:00:00.000Z' }] })) as unknown as Item[];
    expect(rulesFor(cleanAll(items).items, 'c1')).toEqual([]);
    // On Practice Quiz 1 itself it only restates the row; on Quiz 2 it is a real (odd) instruction.
    expect(cleanAll(items).items[0].requirements).toEqual([]);
    expect(cleanAll(items).items[1].requirements).toHaveLength(1);
  });
});

describe('overlapping readings', () => {
  it('reads chapter numbers, lists and ranges', () => {
    expect([...readingRefs('Read Chapters 1, 2, and 3')!]).toEqual([1, 2, 3]);
    expect([...readingRefs('Read Ch. 4-6 before class')!]).toEqual([4, 5, 6]);
    expect(readingRefs('Chem Lab 3')).toBeNull();
    expect(readingCovers('Read Chapters 1, 2, and 3', 'Read Chapter 3')).toBe(true);
    expect(readingCovers('Read Chapter 3', 'Read Chapters 1, 2, and 3')).toBe(false);
  });
  it('folds "Read Chapter 3" and "Read Chapter 1" into "Read Chapters 1, 2, and 3"', () => {
    const mk = (id: string, title: string) => ({ id, courseId: 'c1', title, dueAt: '2026-09-20T23:59:00-07:00', status: 'todo' });
    const out = foldReadings([mk('a', 'Read Chapters 1, 2, and 3'), mk('b', 'Read Chapter 3'), mk('c', 'Read Chapter 1'), mk('d', 'Chem Lab 3')]);
    expect(out.map((i) => i.id)).toEqual(['a', 'd']);
  });
});
