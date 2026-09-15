import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, NOW, TZ } from './fixtures';
import { auditOutcomes, bulkImports, parseAuditResults, remainingCourses } from './audit';
import { markLines, parseFromTool, unknownLines } from './read';
import { matchMention, proposalFor } from '../record/match';
import { applyProposal } from '../record/apply';
import type { Item } from '../domain/types';

/**
 * The first real audit, pasted verbatim (2026-09-14). It carries 34 pipe-delimited rows across four classes; the
 * UNV-106 and ESG-162 report sections are absent from the paste, and the FINAL COVERAGE block says so by counting
 * 3 findings each for them. The closing prose names five of those six (two ESG-162, three UNV-106 grades without titles).
 */
const text = readFileSync(new URL('./fixtures/real-audit-2026-09-14.txt', import.meta.url), 'utf8');
const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I-Lecture' });
const chml = mkCourse({ id: 'chml', code: 'CHM-113L', name: 'General Chemistry I - Lab' });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math' });
const esgl = mkCourse({ id: 'esgl', code: 'ESG-162L', name: 'Engineering Math Lab' });
const unv = mkCourse({ id: 'unv', code: 'UNV-106', name: 'University Success' });
const courses = [chm, chml, eng, esg, esgl, unv];
const today = '2026-09-14';

describe('the real audit through the pipe-row fallback', () => {
  const r = parseAuditResults(text, courses, today, courses);
  const findings = r.mentions.filter((m) => m.audit?.status !== 'note');
  it('reads every one of the 34 rows with its class, status, date, points, and score', () => {
    expect(findings.length).toBe(34);
    const byClass = (id: string) => findings.filter((m) => m.courseId === id);
    expect(byClass('chm').map((m) => [m.title, m.audit?.status, m.date, m.points, m.score])).toEqual([['CHM113 Prerequisite Concept Assignment', 'grade', '2026-09-13', 20, 19.66]]);
    expect(byClass('chml').map((m) => [m.title, m.audit?.status, m.date, m.time, m.kind])).toEqual([['Chemistry Connections Topic selection', 'announce', '2026-09-20', '23:59', 'date_change']]);
    expect(byClass('esgl').map((m) => [m.title, m.audit?.status, m.date, m.points])).toEqual([
      ['Effective Scheduling', 'new', '2026-09-14', 50],
      ['Summary of Current Course Content Knowledge', 'overdue', '2026-09-08', 0],
      ['Class Introductions', 'overdue', '2026-09-09', 0],
    ]);
    const engRows = byClass('eng');
    expect(engRows.length).toBe(29);
    expect(engRows.filter((m) => m.audit?.status === 'new').length).toBe(28);
    expect(engRows.find((m) => m.audit?.status === 'schedule')?.title).toBe('Participation days/week requirement');
    expect(engRows.find((m) => m.title === 'Final Draft of an Op-Ed Assignment (Online)')).toMatchObject({ date: '2026-11-01', time: '23:59', points: 200 });
    expect(byClass('esg')).toEqual([]);
    expect(byClass('unv')).toEqual([]);
    expect(findings.every((m) => m.courseId !== null)).toBe(true);
    expect(r.reported).toBe(40);
    expect(r.source).toBe('pipes');
  });
  it('keeps every class’s coverage apart, resolves the ENG-105-ONL4 section suffix, and sets the seven generic pages aside before judging coverage', () => {
    expect(r.order).toEqual(['chm', 'chml', 'esgl', 'eng', 'unv', 'esg']);
    expect(r.classes.chm.plan).toBe(22);
    expect(r.classes.chm.planPages.length).toBe(22);
    expect(r.classes.chm.coverage).toEqual({ visited: 15, planned: 22 });
    expect(r.classes.chml.coverage).toEqual({ visited: 15, planned: 22 });
    expect(r.classes.esgl.coverage).toEqual({ visited: 13, planned: 20 });
    expect(r.classes.eng.coverage).toEqual({ visited: 15, planned: 22 });
    expect(r.classes.unv.coverage).toEqual({ visited: 15, planned: 22 });
    expect(r.classes.esg.coverage).toEqual({ visited: 15, planned: 22 });
    expect(r.classes.eng.reportedFindings).toBe(29);
    expect(r.classes.esg.reportedFindings).toBe(3);
    expect(r.stopped).toBeNull();
    expect(r.genericSkipNote).toBe(true);
    expect(r.classes.chm.genericPlanned).toBe(7);
    expect(r.classes.chml.genericPlanned).toBe(7);
    const o = auditOutcomes(r, courses);
    // All six classes are complete on coverage: 15 of 22 with the 7 whitelisted pages set aside reads 15 of 15.
    expect(o.map((x) => [x.course.code, x.outcome?.coverageComplete, x.outcome?.coverage, x.outcome?.skipped.length])).toEqual([
      ['CHM-113', true, { visited: 15, planned: 15 }, 0],
      ['CHM-113L', true, { visited: 15, planned: 15 }, 0],
      ['ENG-105', true, { visited: 15, planned: 15 }, 0],
      ['ESG-162', true, { visited: 15, planned: 15 }, 0],
      ['ESG-162L', true, { visited: 13, planned: 13 }, 0],
      ['UNV-106', true, { visited: 15, planned: 15 }, 0],
    ]);
    expect(o.map((x) => [x.course.code, x.findings, x.outcome?.partial, x.outcome?.missingRows])).toEqual([
      ['CHM-113', 1, false, false],
      ['CHM-113L', 1, false, false],
      ['ENG-105', 29, false, false],
      ['ESG-162', 0, true, true],
      ['ESG-162L', 3, false, false],
      ['UNV-106', 0, true, true],
    ]);
    expect(o.find((x) => x.course.code === 'CHM-113')?.outcome?.reason).toBe('All 15 pages visited.');
    expect(o.find((x) => x.course.code === 'ESG-162')?.outcome?.reason).toBe('The final summary counts 3 findings for this class, but only 0 were read. Its report section may be missing from the paste.');
    expect(o.every((x) => !x.outcome?.clean)).toBe(true);
    expect(o.filter((x) => x.outcome?.reason.includes('not checked') || x.outcome?.reason.includes('generic'))).toEqual([]);
    expect(remainingCourses(r, courses)).toEqual([]);
  });
  it('sees ENG-105 as one import, and never turns the topic-claim deadline into a move of the presentation', () => {
    expect(bulkImports(r, courses, (id) => (id === 'eng' ? 0 : 10)).map((b) => [b.course.code, b.ids.length])).toEqual([['ENG-105', 28]]);
    const talk = mkItem({ id: 'talk', courseId: 'chml', title: 'Chemistry Connections Presentation', label: 'Chem Lab Connections Talk', type: 'project', points: 75, dueAt: '2026-09-27T23:59:00-07:00' });
    const essay = mkItem({ id: 'essay', courseId: 'chml', title: 'Chemistry Connections Essay', label: 'Chem Lab Connections Essay', type: 'paper', points: 100, dueAt: '2026-10-09T23:59:00-07:00' });
    const claim = findings.find((m) => m.courseId === 'chml')!;
    const match = matchMention(claim, [talk, essay], 'chml');
    expect(match).toBeNull();
    const p = proposalFor(claim, match, chml, TZ, today, NOW);
    expect(p.kind).toBe('add');
    if (p.kind !== 'add') return;
    expect(p.item.dueAt).toBe('2026-09-20T23:59:00-07:00');
    const upserts: Item[] = [];
    applyProposal(p, claim, { upsertItem: (i) => void upserts.push(i), deleteItem: () => undefined, applyScore: () => undefined }, TZ, today, false, {}, [talk, essay]);
    expect(upserts[0].title).toBe('Chemistry Connections Topic selection');
    expect(talk.dueAt).toBe('2026-09-27T23:59:00-07:00');
  });
  it('classifies the narration as noise and lists only the prose summary as possibly missed content', () => {
    const marked = markLines(text, r);
    const counts: Record<string, number> = {};
    for (const l of marked) counts[l.kind] = (counts[l.kind] ?? 0) + 1;
    expect(counts.finding).toBe(34);
    expect(counts.coverage).toBeGreaterThanOrEqual(6 + 6 + 4 + 4);
    const unknown = unknownLines(marked);
    expect(unknown.some((l) => l.startsWith('Used Claude in Chrome'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('Moving to'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('No other differences'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('Starting Phase 2'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('Skipped, and why'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('Full class calendar'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('Class Questions'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('9-15. Topic'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('The two that actually matter'))).toBe(false);
    expect(unknown.some((l) => l.startsWith('ESG-162 (lecture)'))).toBe(true);
    expect(unknown.some((l) => l.startsWith('UNV-106: Clean'))).toBe(true);
    expect(unknown.some((l) => l.startsWith('CHM-113L (lab)'))).toBe(true);
    expect(unknown.length).toBeLessThanOrEqual(8);
    expect(counts.prose ?? 0).toBeLessThanOrEqual(6);
  });
});

describe('the same audit as the model should read it', () => {
  it('turns the prose about the two missing sections into the five findings the text carries, on the right classes', () => {
    const p = parseFromTool(
      {
        classes: [
          { code: 'ESG-162', planned_pages: 22, visited_pages: 15, coverage_visited: 15, coverage_planned: 22, skipped: ['Mission Statement', 'Doctrinal Statement', 'Library', 'Student Success Center', 'Student AI Resources', 'Learning Support', 'Classroom Policies'], stopped_at: null, reported_findings: 3, notes: 'report section missing from the paste; findings taken from the closing summary' },
          { code: 'UNV-106', planned_pages: 22, visited_pages: 15, coverage_visited: 15, coverage_planned: 22, skipped: ['the 7 generic Institution Resources pages'], stopped_at: null, reported_findings: 3, notes: '' },
        ],
        findings: [
          { class_code: 'ESG-162', title: 'Topic 1 Review', status: 'grade', due: null, points: 25, score: 13.67, note: '13.67/25 (54.68%)', confidence: 'high', quote: "ESG-162 (lecture) — you're sitting at an F. Topic 1 Review scored 13.67/25 (54.68%)", gates: [] },
          { class_code: 'ESG-162', title: 'Software Installation', status: 'overdue', due: '2026-09-13 23:59', points: null, score: null, note: 'flagged Overdue, never submitted', confidence: 'high', quote: '"Software Installation" is flagged Overdue in Halo (due 9/13, never submitted)', gates: [] },
          { class_code: 'UNV-106', title: 'Topic 1 posted grade (5/5)', status: 'grade', due: null, points: 5, score: 5, note: 'title not given in the paste', confidence: 'low', quote: 'two 5/5s and a 43.19/50', gates: [] },
          { class_code: 'UNV-106', title: 'Topic 1 posted grade (5/5), second', status: 'grade', due: null, points: 5, score: 5, note: 'title not given in the paste', confidence: 'low', quote: 'two 5/5s and a 43.19/50', gates: [] },
          { class_code: 'UNV-106', title: 'Topic 1 posted grade (43.19/50)', status: 'grade', due: null, points: 50, score: 43.19, note: 'title not given in the paste', confidence: 'low', quote: 'two 5/5s and a 43.19/50', gates: [] },
        ],
        all_match: false,
        stopped: null,
        unread: [],
      },
      courses,
      courses,
    );
    expect(p.mentions.map((m) => [m.courseId, m.title, m.audit?.status, m.score, m.points, m.confidence])).toEqual([
      ['esg', 'Topic 1 Review', 'grade', 13.67, 25, 'high'],
      ['esg', 'Software Installation', 'overdue', null, null, 'high'],
      ['unv', 'Topic 1 posted grade (5/5)', 'grade', 5, 5, 'low'],
      ['unv', 'Topic 1 posted grade (5/5), second', 'grade', 5, 5, 'low'],
      ['unv', 'Topic 1 posted grade (43.19/50)', 'grade', 43.19, 50, 'low'],
    ]);
    const o = auditOutcomes(p, [esg, unv]);
    expect(o.map((x) => [x.course.code, x.findings, x.outcome?.partial, x.outcome?.reason])).toEqual([
      ['ESG-162', 2, true, 'The final summary counts 3 findings for this class, but only 2 were read. Its report section may be missing from the paste.'],
      ['UNV-106', 3, false, 'All 15 pages visited.'],
    ]);
  });
});
