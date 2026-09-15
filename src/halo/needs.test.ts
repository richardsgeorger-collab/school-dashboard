import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, NOW, TZ } from './fixtures';
import type { ClassOutcome } from './audit';
import { judge, needLines } from './needs';
import { polishedLines } from './summary';
import { matchMention, proposalFor } from '../record/match';
import type { Mention } from './../record/notes';

const chm = mkCourse({ id: 'chm', code: 'CHM-113L', name: 'General Chemistry I - Lab' });
const esgl = mkCourse({ id: 'esgl', code: 'ESG-162L', name: 'Engineering Math Lab' });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const items = [
  mkItem({ id: 'talk', courseId: 'chm', title: 'Chemistry Connections Presentation', label: 'Chem Lab Connections Talk', points: 75, dueAt: '2026-09-27T23:59:00-07:00' }),
  mkItem({ id: 'q1', courseId: 'chm', title: 'Topic 1 Quiz', label: 'Chem Lab Quiz 1', type: 'quiz', dueAt: '2026-09-18T23:59:00-07:00' }),
  mkItem({ id: 'q2', courseId: 'chm', title: 'Topic 2 Quiz', label: 'Chem Lab Quiz 2', type: 'quiz', status: 'in_progress', dueAt: '2026-09-25T23:59:00-07:00' }),
  mkItem({ id: 'w1', courseId: 'esgl', title: 'Summary of Current Course Content Knowledge', label: 'Eng Math Lab Summary', points: 0, status: 'done', completedAt: NOW, dueAt: '2026-09-08T23:59:00-07:00' }),
  mkItem({ id: 'w2', courseId: 'esgl', title: 'Class Introductions', label: 'Eng Math Lab Intros', points: 0, status: 'done', completedAt: NOW, dueAt: '2026-09-09T23:59:00-07:00' }),
];
const complete: ClassOutcome['outcome'] = { clean: false, coverageComplete: true, missingRows: false, partial: false, findings: 1, coverage: { visited: 15, planned: 15 }, skipped: [], reason: 'All 15 pages visited.' };
const outcome = (course: typeof chm, o = complete): ClassOutcome => ({ course, reached: true, findings: 1, outcome: o });
const mention = (o: Partial<Mention>): Mention => ({ id: 'm', quote: 'q', kind: 'info', title: '', date: null, time: null, points: null, confidence: 'high', itemId: null, courseId: 'chm', ...o });
const run = (m: Mention, course: typeof chm, out = outcome(course), bulk = new Set<string>()) => {
  const match = matchMention(m, items, course.id);
  return judge(m, course, proposalFor(m, match, course, TZ, '2026-09-14', NOW), match, out, bulk);
};

describe('what applies on its own and what waits for a person', () => {
  it('applies grades, clean additions, and date changes on untouched unambiguous matches', () => {
    expect(run(mention({ id: 'g', kind: 'grade', title: 'Topic 1 Quiz', score: 9, points: 10, audit: { status: 'grade', prefix: null } }), chm).lane).toBe('auto');
    expect(run(mention({ id: 'n', kind: 'new', title: 'Lab Safety Contract', date: '2026-09-22', points: 10, audit: { status: 'new', prefix: null } }), chm).lane).toBe('auto');
    expect(run(mention({ id: 'd', kind: 'date_change', title: 'Topic 1 Quiz', date: '2026-09-19', audit: { status: 'changed', prefix: null } }), chm).lane).toBe('auto');
  });
  it('holds gating deadlines, late flags, overdue rows, removals, started items, low confidence, schedule changes, and incomplete classes', () => {
    const gate = run(mention({ id: 'c', kind: 'date_change', title: 'Chemistry Connections Topic selection', date: '2026-09-20', time: '23:59', audit: { status: 'announce', prefix: null }, note: 'prerequisite for Presentation 9/27 & Essay 10/9', gates: ['Presentation'] }), chm);
    expect([gate.lane, gate.why, gate.proposal.kind]).toEqual(['needs', 'gating', 'add']);
    const late = run(mention({ id: 'l', kind: 'info', title: 'Class Introductions', points: 0, courseId: 'esgl', audit: { status: 'overdue', prefix: null }, note: 'Halo flags Late (submitted 9/10, 0 pts)' }), esgl);
    expect([late.lane, late.why, late.proposal.kind]).toEqual(['needs', 'late', 'flag']);
    const over = run(mention({ id: 'o', kind: 'info', title: 'Software Installation', date: '2026-09-13', courseId: 'esgl', audit: { status: 'overdue', prefix: null }, note: 'never submitted' }), esgl);
    expect([over.lane, over.why]).toEqual(['needs', 'overdue']);
    expect(run(mention({ id: 'r', kind: 'cancel', title: 'Topic 1 Quiz', audit: { status: 'missing', prefix: null } }), chm).why).toBe('removal');
    expect(run(mention({ id: 's', kind: 'date_change', title: 'Topic 2 Quiz', date: '2026-09-26', audit: { status: 'changed', prefix: null } }), chm).why).toBe('started');
    expect(run(mention({ id: 'lo', kind: 'date_change', title: 'Topic 1 Quiz', date: '2026-09-19', confidence: 'low', audit: { status: 'changed', prefix: null } }), chm).why).toBe('low');
    expect(run(mention({ id: 'sc', kind: 'info', title: 'Participation days/week requirement', courseId: 'eng', audit: { status: 'schedule', prefix: null }, note: 'Syllabus says 4; announcement says 3' }), eng).why).toBe('schedule');
    const short = run(mention({ id: 'd2', kind: 'date_change', title: 'Topic 1 Quiz', date: '2026-09-19', audit: { status: 'changed', prefix: null } }), chm, outcome(chm, { ...complete, coverageComplete: false, partial: true, reason: 'Visited 9 of 15 pages.' }));
    expect(short.why).toBe('coverage');
    expect(run(mention({ id: 'ok', kind: 'new', title: 'Topic 1 Quiz', date: '2026-09-18', audit: { status: 'new', prefix: null } }), chm).lane).toBe('info');
  });
  it('writes the few lines a person reads, grouped, with full course codes', () => {
    const judged = [
      run(mention({ id: 'c', kind: 'date_change', title: 'Chemistry Connections Topic selection', date: '2026-09-20', time: '23:59', audit: { status: 'announce', prefix: null }, note: 'prerequisite for Presentation 9/27', gates: ['your Sep 27 presentation'] }), chm),
      run(mention({ id: 'l1', kind: 'info', title: 'Summary of Current Course Content Knowledge', points: 0, courseId: 'esgl', audit: { status: 'overdue', prefix: null }, note: 'Halo flags Late (submitted 9/9, 0 pts)' }), esgl),
      run(mention({ id: 'l2', kind: 'info', title: 'Class Introductions', points: 0, courseId: 'esgl', audit: { status: 'overdue', prefix: null }, note: 'Halo flags Late (submitted 9/10, 0 pts)' }), esgl),
      run(mention({ id: 'o', kind: 'info', title: 'Software Installation', date: '2026-09-13', courseId: 'eng', audit: { status: 'overdue', prefix: null }, note: 'never submitted' }), eng),
      run(mention({ id: 'sc', kind: 'info', title: 'Participation days/week requirement', courseId: 'eng', audit: { status: 'schedule', prefix: null }, note: 'Syllabus says 4 participation days, announcement says 3' }), eng),
      run(mention({ id: 'g', kind: 'grade', title: 'Topic 1 Quiz', score: 9, points: 10, audit: { status: 'grade', prefix: null } }), chm),
    ];
    const lines = needLines(judged, items, TZ);
    expect(lines.map((l) => [l.text, l.ids, l.action])).toEqual([
      ['Two ESG-162L items flagged late in Halo even though they were submitted, all at 0 pts: Eng Math Lab Summary and Eng Math Lab Intros.', ['l1', 'l2'], 'note'],
      ['ENG-105 Software Installation is overdue and unsubmitted (due Sep 13).', ['o'], 'none'],
      ['CHM-113L Chemistry Connections Topic selection due Sep 20 — gates your Sep 27 presentation.', ['c'], 'add'],
      ['ENG-105: Syllabus says 4 participation days, announcement says 3', ['sc'], 'none'],
    ]);
    const polished = polishedLines({ lines: [{ id: 'n3', text: 'CHM-113L topic claim due Sep 20 — gates your Sep 27 presentation.' }, { id: 'zz', text: 'ignored' }] }, lines);
    expect(polished[2].text).toBe('CHM-113L topic claim due Sep 20 — gates your Sep 27 presentation.');
    expect(polished[0].text).toBe(lines[0].text);
  });
});
