import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, NOW, TZ } from './fixtures';
import { auditOutcomes, bulkImports, parseAuditResults, remainingCourses } from './audit';
import { judge, needLines } from './needs';
import { parseFromTool } from './read';
import { matchMention, proposalFor } from '../record/match';

/**
 * The second real run: ENG-105 fully audited with its own line "COVERAGE — ENG-105 — visited 14 of 14 pages", then the
 * agent hit its context limit mid-ESG-162 and never printed a FINAL COVERAGE block. ENG-105 must read complete; only
 * ESG-162, which has no coverage line, is short.
 */
const text = readFileSync(new URL('./fixtures/real-audit-2026-09-15-eng.txt', import.meta.url), 'utf8');
const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math' });
const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I' });
const courses = [eng, esg, chm];
const today = '2026-09-15';

describe('the class’s own COVERAGE line is authoritative', () => {
  const r = parseAuditResults(text, courses, today, courses);
  const findings = r.mentions.filter((m) => m.audit?.status !== 'note');
  it('reads 30 ENG-105 rows and two ESG-162 rows, and no FINAL block', () => {
    expect(findings.filter((m) => m.courseId === 'eng').length).toBe(30);
    expect(findings.filter((m) => m.courseId === 'esg').map((m) => m.audit?.status)).toEqual(['grade', 'overdue']);
    expect(r.reported).toBeNull();
    expect(r.classes.eng.coverage).toEqual({ visited: 14, planned: 14 });
    expect(r.classes.eng.coverageFrom).toBe('class');
    expect(r.classes.eng.plan).toBe(22);
    expect(r.classes.esg.coverage).toBeNull();
  });
  it('calls ENG-105 complete on its own line despite the 22-page plan and the missing FINAL block; ESG-162 is short with no line', () => {
    const o = auditOutcomes(r, courses);
    const engO = o.find((x) => x.course.code === 'ENG-105')!;
    expect(engO.outcome).toMatchObject({ coverageComplete: true, partial: false, missingRows: false, coverage: { visited: 14, planned: 14 }, skipped: [], reason: 'All 14 pages visited.' });
    const esgO = o.find((x) => x.course.code === 'ESG-162')!;
    expect(esgO.outcome).toMatchObject({ coverageComplete: false, partial: true, reason: 'No coverage count, so this cannot count as a full check.' });
    expect(o.find((x) => x.course.code === 'CHM-113')).toMatchObject({ reached: false, outcome: null });
    expect(remainingCourses(r, courses).map((c) => c.code)).toEqual(['ESG-162', 'CHM-113']);
  });
  it('lets a complete class’s own line win even when a stop is recorded later in the run', () => {
    const stopped = parseAuditResults(`${text}\nSTOPPED — ESG-162 — Topic 3`, courses, today, courses);
    const o = auditOutcomes(stopped, courses);
    expect(o.find((x) => x.course.code === 'ENG-105')!.outcome!.coverageComplete).toBe(true);
    expect(o.find((x) => x.course.code === 'ESG-162')!.outcome!.reason).toBe('Stopped early at Topic 3.');
    expect(stopped.stopped).toEqual({ courseId: 'esg', page: 'Topic 3' });
  });
  it('still holds a class whose numbers came only from a FINAL block when its rows are missing', () => {
    const withFinal = parseAuditResults(`${text}\nFINAL COVERAGE\nENG-105 — visited 14 of 14 pages — 30 findings\nUNV-106 — visited 15 of 22 pages — 3 findings\nEND OF FINDINGS — 35 items`, [...courses, mkCourse({ id: 'unv', code: 'UNV-106' })], today, [...courses, mkCourse({ id: 'unv', code: 'UNV-106' })]);
    expect(withFinal.classes.unv.coverageFrom).toBe('final');
    const o = auditOutcomes(withFinal, [...courses, mkCourse({ id: 'unv', code: 'UNV-106' })]);
    expect(o.find((x) => x.course.code === 'ENG-105')!.outcome!.coverageComplete).toBe(true);
    expect(o.find((x) => x.course.code === 'UNV-106')!.outcome).toMatchObject({ missingRows: true, partial: true });
  });
  it('reads the same shape from the model: own line 14 of 14 with a 22-page plan and a stop elsewhere is complete', () => {
    const p = parseFromTool({ classes: [{ code: 'ENG-105-ONL4', planned_pages: 22, visited_pages: 14, coverage_visited: 14, coverage_planned: 14, own_coverage_line: true, skipped: ['the 7 generic Institution Resources pages'], generic_pages_planned: null, stopped_at: null, reported_findings: null, notes: '' }, { code: 'ESG-162', planned_pages: 20, visited_pages: 6, coverage_visited: null, coverage_planned: null, own_coverage_line: false, skipped: [], generic_pages_planned: null, stopped_at: 'Topic 3', reported_findings: null, notes: 'ran out of room' }], findings: [], all_match: false, stopped: { class_code: 'ESG-162', page: 'Topic 3' }, unread: [] }, courses, courses);
    const o = auditOutcomes(p, courses);
    expect(o.find((x) => x.course.code === 'ENG-105')!.outcome).toMatchObject({ coverageComplete: true, partial: false, coverage: { visited: 14, planned: 14 } });
    expect(o.find((x) => x.course.code === 'ESG-162')!.outcome).toMatchObject({ coverageComplete: false, reason: 'Stopped early at Topic 3.' });
  });
});

describe('a whole-class import is one line and one button', () => {
  const r = parseAuditResults(text, courses, today, courses);
  const findings = r.mentions.filter((m) => m.audit?.status !== 'note');
  const items = [mkItem({ id: 'x', courseId: 'chm', title: 'Quiz 1' })];
  const bulk = new Set(bulkImports(r, courses, () => 0).flatMap((b) => b.ids));
  const judgeAll = (outcomes: ReturnType<typeof auditOutcomes>) =>
    findings.map((m) => {
      const course = courses.find((c) => c.id === m.courseId)!;
      const match = matchMention(m, items, course.id);
      return judge(m, course, proposalFor(m, match, course, TZ, today, NOW), match, outcomes.find((o) => o.course.id === course.id), bulk);
    });
  it('applies all 30 on its own when the class is complete, with no line at all', () => {
    expect(bulk.size).toBe(30);
    const judged = judgeAll(auditOutcomes(r, courses));
    expect(judged.filter((j) => j.course.id === 'eng' && j.lane === 'auto').length).toBe(30);
    const lines = needLines(judged, items, TZ);
    expect(lines.some((l) => l.text.includes('ENG-105'))).toBe(false);
    expect(lines.map((l) => l.text)).toEqual(['ESG-162 Software Installation is overdue and unsubmitted (due Sep 13).']);
  });
  it('folds all 30 into one line and one button when the class is held back, never thirty rows', () => {
    const short = parseAuditResults(text.replace('visited 14 of 14 pages', 'visited 12 of 14 pages'), courses, today, courses);
    const judged = judgeAll(auditOutcomes(short, courses));
    expect(judged.filter((j) => j.course.id === 'eng' && j.lane === 'needs').length).toBe(30);
    const lines = needLines(judged, items, TZ);
    const engLine = lines.find((l) => l.text.startsWith('ENG-105'))!;
    expect(engLine.text).toBe("ENG-105 isn't in your planner yet — 30 items to add (held back because its coverage came back short).");
    expect(engLine.ids.length).toBe(30);
    expect(engLine.action).toBe('add');
    expect(lines.filter((l) => l.text.startsWith('ENG-105')).length).toBe(1);
  });
});
