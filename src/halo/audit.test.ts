import { describe, expect, it } from 'vitest';
import { mkCourse, mkData, mkItem, TZ } from './fixtures';
import { buildAuditPrompt, DEFAULT_AUDIT_PROMPT, parseAuditResults, plannerListing } from './audit';

const courses = [mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I-Lecture' }), mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math' })];
const data = mkData(courses, [
  mkItem({ id: 'q3', courseId: 'chm', title: 'Topic 3 Quiz', points: 50, dueAt: '2026-09-25T23:59:00-07:00' }),
  mkItem({ id: 'old', courseId: 'chm', title: 'Old thing', dueAt: '2026-09-01T23:59:00-07:00' }),
  mkItem({ id: 'part', courseId: 'chm', title: 'Participation', type: 'participation', dueAt: '2026-09-25T23:59:00-07:00' }),
  mkItem({ id: 'hw2', courseId: 'esg', title: 'Homework 2', points: 20, dueAt: '2026-09-21T08:00:00-07:00' }),
]);
const today = '2026-09-14';

describe('check Halo prompt', () => {
  it('appends the open, non-participation, not-yet-due items by class in 24-hour Phoenix time', () => {
    const listing = plannerListing(data, TZ, today);
    expect(listing).toBe('CHM-113 General Chemistry I-Lecture\nCHM-113 | Topic 3 Quiz | 2026-09-25 23:59 | 50 pts\n\nESG-162 Engineering Math\nESG-162 | Homework 2 | 2026-09-21 08:00 | 20 pts');
    const p = buildAuditPrompt(null, data, TZ, today);
    expect(p.startsWith('You are looking at my GCU Halo account in this browser.')).toBe(true);
    expect(p).toContain('MY PLANNER (as of Mon, Sep 14, 2026, open items only):\n' + listing);
    expect(p).not.toContain('[DATE]');
    expect(p).not.toContain('[PLANNER DUMP]');
    expect(DEFAULT_AUDIT_PROMPT).toContain('Prefix its lines with \n  ENG105-PENDING');
    expect(DEFAULT_AUDIT_PROMPT.trimEnd().endsWith('[PLANNER DUMP]')).toBe(true);
    expect(buildAuditPrompt('  ', data, TZ, today)).toBe(p);
    expect(buildAuditPrompt('Custom words', data, TZ, today).startsWith('Custom words\n\nMY PLANNER')).toBe(true);
    expect(buildAuditPrompt('Head [DATE] tail\n[PLANNER DUMP]', data, TZ, today)).toBe('Head Mon, Sep 14, 2026 tail\n' + listing + '\n');
  });
});

describe('reading what Claude found', () => {
  it('reads pipe lines exactly, counts matches, and keeps unreadable lines', () => {
    const text = [
      'CLASS | TITLE | STATUS | DUE | NOTE',
      'CHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25',
      'CHM113 | Lab Safety Contract | new | 2026-09-20 23:59 | 10 pts',
      'ESG-162 | Homework 2 | missing | | not in Halo',
      'ESG-162 | Exam 1 | same',
      '- CHM-113 | Something | weird | 2026-10-01',
      'noise line with no structure',
    ].join('\n');
    const r = parseAuditResults(text, courses, today);
    expect(r.allMatch).toBe(false);
    expect(r.same).toBe(1);
    expect(r.unread).toEqual(['CHM-113 | Something | weird | 2026-10-01', 'noise line with no structure']);
    expect(r.mentions.map((m) => [m.kind, m.title, m.courseId, m.date, m.time, m.points, m.audit?.status])).toEqual([
      ['date_change', 'Topic 3 Quiz', 'chm', '2026-09-27', '23:59', null, 'changed'],
      ['new', 'Lab Safety Contract', 'chm', '2026-09-20', '23:59', 10, 'new'],
      ['cancel', 'Homework 2', 'esg', null, null, null, 'missing'],
      ['info', 'CHM-113 | Something | weird | 2026-10-01', null, null, null, null, 'note'],
      ['info', 'noise line with no structure', null, null, null, null, 'note'],
    ]);
    expect(r.mentions[0].quote).toContain('was 2026-09-25');
  });
  it('accepts loose sentences through the capture parser and recognizes ALL MATCH', () => {
    const r = parseAuditResults('chem topic 3 quiz moved to sep 27\nALL MATCH', courses, today);
    expect(r.allMatch).toBe(true);
    expect(r.mentions.length).toBe(1);
    expect(r.mentions[0]).toMatchObject({ kind: 'date_change', courseId: 'chm', date: '2026-09-27' });
    expect(parseAuditResults('ALL MATCH', courses, today)).toMatchObject({ allMatch: true, mentions: [], unread: [], reported: null });
  });
  it('reads every status, both prefixes, a score fraction, and the closing count', () => {
    const text = [
      'CHM-113 | Topic 1 Quiz | grade | | 14/20',
      'CHM-113 | ALEKS Objective 2 | overdue | 2026-09-12 23:59 | Halo shows late',
      'ESG-162 | Homework 2 | announce | 2026-09-23 08:00 | announcement moved it from 09-21',
      'ESG-162 | class schedule | schedule | | Halo says T/Th 7:00, planner says M/W',
      'ENG105-PENDING | ENG-105 | Essay 1 Draft | new | 2026-09-20 23:59 | 50 pts',
      'OLD-SECTION ESG-162 | Homework 2 | changed | 2026-09-22 08:00 | old section',
      'CHM-113L | page failed to load',
      'END OF FINDINGS — 7 items',
    ].join('\n');
    const r = parseAuditResults(text, courses, today);
    expect(r.allMatch).toBe(false);
    expect(r.reported).toBe(7);
    expect(r.mentions.map((m) => [m.kind, m.title, m.courseId, m.score, m.points, m.audit?.status, m.audit?.prefix])).toEqual([
      ['grade', 'Topic 1 Quiz', 'chm', 14, 20, 'grade', null],
      ['info', 'ALEKS Objective 2', 'chm', null, null, 'overdue', null],
      ['date_change', 'Homework 2', 'esg', null, null, 'announce', null],
      ['info', 'class schedule', 'esg', null, null, 'schedule', null],
      ['new', 'Essay 1 Draft', null, null, 50, 'new', 'ENG105-PENDING'],
      ['date_change', 'Homework 2', 'esg', null, null, 'changed', 'OLD-SECTION'],
      ['info', 'CHM-113L | page failed to load', null, null, null, 'note', null],
    ]);
    expect(r.mentions[2].date).toBe('2026-09-23');
    expect(r.mentions[2].time).toBe('08:00');
    expect(r.unread).toEqual(['CHM-113L | page failed to load']);
  });
});
