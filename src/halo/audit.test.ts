import { describe, expect, it } from 'vitest';
import { mkCourse, mkData, mkItem, TZ } from './fixtures';
import { auditOutcomes, buildAuditPrompt, classifyClass, DEFAULT_AUDIT_PROMPT, isGenericPage, parseAuditResults, plannerByClass, plannerListing, remainingCourses } from './audit';

const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I-Lecture' });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math' });
const unv = mkCourse({ id: 'unv', code: 'UNV-106', name: 'University Success' });
const courses = [chm, esg, unv];
const data = mkData(courses, [
  mkItem({ id: 'q3', courseId: 'chm', title: 'Topic 3 Quiz', points: 50, dueAt: '2026-09-25T23:59:00-07:00' }),
  mkItem({ id: 'old', courseId: 'chm', title: 'Old thing', dueAt: '2026-09-01T23:59:00-07:00' }),
  mkItem({ id: 'part', courseId: 'chm', title: 'Participation', type: 'participation', dueAt: '2026-09-25T23:59:00-07:00' }),
  mkItem({ id: 'hw2', courseId: 'esg', title: 'Homework 2', points: 20, dueAt: '2026-09-21T08:00:00-07:00' }),
]);
const today = '2026-09-14';

describe('the all-classes audit prompt', () => {
  it('lists the classes in order, dates it, and dumps each class’s open items under its own heading', () => {
    const p = buildAuditPrompt(null, data, TZ, today, courses);
    expect(p.startsWith('Audit my GCU Halo account, one class at a time. Exhaustively.')).toBe(true);
    expect(p).toContain('CLASSES TO AUDIT, in this order:\n1. CHM-113 General Chemistry I-Lecture\n2. ESG-162 Engineering Math\n3. UNV-106 University Success\nFOR EACH CLASS');
    expect(p).toContain('MY PLANNER (as of Mon, Sep 14, 2026), open items by class:\nCHM-113 General Chemistry I-Lecture\nCHM-113 | Topic 3 Quiz | 2026-09-25 23:59 | 50 pts\n\nESG-162 Engineering Math\nESG-162 | Homework 2 | 2026-09-21 08:00 | 20 pts\n\nUNV-106 University Success\n(no open items in my planner for this class)\n');
    expect(p).toContain('=== CLASS: [class code] ===');
    expect(p).toContain('FINAL COVERAGE');
    expect(p).toContain('STOPPED — [class code] — [page name]');
    for (const slot of ['[CLASS LIST]', '[RESUME]', '[DATE]', '[PLANNER DUMP BY CLASS]']) expect(p).not.toContain(slot);
    expect(p).not.toContain('Old thing');
    expect(p).not.toContain('Participation');
    expect(DEFAULT_AUDIT_PROMPT.trimEnd().endsWith('[PLANNER DUMP BY CLASS]')).toBe(true);
    expect(p).toContain('Mission Statement, Doctrinal Statement, Library,\nStudent Success Center, Student AI Resources, Learning Support,\nClassroom Policies.');
    expect(p).toContain('every finding must be one\npipe-delimited row');
  });
  it('serves one class the same way, and a resume note only when picking up a stopped run', () => {
    const one = buildAuditPrompt(null, data, TZ, today, [esg]);
    expect(one).toContain('CLASSES TO AUDIT, in this order:\n1. ESG-162 Engineering Math\nFOR EACH CLASS');
    expect(one).not.toContain('CHM-113 |');
    expect(one).not.toContain('RESUMING');
    const rest = buildAuditPrompt(null, data, TZ, today, [esg, unv], { resumeFrom: 'ESG-162 — Topic 4' });
    expect(rest).toContain('1. ESG-162 Engineering Math\n2. UNV-106 University Success\nRESUMING: an earlier run stopped at ESG-162 — Topic 4. Start again from the first class above, from its Phase 1; anything printed for it before is discarded.\nFOR EACH CLASS');
  });
  it('still serves a custom template, appending the class list and the planner when the slots are missing', () => {
    expect(buildAuditPrompt('Custom words', data, TZ, today, [chm])).toBe('Custom words\n\nCLASSES TO AUDIT, in this order:\n1. CHM-113 General Chemistry I-Lecture\n\nMY PLANNER (as of Mon, Sep 14, 2026), open items by class:\nCHM-113 General Chemistry I-Lecture\nCHM-113 | Topic 3 Quiz | 2026-09-25 23:59 | 50 pts\n');
    expect(buildAuditPrompt('Head [CLASS] [DATE]\n[PLANNER DUMP]', data, TZ, today, [esg])).toBe('Head ESG-162 Engineering Math Mon, Sep 14, 2026\nESG-162 Engineering Math\nESG-162 | Homework 2 | 2026-09-21 08:00 | 20 pts\n');
    expect(plannerListing(data, TZ, today)).toBe('CHM-113 General Chemistry I-Lecture\nCHM-113 | Topic 3 Quiz | 2026-09-25 23:59 | 50 pts\n\nESG-162 Engineering Math\nESG-162 | Homework 2 | 2026-09-21 08:00 | 20 pts');
    expect(plannerByClass(data, TZ, today, [unv])).toBe('UNV-106 University Success\n(no open items in my planner for this class)');
  });
});

const run = [
  '=== CLASS: CHM-113 ===',
  'COVERAGE PLAN — CHM-113 — 4 pages',
  '- Topic 1',
  '- Topic 2',
  '- Gradebook',
  '- Announcements',
  'VISITED — Topic 1 — 3 items found',
  'CHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25',
  'VISITED — Topic 2 — 2 items found',
  'CHM-113 | Lab Safety Rubric | rubric | 2026-09-22 23:59 | found in Lab1_Rubric.pdf',
  'VISITED — Gradebook — 1 item found',
  'CHM-113 | Topic 1 Quiz | grade | | 14/20',
  'VISITED — Announcements — 0 items found',
  'COVERAGE — CHM-113 — visited 4 of 4 pages',
  '=== CLASS: ESG-162 ===',
  'COVERAGE PLAN — ESG-162 — 3 pages',
  'VISITED — Topic 1 — 2 items found',
  'VISITED — Gradebook — 0 items found',
  'Syllabus | page failed to load',
  'COVERAGE — ESG-162 — visited 2 of 3 pages',
  'Skipped: Syllabus — link returned 404',
  '=== CLASS: UNV-106 ===',
  'COVERAGE PLAN — UNV-106 — 5 pages',
  'VISITED — Topic 1 — 1 items found',
  'STOPPED — UNV-106 — Topic 2',
].join('\n');

describe('reading an all-classes audit', () => {
  it('keeps each class’s plan, visits, coverage, and skips apart, and knows where the run stopped', () => {
    const r = parseAuditResults(run, courses, today, courses);
    expect(r.order).toEqual(['chm', 'esg', 'unv']);
    expect(r.classes.chm.plan).toBe(4);
    expect(r.classes.chm.planPages).toEqual(['Topic 1', 'Topic 2', 'Gradebook', 'Announcements']);
    expect(r.classes.chm.visited.map((v) => [v.page, v.items])).toEqual([
      ['Topic 1', 3],
      ['Topic 2', 2],
      ['Gradebook', 1],
      ['Announcements', 0],
    ]);
    expect(r.classes.chm.coverage).toEqual({ visited: 4, planned: 4 });
    expect(r.classes.esg.coverage).toEqual({ visited: 2, planned: 3 });
    expect(r.classes.esg.skipped).toEqual(['Syllabus — link returned 404']);
    expect(r.classes.esg.failed).toEqual(['Syllabus | page failed to load']);
    expect(r.classes.unv.stoppedAt).toBe('Topic 2');
    expect(r.stopped).toEqual({ courseId: 'unv', page: 'Topic 2' });
    expect(r.mentions.map((m) => [m.kind, m.title, m.courseId, m.audit?.status])).toEqual([
      ['date_change', 'Topic 3 Quiz', 'chm', 'changed'],
      ['date_change', 'Lab Safety Rubric', 'chm', 'rubric'],
      ['grade', 'Topic 1 Quiz', 'chm', 'grade'],
      ['info', 'Syllabus | page failed to load', 'esg', 'note'],
    ]);
    const o = auditOutcomes(r, courses);
    expect(o.map((x) => [x.course.code, x.reached, x.findings, x.outcome?.clean, x.outcome?.partial])).toEqual([
      ['CHM-113', true, 3, false, false],
      ['ESG-162', true, 0, false, true],
      ['UNV-106', true, 0, false, true],
    ]);
    expect(o[1].outcome?.reason).toBe('Visited 2 of 3 pages.');
    expect(o[2].outcome?.reason).toBe('Stopped early at Topic 2.');
    expect(remainingCourses(r, courses).map((c) => c.code)).toEqual(['UNV-106']);
  });
  it('reads the FINAL COVERAGE block and ALL MATCH into one clean verdict per class', () => {
    const text = ['=== CLASS: CHM-113 ===', 'COVERAGE PLAN — CHM-113 — 2 pages', 'VISITED — Topic 1 — 0 items found', 'VISITED — Gradebook — 0 items found', 'COVERAGE — CHM-113 — visited 2 of 2 pages', '=== CLASS: ESG-162 ===', 'COVERAGE PLAN — ESG-162 — 1 pages', 'VISITED — Topic 1 — 0 items found', 'COVERAGE — ESG-162 — visited 1 of 1 pages', 'FINAL COVERAGE', 'CHM-113 — visited 2 of 2 pages — clean', 'ESG-162 — visited 1 of 1 pages — clean', 'ALL MATCH'].join('\n');
    const r = parseAuditResults(text, courses, today, [chm, esg]);
    expect(r.allMatch).toBe(true);
    expect(r.classes.chm.verdict).toBe('clean');
    expect(r.mentions).toEqual([]);
    const o = auditOutcomes(r, [chm, esg]);
    expect(o.map((x) => [x.course.code, x.outcome?.clean])).toEqual([
      ['CHM-113', true],
      ['ESG-162', true],
    ]);
    expect(remainingCourses(r, [chm, esg])).toEqual([]);
    const never = auditOutcomes(r, courses);
    expect(never[2]).toMatchObject({ reached: false, outcome: null });
    expect(remainingCourses(r, courses).map((c) => c.code)).toEqual(['UNV-106']);
  });
  it('lets the seven generic GCU pages be skipped without counting against coverage, and never names them', () => {
    const text = ['=== CLASS: CHM-113 ===', 'COVERAGE PLAN — CHM-113 — 16 pages', 'VISITED — Topic 1 — 2 items found', 'COVERAGE — CHM-113 — visited 9 of 16 pages', 'Skipped: Mission Statement — generic', 'Skipped: Doctrinal Statement — generic', 'Skipped: Library', 'Skipped: Student Success Center', 'Skipped: Student AI Resources', 'Skipped: Learning Support', 'Skipped: Classroom Policies', 'ALL MATCH'].join('\n');
    const r = parseAuditResults(text, courses, today, [chm]);
    const o = auditOutcomes(r, [chm])[0].outcome!;
    expect(o.clean).toBe(true);
    expect(o.partial).toBe(false);
    expect(o.skipped).toEqual([]);
    expect(o.reason).toBe('Every one of 9 planned pages visited.');
    const real = parseAuditResults(text.replace('Skipped: Library', 'Skipped: Announcements — would not load'), courses, today, [chm]);
    const ro = auditOutcomes(real, [chm])[0].outcome!;
    expect(ro.partial).toBe(true);
    expect(ro.skipped).toEqual(['Announcements — would not load']);
    expect(isGenericPage('Student AI Resources page')).toBe(true);
    expect(isGenericPage('Library — no dates')).toBe(true);
    expect(isGenericPage('Topic 3 Library assignment')).toBe(false);
  });
  it('reads a single-class run with no headers as that class', () => {
    const r = parseAuditResults('COVERAGE PLAN — 3 pages\nVISITED — Topic 1 — 0 items found\nVISITED — Gradebook — 1 items found\nVISITED — Syllabus — 0 items found\nCOVERAGE — visited 3 of 3 pages\nALL MATCH', courses, today, [chm]);
    expect(r.classes.chm.coverage).toEqual({ visited: 3, planned: 3 });
    expect(r.classes['']).toBeUndefined();
    expect(auditOutcomes(r, [chm])[0].outcome).toMatchObject({ clean: true, partial: false, reason: 'Every one of 3 planned pages visited.' });
    const bare = auditOutcomes(parseAuditResults('ALL MATCH', courses, today, [chm]), [chm]);
    expect(bare[0]).toMatchObject({ reached: false, outcome: null });
    expect(classifyClass({ courseId: 'chm', plan: 6, planPages: [], visited: [], coverage: { visited: 4, planned: 4 }, skipped: [], failed: [], stoppedAt: null, verdict: null, reached: true }, 0, true)).toMatchObject({ clean: false, partial: true, reason: 'Visited 4 of 4 pages (planned 6).' });
  });
  it('reads pipe rows only: section suffixes resolve, an unreadable class column defaults to the current section, prose is kept as notes', () => {
    const r = parseAuditResults('=== CLASS: CHM-113 ===\n?? | Mystery worksheet | new | 2026-10-01 23:59 | 10 pts\nOLD-SECTION ESG-162 | Homework 2 | changed | 2026-09-22 08:00 | old section\nthis line means nothing\nESG-162-101 | Exam 1 | same\nchem topic 3 quiz moved to sep 27\nESG-162 (Engineering Math) | Homework 3 | rubric | | in Lab3_handout.pdf', courses, today, courses);
    expect(r.source).toBe('pipes');
    expect(r.mentions.map((m) => [m.title, m.courseId, m.audit?.status, m.audit?.prefix])).toEqual([
      ['Mystery worksheet', 'chm', 'new', null],
      ['Homework 2', 'esg', 'changed', 'OLD-SECTION'],
      ['this line means nothing', 'chm', 'note', null],
      ['chem topic 3 quiz moved to sep 27', 'chm', 'note', null],
      ['Homework 3', 'esg', 'rubric', null],
    ]);
    expect(r.mentions[4].note).toBe('in Lab3_handout.pdf');
    expect(r.same).toBe(1);
    expect(r.unread).toEqual(['this line means nothing', 'chem topic 3 quiz moved to sep 27']);
  });
});
