import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, NOW, TZ } from '../halo/fixtures';
import { matchMention, matchScore, nextWeekday, numbersAgree, proposalFor, titleSimilarity } from './match';
import type { Mention } from './notes';
import { sampleNotes } from './sample';

const chm = mkCourse({ id: 'c1', code: 'CHM-113', meetings: [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }] });
const items = [
  mkItem({ id: 'q2', courseId: 'c1', title: 'Topic 2 Quiz', label: 'Chem Quiz 2', type: 'quiz', dueAt: '2026-09-16T23:59:00-07:00' }),
  mkItem({ id: 'ex1', courseId: 'c1', title: 'Exam 1', label: 'Chem Exam 1', type: 'exam', dueAt: '2026-09-25T07:00:00-07:00' }),
  mkItem({ id: 'aleks', courseId: 'c1', title: 'ALEKS Objective 3', label: 'Chem ALEKS 3', dueAt: '2026-09-15T23:59:00-07:00' }),
  mkItem({ id: 'done', courseId: 'c1', title: 'Topic 1 Quiz', label: 'Chem Quiz 1', status: 'done' }),
  mkItem({ id: 'other', courseId: 'c2', title: 'Quiz 2', label: 'Eng Quiz 2' }),
];
const mention = (o: Partial<Mention>): Mention => ({ id: 'm', quote: 'q', kind: 'info', title: '', date: null, time: null, points: null, confidence: 'high', itemId: null, ...o });

describe('matching a mention to the planner', () => {
  it('finds the item by label or title, only in that class, never a done one', () => {
    expect(matchMention(mention({ title: 'Quiz 2' }), items, 'c1')?.id).toBe('q2');
    expect(matchMention(mention({ title: 'exam one' }), items, 'c1')?.id).toBe('ex1');
    expect(matchMention(mention({ title: 'Exam 1' }), items, 'c1')?.id).toBe('ex1');
    expect(matchMention(mention({ title: 'ALEKS homework' }), items, 'c1')?.id).toBe('aleks');
    expect(matchMention(mention({ title: 'Quiz 1' }), items, 'c1')).toBeNull();
    expect(matchMention(mention({ title: 'Chapter 4 reading check' }), items, 'c1')).toBeNull();
    expect(matchMention(mention({ title: 'anything', itemId: 'ex1' }), items, 'c1')?.id).toBe('ex1');
    expect(titleSimilarity('Quiz 2', 'Topic 2 Quiz')).toBeGreaterThan(0.5);
  });
  it('reads numbers in order: "Topic 2 DQ 1" is not "DQ 1.2", so it is added rather than moving the wrong post', () => {
    const eng = mkCourse({ id: 'e1', code: 'ENG-105' });
    const dq12 = mkItem({ id: 'dq12', courseId: 'e1', title: 'DQ 1.2', label: 'ENG-105-ONL4 DQ 1.2', type: 'discussion', dueAt: '2026-09-18T23:59:00-07:00' });
    const dq21 = mkItem({ id: 'dq21', courseId: 'e1', title: 'DQ 2.1', label: 'ENG-105-ONL4 DQ 2.1', type: 'discussion', dueAt: '2026-09-23T23:59:00-07:00' });
    const t2dq1 = mention({ title: 'Topic 2 DQ 1', kind: 'new', date: '2026-09-23', time: '23:59' });
    expect(matchMention(t2dq1, [dq12, dq21], 'e1')?.id).toBe('dq21');
    expect(matchMention(t2dq1, [dq12], 'e1')).toBeNull();
    expect(matchMention(mention({ title: 'Topic 1 DQ 2' }), [dq12, dq21], 'e1')?.id).toBe('dq12');
    expect(matchScore(t2dq1, dq12)).toBeLessThan(0.5);
    expect(matchScore(mention({ title: 'Topic 1 DQ 2' }), dq12)).toBeGreaterThanOrEqual(0.8);
    // With only the Sep 18 post in the planner, the Sep 23 one is added; nothing moves.
    expect(proposalFor(t2dq1, matchMention(t2dq1, [dq12], 'e1'), eng, TZ, '2026-09-15', NOW)).toMatchObject({ kind: 'add', item: { title: 'Topic 2 DQ 1' } });
    // Numbers that only extend the other title still agree.
    expect(numbersAgree('Quiz 3', 'Topic 3 Quiz 3')).toBe(true);
    expect(numbersAgree('Exam 2', 'Exam 1 Review')).toBe(false);
    expect(numbersAgree('Chemistry Connections Essay', 'Essay 2')).toBe(true);
  });
});

describe('proposals', () => {
  const at = (d: string, t = '23:59') => `${d}T${t}:00-07:00`;
  it('lets a posted score or a late flag land on a done item, and turns a late flag into a note to check', () => {
    expect(matchMention(mention({ kind: 'grade', title: 'Quiz 1', score: 8 }), items, 'c1')?.id).toBe('done');
    expect(matchMention(mention({ kind: 'info', title: 'Quiz 1', audit: { status: 'overdue', prefix: null } }), items, 'c1')?.id).toBe('done');
    expect(matchMention(mention({ kind: 'info', title: 'Quiz 1' }), items, 'c1')).toBeNull();
    const flag = proposalFor(mention({ kind: 'info', title: 'Quiz 1', audit: { status: 'overdue', prefix: null } }), items[3], chm, TZ, '2026-09-14', NOW);
    expect(flag).toEqual({ kind: 'flag', item: items[3], text: 'Halo says Chem Quiz 1 is late even though it is marked done here — check this.' });
    expect(proposalFor(mention({ kind: 'info', title: 'Nothing', audit: { status: 'overdue', prefix: null } }), null, chm, TZ, '2026-09-14', NOW)).toEqual({ kind: 'none', text: 'Halo says "Nothing" is late; nothing in the planner matches it. Check it in Halo.' });
  });
  it('records a posted score, confirms a known one, and sits out the prefixed and schedule lines', () => {
    const score = proposalFor(mention({ kind: 'grade', title: 'Quiz 2', score: 8, points: 10, audit: { status: 'grade', prefix: null } }), items[0], chm, TZ, '2026-09-14', NOW);
    expect(score).toEqual({ kind: 'score', item: items[0], score: 8 });
    const known = proposalFor(mention({ kind: 'grade', title: 'Quiz 2', score: 7, audit: { status: 'grade', prefix: null } }), { ...items[0], score: 7 }, chm, TZ, '2026-09-14', NOW);
    expect(known.kind).toBe('confirm');
    expect(proposalFor(mention({ kind: 'grade', title: 'Nothing', score: 7 }), null, chm, TZ, '2026-09-14', NOW).kind).toBe('none');
    expect(proposalFor(mention({ kind: 'new', title: 'Essay 1', date: '2026-09-20', audit: { status: 'new', prefix: 'ENG105-PENDING' } }), null, chm, TZ, '2026-09-14', NOW)).toMatchObject({ kind: 'none', text: expect.stringContaining('ENG-105') });
    expect(proposalFor(mention({ kind: 'date_change', title: 'Quiz 2', date: '2026-09-18', audit: { status: 'changed', prefix: 'OLD-SECTION' } }), items[0], chm, TZ, '2026-09-14', NOW).kind).toBe('none');
    expect(proposalFor(mention({ kind: 'info', title: 'schedule', audit: { status: 'schedule', prefix: null } }), null, chm, TZ, '2026-09-14', NOW)).toMatchObject({ kind: 'none', text: expect.stringContaining('Settings') });
    expect(proposalFor(mention({ kind: 'info', title: 'Quiz 2', audit: { status: 'overdue', prefix: null } }), items[0], chm, TZ, '2026-09-14', NOW)).toMatchObject({ kind: 'flag', item: items[0] });
  });
  it('moves a matched deadline, adds an unmatched one, removes a cancelled one, confirms info', () => {
    const move = proposalFor(mention({ kind: 'date_change', title: 'Quiz 2', date: '2026-09-18' }), items[0], chm, TZ, '2026-09-14', NOW);
    expect(move).toEqual({ kind: 'update', item: items[0], dueAt: at('2026-09-18') });
    const inClass = mkItem({ id: 'q3', courseId: 'c1', title: 'Topic 3 Quiz', type: 'quiz', dueAt: '2026-09-16T08:00:00-07:00' });
    const keepsTime = proposalFor(mention({ kind: 'date_change', title: 'Quiz 3', date: '2026-09-18' }), inClass, chm, TZ, '2026-09-14', NOW);
    expect(keepsTime).toEqual({ kind: 'update', item: inClass, dueAt: at('2026-09-18', '08:00') });
    const same = proposalFor(mention({ kind: 'date_change', title: 'Quiz 2', date: '2026-09-16' }), items[0], chm, TZ, '2026-09-14', NOW);
    expect(same.kind).toBe('confirm');
    const add = proposalFor(mention({ kind: 'new', title: 'Chapter 4 reading check', date: '2026-09-16', time: '07:00', points: 10, quote: 'read chapter four' }), null, chm, TZ, '2026-09-14', NOW);
    expect(add.kind).toBe('add');
    if (add.kind === 'add') {
      expect(add.item.dueAt).toBe(at('2026-09-16', '07:00'));
      expect(add.item.points).toBe(10);
      expect(add.item.type).toBe('homework');
      expect(add.item.source).toBe('manual');
      expect(add.item.notes).toMatch(/read chapter four/);
      expect(add.item.label).toMatch(/Chem/);
    }
    const noDate = proposalFor(mention({ kind: 'new', title: 'Something' }), null, chm, TZ, '2026-09-14', NOW);
    expect(noDate.kind).toBe('none');
    expect(proposalFor(mention({ kind: 'cancel', title: 'ALEKS' }), items[2], chm, TZ, '2026-09-14', NOW)).toEqual({ kind: 'remove', item: items[2] });
    expect(proposalFor(mention({ kind: 'cancel', title: 'ALEKS' }), null, chm, TZ, '2026-09-14', NOW).kind).toBe('none');
    const info = proposalFor(mention({ kind: 'info', title: 'Exam 1', date: '2026-09-25' }), items[1], chm, TZ, '2026-09-14', NOW);
    expect(info.kind).toBe('confirm');
    const infoMoved = proposalFor(mention({ kind: 'info', title: 'Exam 1', date: '2026-09-26' }), items[1], chm, TZ, '2026-09-14', NOW);
    expect(infoMoved.kind).toBe('update');
  });
  it('resolves weekday words forward from the lecture date', () => {
    expect(nextWeekday('Friday', '2026-09-09')).toBe('2026-09-11');
    expect(nextWeekday('Friday', '2026-09-11')).toBe('2026-09-18');
    expect(nextWeekday('mon', '2026-09-11')).toBe('2026-09-14');
    expect(nextWeekday('someday', '2026-09-11')).toBeNull();
  });
  it('the sample lecture exercises every proposal kind against seed-like items', () => {
    const notes = sampleNotes('2026-09-14', items, chm, TZ);
    const kinds = notes.mentions.map((m) => proposalFor(m, matchMention(m, items, 'c1'), chm, TZ, '2026-09-14', NOW).kind);
    expect(kinds).toEqual(['update', 'add', 'confirm', 'remove']);
    expect(notes.summary.length).toBeLessThanOrEqual(5);
    expect(notes.mentions[0].date).toBe('2026-09-18');
    expect(notes.mentions[1].date).toBe('2026-09-16');
    expect(notes.mentions[1].time).toBe('07:00');
    expect(notes.mentions[0].itemId).toBe('q2');
    expect(notes.mentions[2].date).toBe('2026-09-25');
    expect(notes.mentions[3].itemId).toBe('aleks');
  });
});
