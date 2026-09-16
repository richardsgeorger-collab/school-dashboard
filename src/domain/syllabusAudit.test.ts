import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { SYLLABUS_PROMPT_BUDGET, splitSyllabus, syllabusForPrompt, tidySyllabusText, wasStoredTruncated } from '../syllabus/context';
import { auditDates, auditLine, rowScore, withFixedDates } from './syllabusAudit';
import type { Item } from './types';

const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const at = (d: string, t = '23:59:00') => `${d}T${t}-07:00`;

/** A GCU syllabus in the shape the parser reads: each assignment is a title, the column header, then its date row. */
const row = (title: string, opens: string, due: string, points = 5) => `${title}\nStart Date & Time Due Date & Time Points\n${opens} ${due} ${points}`;
const topic = (n: number, title: string, from: string, to: string, rows: string[]) => [`Topic ${n}: ${title}`, `${from} - ${to} Max Points: 100`, ...rows].join('\n');
const syllabus = [
  'ENG-105 4 Credits Aug 31 - Dec 13',
  'English Composition I',
  'Instructor: Pat Rivera',
  'pat.rivera@gcu.edu',
  'Late work loses 10% per day.',
  topic(1, 'Getting Started', 'Aug 31, 2026', 'Sep 06, 2026', [row('Topic 1 DQ 1', 'Sep 14, 2026, 12:00 AM', 'Sep 16, 2026, 11:59 PM'), row('Topic 1 DQ 2', 'Sep 14, 2026, 12:00 AM', 'Sep 18, 2026, 11:59 PM')]),
  topic(2, 'Rhetoric', 'Sep 07, 2026', 'Sep 13, 2026', [row('Topic 2 DQ 1', 'Sep 21, 2026, 12:00 AM', 'Sep 23, 2026, 11:59 PM'), row('Topic 2 DQ 2', 'Sep 21, 2026, 12:00 AM', 'Sep 25, 2026, 11:59 PM')]),
  topic(6, 'Revision', 'Oct 05, 2026', 'Oct 11, 2026', [row('Topic 6 DQ 1', 'Oct 19, 2026, 12:00 AM', 'Oct 21, 2026, 11:59 PM'), row('Topic 6 DQ 2', 'Oct 19, 2026, 12:00 AM', 'Oct 23, 2026, 11:59 PM')]),
].join('\n');

const items: Item[] = [
  mkItem({ id: 'dq11', courseId: 'eng', title: 'DQ 1.1', label: 'ENG-105-ONL4 DQ 1.1', type: 'discussion', points: 5, dueAt: at('2026-09-16') }),
  // What the bad sync wrote: Topic 1 DQ 2 carrying Topic 2 DQ 1's date.
  mkItem({ id: 'dq12', courseId: 'eng', title: 'DQ 1.2', label: 'ENG-105-ONL4 DQ 1.2', type: 'discussion', points: 5, dueAt: at('2026-09-23') }),
  mkItem({ id: 'dq21', courseId: 'eng', title: 'DQ 2.1', label: 'ENG-105-ONL4 DQ 2.1', type: 'discussion', points: 5, dueAt: at('2026-09-23') }),
  mkItem({ id: 'dq22', courseId: 'eng', title: 'DQ 2.2', label: 'ENG-105-ONL4 DQ 2.2', type: 'discussion', points: 5, dueAt: at('2026-09-25') }),
  mkItem({ id: 'essay', courseId: 'eng', title: 'Final Draft of an Op-Ed', label: 'Eng Op-Ed Final', type: 'paper', points: 200, dueAt: at('2026-11-01') }),
];

describe('the planner held against the syllabus', () => {
  it('finds the one wrong date, leaves the right ones alone, and never matches numbers out of order', () => {
    const audit = auditDates(eng, items, syllabus, TZ);
    expect(audit.rows).toBe(6);
    expect(audit.mismatches.map((m) => [m.item.id, m.title, m.plannerAt, m.syllabusAt])).toEqual([['dq12', 'Topic 1 DQ 2', at('2026-09-23'), at('2026-09-18')]]);
    expect(audit.mismatches[0].line).toBe('ENG-105-ONL4 DQ 1.2 is Sep 23 11:59 PM here; the syllabus says Sep 18 11:59 PM.');
    // "Topic 2 DQ 1" must not match "DQ 1.2", or the audit would propose the same corruption it is undoing.
    expect(rowScore('Topic 2 DQ 1', items[1])).toBe(0);
    expect(rowScore('Topic 1 DQ 2', items[1])).toBeGreaterThan(0.6);
    expect(audit.matched).toBe(4);
    expect(audit.unmatched).toEqual(['Eng Op-Ed Final']);
    expect(auditLine(audit, eng, '2026-09-16')).toBe('1 ENG-105 date does not match the syllabus.');
  });
  it('writes only the dates that were checked, and says so when the stored syllabus stops early', () => {
    const audit = auditDates(eng, items, syllabus, TZ);
    const { items: fixed, touched } = withFixedDates(items, audit.mismatches, '2026-09-16T12:00:00.000Z');
    expect(touched).toEqual(['dq12']);
    expect(fixed.find((i) => i.id === 'dq12')).toMatchObject({ dueAt: at('2026-09-18'), title: 'DQ 1.2', points: 5, status: 'todo' });
    expect(fixed.filter((i) => i.id !== 'dq12')).toEqual(items.filter((i) => i.id !== 'dq12'));
    // Applying it again changes nothing, and the audit then comes back clean.
    expect(withFixedDates(fixed, audit.mismatches, 'n').touched).toEqual([]);
    expect(auditDates(eng, fixed, syllabus, TZ).mismatches).toEqual([]);
    expect(auditLine(auditDates(eng, fixed, syllabus, TZ), eng, '2026-09-16')).toBe('Every ENG-105 date matches the syllabus (4 of 6 rows matched an item).');
    const cut = tidySyllabusText(`${syllabus}\n${'x'.repeat(200)}`, 400);
    const partial = auditDates(eng, items, cut, TZ);
    expect(partial.partial).toBe(true);
    expect(auditLine(partial, eng, '2026-09-16')).toContain('missing its end');
  });
  it('says plainly when there is no syllabus to check against', () => {
    expect(auditDates(eng, items, null, TZ).note).toContain('No syllabus on file for ENG-105');
    expect(auditDates(eng, items, 'too short', TZ).mismatches).toEqual([]);
  });
});

describe('how much of the syllabus reaches the model', () => {
  it('stores all of it now, and knows a copy stored under the old cap', () => {
    const long = 'Topic 1: Getting Started\n' + 'a'.repeat(50_000);
    expect(tidySyllabusText(long).length).toBe(long.length);
    expect(wasStoredTruncated(tidySyllabusText(long))).toBe(false);
    const old = tidySyllabusText(long, 30_000);
    expect(old.length).toBe(30_021);
    expect(wasStoredTruncated(old)).toBe(true);
  });
  it('sends the whole thing when it fits, and counts what went', () => {
    const one = syllabusForPrompt(syllabus);
    expect(one.sent).toBe(syllabus.length);
    expect(one.stored).toBe(syllabus.length);
    expect(one.dropped).toEqual([]);
    expect(one.text).toContain('Topic 6 DQ 2');
    expect(syllabus.length).toBeLessThan(SYLLABUS_PROMPT_BUDGET);
  });
  it('splits by topic and keeps the topics over the preamble when it does not fit, naming what was left out', () => {
    const pieces = splitSyllabus(syllabus);
    expect(pieces.head.text).toContain('Late work loses 10% per day.');
    expect(pieces.topics.map((t) => t.heading)).toEqual(['Topic 1: Getting Started', 'Topic 2: Rhetoric', 'Topic 6: Revision']);
    // A budget that holds the topics but not the preamble: the prompts survive, the policy text is named as dropped.
    const topicChars = pieces.topics.reduce((n, t) => n + t.text.length, 0);
    const tight = syllabusForPrompt(syllabus, topicChars + 10);
    expect(tight.dropped).toEqual(['Course information']);
    expect(tight.text).toContain('Topic 6 DQ 2');
    expect(tight.text).toContain('[Left out of this copy, too long to fit: Course information.');
    expect(tight.sent).toBeLessThan(tight.stored);
    // Tighter still: the last topic goes, and it is named rather than dropped in silence.
    const tighter = syllabusForPrompt(syllabus, pieces.topics[0].text.length + 5);
    expect(tighter.dropped).toEqual(['Course information', 'Topic 2: Rhetoric', 'Topic 6: Revision']);
    expect(tighter.text).toContain('Topic 1 DQ 2');
    expect(tighter.text).not.toContain('Topic 6 DQ 1');
  });
});
