import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, NOW, TZ } from './fixtures';
import { auditOutcomes, bulkImports, parseAuditResults, remainingCourses } from './audit';
import { judge, needLines } from './needs';
import { markLines, unknownLines } from './read';
import { matchMention, proposalFor } from '../record/match';
import type { Item } from '../domain/types';

/**
 * The second real audit (2026-09-15), pasted verbatim. Every class printed its own COVERAGE line reading x of x, then the
 * agent hit its context limit and refused, honestly, to print a FINAL COVERAGE block. All six classes are complete.
 */
const text = readFileSync(new URL('./fixtures/real-audit-2026-09-15.txt', import.meta.url), 'utf8');
const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I-Lecture' });
const chml = mkCourse({ id: 'chml', code: 'CHM-113L', name: 'General Chemistry I - Lab' });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math' });
const esgl = mkCourse({ id: 'esgl', code: 'ESG-162L', name: 'Engineering Math Lab' });
const unv = mkCourse({ id: 'unv', code: 'UNV-106', name: 'University Success' });
const courses = [chm, chml, eng, esg, esgl, unv];
const today = '2026-09-15';
const at = (d: string) => `${d}T23:59:00-07:00`;

describe('the second real audit: six own coverage lines and no FINAL block', () => {
  const r = parseAuditResults(text, courses, today, courses);
  const findings = r.mentions.filter((m) => m.audit?.status !== 'note');
  const byClass = (id: string) => findings.filter((m) => m.courseId === id);
  it('reads all 49 rows into the right classes with the right statuses', () => {
    expect(findings.length).toBe(49);
    expect(byClass('chm').map((m) => m.audit?.status)).toEqual(['new', 'new', 'grade']);
    expect(byClass('chml').map((m) => m.audit?.status)).toEqual(['new', 'new', 'announce']);
    expect(byClass('esgl').map((m) => m.audit?.status)).toEqual(['overdue', 'overdue', 'new']);
    expect(byClass('unv').map((m) => m.audit?.status)).toEqual(['new', 'new', 'grade', 'grade', 'grade']);
    expect(byClass('esg').map((m) => m.audit?.status)).toEqual(['overdue', 'new', 'grade', 'new', 'new']);
    expect(byClass('eng').length).toBe(30);
    expect(byClass('eng').every((m) => m.audit?.status === 'new')).toBe(true);
    expect(byClass('unv')[4]).toMatchObject({ title: 'Topic 1 Quiz', score: 43.19, points: 50 });
    expect(byClass('esg')[2]).toMatchObject({ title: 'Topic 1 Review', score: 13.67, points: 25 });
    expect(byClass('eng').find((m) => m.title === 'Final Draft of an Op-Ed Assignment (Online)')).toMatchObject({ date: '2026-11-01', points: 200 });
    expect(byClass('eng').find((m) => m.title === 'Class Introductions')).toMatchObject({ date: '2026-09-16', points: 0 });
    expect(r.reported).toBeNull();
  });
  it('sees every class complete on its own line, the FINAL block missing, nothing stopped, and nothing failed', () => {
    expect(r.order).toEqual(['chm', 'chml', 'esgl', 'unv', 'esg', 'eng']);
    for (const c of courses) {
      expect(r.classes[c.id].coverageFrom).toBe('class');
      expect(r.classes[c.id].failed).toEqual([]);
    }
    expect(r.classes.esgl.coverage).toEqual({ visited: 12, planned: 12 });
    expect(r.classes.chm.plan).toBe(14);
    expect(r.stopped).toBeNull();
    const o = auditOutcomes(r, courses);
    expect(o.map((x) => [x.course.code, x.reached, x.outcome?.coverageComplete, x.outcome?.partial, x.outcome?.skipped.length, x.outcome?.reason])).toEqual([
      ['CHM-113', true, true, false, 0, 'All 14 pages visited.'],
      ['CHM-113L', true, true, false, 0, 'All 14 pages visited.'],
      ['ENG-105', true, true, false, 0, 'All 14 pages visited.'],
      ['ESG-162', true, true, false, 0, 'All 14 pages visited.'],
      ['ESG-162L', true, true, false, 0, 'All 12 pages visited.'],
      ['UNV-106', true, true, false, 0, 'All 14 pages visited.'],
    ]);
    expect(remainingCourses(r, courses)).toEqual([]);
  });
  it('marks narration, skip notes, and the closing explanation as noise, and flags only lines that carry a date or score', () => {
    const marked = markLines(text, r);
    const unknown = unknownLines(marked);
    expect(unknown.some((l) => l.startsWith('Moving to class'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('(Skipping'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('No page failed'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('I have to stop you'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('Say the word'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('One more thing worth flagging'))).toBe(true);
    expect(unknown.length).toBeLessThanOrEqual(6);
    expect(r.unread.length).toBeLessThanOrEqual(6);
  });
  it('never moves a discussion post whose numbers match in a different order: "Topic 2 DQ 1" is not "DQ 1.2"', () => {
    // The planner shaped by the Halo calendar feed: posts titled "DQ 1.2" with the section code in the label.
    const dq = (n: string, d: string) => mkItem({ id: `dq${n}`, courseId: 'eng', title: `DQ ${n}`, label: `ENG-105-ONL4 DQ ${n}`, type: 'discussion', points: 5, dueAt: at(d) });
    const items = [dq('1.1', '2026-09-16'), dq('1.2', '2026-09-18'), dq('2.1', '2026-09-23'), dq('2.2', '2026-09-25')];
    const proposals = byClass('eng').map((m) => [m.title, proposalFor(m, matchMention(m, items, 'eng'), eng, TZ, today, NOW)] as const);
    expect(proposals.filter(([, p]) => p.kind === 'update')).toEqual([]);
    const byTitle = (t: string) => proposals.find(([title]) => title === t)![1];
    expect(byTitle('Topic 1 DQ 2')).toMatchObject({ kind: 'confirm', item: { id: 'dq1.2' } });
    expect(byTitle('Topic 2 DQ 1')).toMatchObject({ kind: 'confirm', item: { id: 'dq2.1' } });
    expect(byTitle('Topic 2 DQ 2')).toMatchObject({ kind: 'confirm', item: { id: 'dq2.2' } });
    expect(byTitle('Topic 3 DQ 1')).toMatchObject({ kind: 'add' });
    // With only the Sep 18 post present, the Sep 23 one is added rather than moving it.
    expect(proposalFor(byClass('eng').find((m) => m.title === 'Topic 2 DQ 1')!, matchMention(byClass('eng').find((m) => m.title === 'Topic 2 DQ 1')!, [items[1]], 'eng'), eng, TZ, today, NOW)).toMatchObject({ kind: 'add', item: { title: 'Topic 2 DQ 1' } });
  });
  it('applies what is safe and leaves four things for a person, with ENG-105 as one import', () => {
    const items: Item[] = [
      mkItem({ id: 'prereq', courseId: 'chm', title: 'CHM113 Prerequisite Concept Assignment', label: 'Chem Prereq Concepts', points: 20, status: 'done', completedAt: at('2026-09-13'), dueAt: at('2026-09-13') }),
      mkItem({ id: 'talk', courseId: 'chml', title: 'Chemistry Connections Presentation', label: 'Chem Lab Connections Talk', points: 75, dueAt: at('2026-09-27') }),
      mkItem({ id: 'essay', courseId: 'chml', title: 'Chemistry Connections Essay', label: 'Chem Lab Connections Essay', points: 100, dueAt: at('2026-10-09') }),
    ];
    const bulk = new Set(bulkImports(r, courses, (id) => items.filter((i) => i.courseId === id).length).flatMap((b) => b.ids));
    expect([...bulk].length).toBe(30);
    const outcomes = auditOutcomes(r, courses);
    const judged = findings.map((m) => {
      const course = courses.find((c) => c.id === m.courseId)!;
      const match = matchMention(m, items, course.id);
      return judge(m, course, proposalFor(m, match, course, TZ, today, NOW), match, outcomes.find((o) => o.course.id === course.id), bulk);
    });
    const auto = judged.filter((j) => j.lane === 'auto');
    const needs = judged.filter((j) => j.lane === 'needs');
    const info = judged.filter((j) => j.lane === 'info');
    // 30 ENG-105 rows, the prereq score, three UNV-106 grades brought in as done, Academic Plan and Effective Scheduling as done, the ESG-162 review as done with its score.
    // 29 of the 30: the 0-point intro post Halo already has as submitted is nothing to track.
    expect(auto.filter((j) => j.course.id === 'eng').length).toBe(29);
    expect(info.find((j) => j.course.id === 'eng')?.m.title).toBe('Summary of Current Course Content Knowledge');
    expect(auto.find((j) => j.m.title === 'CHM113 Prerequisite Concept Assignment')?.proposal.kind).toBe('score');
    expect(auto.filter((j) => j.course.id === 'unv' && j.proposal.kind === 'add').map((j) => j.proposal.kind === 'add' && [j.m.title, j.proposal.item.status, j.proposal.item.score])).toEqual([
      ['Topic 1 DQ 1', 'done', 5],
      ['Topic 1 DQ 2', 'done', 5],
      ['Topic 1 Quiz', 'done', 43.19],
    ]);
    expect(auto.find((j) => j.m.title === 'Academic Plan')?.proposal).toMatchObject({ kind: 'add', item: { status: 'done', points: 40 } });
    expect(auto.find((j) => j.m.title === 'Effective Scheduling')?.proposal).toMatchObject({ kind: 'add', item: { status: 'done', points: 50 } });
    expect(auto.find((j) => j.m.title === 'Topic 1 Review')?.proposal).toMatchObject({ kind: 'add', item: { status: 'done', score: 13.67, points: 25 } });
    // 0-point intro posts already submitted, or past their date without a late flag, are nothing to track.
    expect(info.filter((j) => /Summary of Current Course Content Knowledge|Class Introductions/.test(j.m.title) && j.m.audit?.status === 'new').length).toBe(9);
    expect(info.find((j) => j.course.id === 'chml' && j.m.title === 'Summary of Current Course Content Knowledge')?.proposal).toMatchObject({ kind: 'confirm', text: '"Summary of Current Course Content Knowledge" is a 0-point item already past its date, and Halo does not flag it late. Nothing to track.' });
    // What needs a person: the gating claim, the two ESG-162L late flags, the ESG-162 overdue install.
    expect(needs.map((j) => [j.course.code, j.why])).toEqual([
      ['CHM-113L', 'gating'],
      ['ESG-162L', 'late'],
      ['ESG-162L', 'late'],
      ['ESG-162', 'overdue'],
    ]);
    const claim = needs[0];
    expect(claim.proposal.kind).toBe('add');
    expect(matchMention(claim.m, items, 'chml')).toBeNull();
    const lines = needLines(judged, items, TZ);
    expect(lines.map((l) => [l.text, l.ids.length, l.action])).toEqual([
      ['Two ESG-162L items flagged late in Halo even though they were submitted, all at 0 pts: Summary of Current Course Content Knowledge and Class Introductions.', 2, 'none'],
      ['ESG-162 Software Installation is overdue and unsubmitted (due Sep 13).', 1, 'none'],
      ['CHM-113L Chemistry Connections Topic (name-claiming post) due Sep 20 — gates later work.', 1, 'add'],
    ]);
    expect(lines.some((l) => l.text.includes('ENG-105'))).toBe(false);
  });
});
