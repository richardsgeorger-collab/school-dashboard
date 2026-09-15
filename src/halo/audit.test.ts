import { describe, expect, it } from 'vitest';
import { mkCourse, mkData, mkItem, TZ } from './fixtures';
import { buildAuditPrompt, classifyCheck, DEFAULT_AUDIT_PROMPT, parseAuditResults, plannerListing } from './audit';

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

describe('one-class audit prompt', () => {
  it('fills the class, the date, and only that class’s open items into the verbatim template', () => {
    const p = buildAuditPrompt(null, data, TZ, today, chm);
    expect(p.startsWith('Audit ONE class in my GCU Halo account. Exhaustively.')).toBe(true);
    expect(p).toContain('CLASS TO AUDIT: CHM-113 General Chemistry I-Lecture');
    expect(p).toContain('MY PLANNER for that class (as of Mon, Sep 14, 2026):\nCHM-113 | Topic 3 Quiz | 2026-09-25 23:59 | 50 pts\n');
    expect(p).not.toContain('ESG-162 |');
    expect(p).not.toContain('Old thing');
    expect(p).not.toContain('Participation');
    for (const slot of ['[CLASS]', '[DATE]', '[PLANNER DUMP FOR THAT CLASS]']) expect(p).not.toContain(slot);
    expect(DEFAULT_AUDIT_PROMPT).toContain('rubric   — a date or requirement found inside an attached file');
    expect(DEFAULT_AUDIT_PROMPT.trimEnd().endsWith('[PLANNER DUMP FOR THAT CLASS]')).toBe(true);
    expect(buildAuditPrompt(null, data, TZ, today, unv)).toContain('MY PLANNER for that class (as of Mon, Sep 14, 2026):\n(no open items in my planner for this class)');
  });
  it('still serves a custom template, appending the class and its items when the slots are missing', () => {
    expect(buildAuditPrompt('Custom words', data, TZ, today, chm)).toBe('Custom words\n\nCLASS TO AUDIT: CHM-113 General Chemistry I-Lecture\n\nMY PLANNER for that class (as of Mon, Sep 14, 2026):\nCHM-113 | Topic 3 Quiz | 2026-09-25 23:59 | 50 pts\n');
    expect(buildAuditPrompt('Head [CLASS] [DATE]\n[PLANNER DUMP]', data, TZ, today, esg)).toBe('Head ESG-162 Engineering Math Mon, Sep 14, 2026\nESG-162 | Homework 2 | 2026-09-21 08:00 | 20 pts\n');
    expect(plannerListing(data, TZ, today)).toBe('CHM-113 General Chemistry I-Lecture\nCHM-113 | Topic 3 Quiz | 2026-09-25 23:59 | 50 pts\n\nESG-162 Engineering Math\nESG-162 | Homework 2 | 2026-09-21 08:00 | 20 pts');
  });
});

const transcript = [
  'COVERAGE PLAN — 5 pages',
  '- Topic 1',
  '- Topic 2',
  '- Gradebook',
  '- Announcements',
  '- Syllabus',
  'VISITED — Topic 1 — 3 items found',
  'VISITED — Topic 2 — 2 items found',
  'CHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25',
  'CHM-113 | Lab Safety Rubric | rubric | 2026-09-22 23:59 | found in Lab1_Rubric.pdf',
  'CHM-113 | Reading check | rubric | | required per instruction sheet',
  'VISITED — Gradebook — 1 item found',
  'CHM-113 | Topic 1 Quiz | grade | | 14/20',
  'VISITED — Announcements — 0 items found',
  'Syllabus | page failed to load',
  'COVERAGE — visited 4 of 5 pages',
  'Skipped: Syllabus — link returned 404',
  'END OF FINDINGS — 4 items',
].join('\n');

describe('reading a one-class audit', () => {
  it('reads the plan, every VISITED line, findings including rubric, the coverage count, and the skipped pages', () => {
    const r = parseAuditResults(transcript, courses, today, chm);
    expect(r.plan).toBe(5);
    expect(r.planPages).toEqual(['Topic 1', 'Topic 2', 'Gradebook', 'Announcements', 'Syllabus']);
    expect(r.visited).toEqual([
      { page: 'Topic 1', items: 3 },
      { page: 'Topic 2', items: 2 },
      { page: 'Gradebook', items: 1 },
      { page: 'Announcements', items: 0 },
    ]);
    expect(r.mentions.map((m) => [m.kind, m.title, m.courseId, m.date, m.score, m.audit?.status])).toEqual([
      ['date_change', 'Topic 3 Quiz', 'chm', '2026-09-27', null, 'changed'],
      ['date_change', 'Lab Safety Rubric', 'chm', '2026-09-22', null, 'rubric'],
      ['info', 'Reading check', 'chm', null, null, 'rubric'],
      ['grade', 'Topic 1 Quiz', 'chm', null, 14, 'grade'],
      ['info', 'Syllabus | page failed to load', 'chm', null, null, 'note'],
    ]);
    expect(r.coverage).toEqual({ visited: 4, planned: 5 });
    expect(r.skipped).toEqual(['Syllabus — link returned 404']);
    expect(r.failed).toEqual(['Syllabus | page failed to load']);
    expect(r.reported).toBe(4);
    expect(r.allMatch).toBe(false);
    const o = classifyCheck(r);
    expect(o).toMatchObject({ clean: false, partial: true, findings: 4, coverage: { visited: 4, planned: 5 } });
    expect(o.skipped).toEqual(['Syllabus — link returned 404', 'Syllabus | page failed to load']);
    expect(o.reason).toBe('Visited 4 of 5 pages.');
  });
  it('records clean only with proof that every planned page was visited', () => {
    const clean = parseAuditResults('COVERAGE PLAN — 3 pages\nVISITED — Topic 1 — 0 items found\nVISITED — Gradebook — 1 items found\nVISITED — Syllabus — 0 items found\nCOVERAGE — visited 3 of 3 pages\nALL MATCH', courses, today, chm);
    expect(clean.allMatch).toBe(true);
    expect(classifyCheck(clean)).toMatchObject({ clean: true, partial: false, findings: 0, skipped: [], reason: 'Every one of 3 planned pages visited.' });
    const bare = classifyCheck(parseAuditResults('ALL MATCH', courses, today, chm));
    expect(bare).toMatchObject({ clean: false, partial: true, findings: 0, reason: 'No coverage count, so this cannot count as a full check.' });
    const fewer = classifyCheck(parseAuditResults('COVERAGE PLAN — 6 pages\nVISITED — Topic 1 — 0 items found\nCOVERAGE — visited 4 of 4 pages\nALL MATCH', courses, today, chm));
    expect(fewer).toMatchObject({ clean: false, partial: true, reason: 'Visited 4 of 4 pages (planned 6).' });
    const stopped = parseAuditResults('COVERAGE PLAN — 6 pages\nVISITED — Topic 1 — 2 items found\nI ran out of room. Stopped at Topic 4; resume there.', courses, today, chm);
    expect(stopped.stoppedAt).toContain('Stopped at Topic 4');
    expect(classifyCheck(stopped)).toMatchObject({ clean: false, partial: true, reason: 'Stopped early: I ran out of room. Stopped at Topic 4; resume there.' });
    expect(stopped.unread).toEqual(['I ran out of room. Stopped at Topic 4; resume there.']);
  });
  it('defaults an unreadable class column to the audited class, keeps loose lines, and still honors the old prefixes', () => {
    const r = parseAuditResults('?? | Mystery worksheet | new | 2026-10-01 23:59 | 10 pts\nOLD-SECTION ESG-162 | Homework 2 | changed | 2026-09-22 08:00 | old section\nthis line means nothing\nESG-162 | Exam 1 | same', courses, today, chm);
    expect(r.mentions.map((m) => [m.title, m.courseId, m.audit?.status, m.audit?.prefix])).toEqual([
      ['Mystery worksheet', 'chm', 'new', null],
      ['Homework 2', 'esg', 'changed', 'OLD-SECTION'],
      ['this line means nothing', 'chm', 'note', null],
    ]);
    expect(r.same).toBe(1);
    expect(r.unread).toEqual(['this line means nothing']);
  });
  it('accepts a loose sentence with a date through the capture parser', () => {
    const r = parseAuditResults('VISITED — Topic 3 — 1 items found\nchem topic 3 quiz moved to sep 27\nCOVERAGE — visited 1 of 1 pages\nEND OF FINDINGS — 1 items', courses, today, chm);
    expect(r.mentions.map((m) => [m.kind, m.courseId, m.date, m.audit?.status])).toEqual([['date_change', 'chm', '2026-09-27', 'changed']]);
    expect(classifyCheck(r)).toMatchObject({ clean: false, partial: false, findings: 1 });
  });
});
