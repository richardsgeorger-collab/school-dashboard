import { describe, expect, it } from 'vitest';
import { mkCourse } from './fixtures';
import { auditOutcomes, bulkImports } from './audit';
import { resolveCourse, courseKey } from './normalize';
import { buildReadPrompt, markLines, parseFromTool } from './read';

const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I-Lecture' });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const esgl = mkCourse({ id: 'esgl', code: 'ESG-162L', name: 'Engineering Math Lab' });
const courses = [chm, eng, esgl];

describe('class names with sections', () => {
  it('keys a code by its class part and resolves names and sections to the planner class', () => {
    expect(courseKey('ENG-105-ONL4')).toBe('ENG105');
    expect(courseKey('ENG 105 (TR101)')).toBe('ENG105');
    expect(courseKey('ESG-162L-102')).toBe('ESG162L');
    expect(resolveCourse('ENG-105-ONL4', courses)?.id).toBe('eng');
    expect(resolveCourse('esg-162l', courses)?.id).toBe('esgl');
    expect(resolveCourse('English Composition I', courses)?.id).toBe('eng');
    expect(resolveCourse('MAT-261', courses)).toBeNull();
    expect(resolveCourse('CHM-113L', courses)).toBeNull();
  });
});

const toolOut = {
  classes: [
    { code: 'CHM-113', planned_pages: 11, visited_pages: 11, coverage_visited: 11, coverage_planned: 11, skipped: [], stopped_at: null, notes: '' },
    { code: 'ENG-105-ONL4', planned_pages: 9, visited_pages: 8, coverage_visited: 8, coverage_planned: 9, skipped: ['Course materials — link timed out', 'Mission Statement', 'Classroom Policies'], stopped_at: null, notes: '' },
    { code: 'ESG-162L', planned_pages: 6, visited_pages: 2, coverage_visited: null, coverage_planned: null, skipped: [], stopped_at: 'Topic 3', notes: 'ran out of room' },
  ],
  findings: [
    { class_code: 'CHM-113', title: 'CHM113 Prerequisite Concept Assignment', status: 'grade', due: null, points: 20, score: 19.66, note: '19.66/20', confidence: 'high', quote: 'CHM-113 | CHM113 Prerequisite Concept Assignment | grade | | 19.66/20', gates: [] },
    { class_code: 'CHM-113', title: 'Claim your Chemistry Connections topic', status: 'announce', due: '2026-09-20 23:59', points: 0, score: null, note: 'announcement; gates the presentation and essay', confidence: 'medium', quote: 'The Sept 12 announcement says topics must be claimed by 9/20 before the 9/27 presentation and 10/9 essay.', gates: ['Chemistry Connections Presentation', 'Chemistry Connections Essay'] },
    { class_code: 'ENG 105', title: 'Topic 1 DQ 1', status: 'new', due: '2026-09-17 23:59', points: 5, score: null, note: '', confidence: 'high', quote: 'ENG-105-ONL4 | Topic 1 DQ 1 | new | 2026-09-17 23:59 | 5 pts', gates: [] },
    { class_code: 'ESG-162L', title: 'Lab 1 Report', status: 'overdue', due: null, points: null, score: null, note: 'Halo shows Late despite submission', confidence: 'high', quote: 'ESG-162L | Lab 1 Report | overdue | | Halo shows Late despite submission', gates: [] },
    { class_code: 'MAT-261', title: 'Not my class', status: 'new', due: '2026-10-01 23:59', points: 10, score: null, note: '', confidence: 'low', quote: 'MAT-261 | Not my class | new | 2026-10-01 23:59', gates: [] },
    { class_code: 'CHM-113', title: '', status: 'new', due: null, points: null, score: null, note: '', confidence: 'high', quote: '', gates: [] },
    { class_code: 'ESG-162L', title: '', status: 'overdue', due: null, points: null, score: null, note: '', confidence: 'low', quote: 'ESG-162L | | overdue | | Halo shows Late on something in Topic 2', gates: [] },
  ],
  all_match: false,
  stopped: { class_code: 'ESG-162L', page: 'Topic 3' },
  unread: ['Something about a lab handout with a date I could not place'],
};

describe('the model’s reading, shaped into a parse', () => {
  const p = parseFromTool(toolOut, courses, courses);
  it('maps sections and names to planner classes, keeps coverage per class, and knows where it stopped', () => {
    expect(p.source).toBe('claude');
    expect(p.order).toEqual(['chm', 'eng', 'esgl']);
    expect(p.classes.chm.coverage).toEqual({ visited: 11, planned: 11 });
    expect(p.classes.eng.coverage).toEqual({ visited: 8, planned: 9 });
    expect(p.classes.eng.skipped).toEqual(['Course materials — link timed out', 'Mission Statement', 'Classroom Policies']);
    expect(p.classes.esgl.coverage).toBeNull();
    expect(p.classes.esgl.stoppedAt).toBe('Topic 3');
    expect(p.stopped).toEqual({ courseId: 'esgl', page: 'Topic 3' });
    expect(p.allMatch).toBe(false);
  });
  it('keeps every finding with its status, score, note, gates, and quote; drops an empty one; leaves unknown classes unmatched', () => {
    expect(p.mentions.filter((m) => m.audit?.status !== 'note').map((m) => [m.courseId, m.title, m.audit?.status, m.kind, m.date, m.time, m.points, m.score, m.confidence])).toEqual([
      ['chm', 'CHM113 Prerequisite Concept Assignment', 'grade', 'grade', null, null, 20, 19.66, 'high'],
      ['chm', 'Claim your Chemistry Connections topic', 'announce', 'date_change', '2026-09-20', '23:59', 0, null, 'medium'],
      ['eng', 'Topic 1 DQ 1', 'new', 'new', '2026-09-17', '23:59', 5, null, 'high'],
      ['esgl', 'Lab 1 Report', 'overdue', 'info', null, null, null, null, 'high'],
      [null, 'Not my class', 'new', 'new', '2026-10-01', '23:59', 10, null, 'low'],
      ['esgl', 'ESG-162L | | overdue | | Halo shows Late on something in Topic 2', 'overdue', 'info', null, null, null, null, 'low'],
    ]);
    expect(p.mentions[1].gates).toEqual(['Chemistry Connections Presentation', 'Chemistry Connections Essay']);
    expect(p.mentions[1].note).toBe('announcement; gates the presentation and essay');
    expect(p.unread).toEqual(['Something about a lab handout with a date I could not place']);
    expect(p.mentions.at(-1)).toMatchObject({ audit: { status: 'note' }, quote: 'Something about a lab handout with a date I could not place' });
  });
  it('gives one verdict per class: full, short, stopped', () => {
    const o = auditOutcomes(p, courses);
    expect(o.map((x) => [x.course.code, x.reached, x.findings, x.outcome?.partial, x.outcome?.reason])).toEqual([
      ['CHM-113', true, 2, false, 'All 11 pages visited.'],
      ['ENG-105', true, 1, true, 'All 8 pages counted, but 1 named as skipped or failed.'],
      ['ESG-162L', true, 2, true, 'Stopped early at Topic 3.'],
    ]);
  });
  it('handles an empty or malformed answer without inventing anything', () => {
    const empty = parseFromTool({}, courses, courses);
    expect(empty.mentions).toEqual([]);
    expect(empty.order).toEqual([]);
    expect(auditOutcomes(empty, courses).every((o) => !o.reached)).toBe(true);
    const junk = parseFromTool({ classes: 'nope', findings: [null, 5, { title: 'x', status: 'weird', class_code: 'CHM-113' }] }, courses, courses);
    expect(junk.mentions.map((m) => [m.title, m.audit?.status])).toEqual([['x', 'note']]);
  });
});

describe('whole-class imports', () => {
  it('treats many new items for a class the planner is empty on as one import, not many problems', () => {
    const findings = Array.from({ length: 28 }, (_, i) => ({ class_code: 'ENG-105-ONL4', title: `Topic ${Math.floor(i / 4) + 1} item ${i + 1}`, status: 'new', due: `2026-10-${String((i % 28) + 1).padStart(2, '0')} 23:59`, points: 10, score: null, note: '', confidence: 'high', quote: `row ${i}`, gates: [] }));
    const p = parseFromTool({ classes: [], findings: [...findings, { class_code: 'CHM-113', title: 'Quiz 2', status: 'new', due: '2026-10-02 23:59', points: 10, score: null, note: '', confidence: 'high', quote: 'q', gates: [] }], all_match: false, stopped: null, unread: [] }, courses, courses);
    const b = bulkImports(p, courses, (id) => (id === 'eng' ? 0 : 12));
    expect(b.map((x) => [x.course.code, x.ids.length])).toEqual([['ENG-105', 28]]);
    expect(bulkImports(p, courses, () => 30)).toEqual([]);
  });
});

describe('the reading prompt and the recognized-lines view', () => {
  it('hands the model the class codes, the planner, and the paste verbatim', () => {
    const r = buildReadPrompt({ text: 'raw paste', courses, planner: 'CHM-113 · Chem Quiz 1 · Topic 1 Quiz · due 2026-09-20 · 20 pts', today: '2026-09-14' });
    expect(r.user).toContain('Planner classes (use these codes):\nCHM-113 — General Chemistry I-Lecture\nENG-105 — English Composition I\nESG-162L — Engineering Math Lab');
    expect(r.user).toContain('Audit output, verbatim:\nraw paste');
    expect(r.system).toContain('"ENG-105-ONL4", "ENG 105", and "English Composition" are all ENG-105');
  });
  it('labels each pasted line as finding, coverage, header, noise, or not recognized', () => {
    const text = ['=== CLASS: CHM-113 ===', 'Used Claude in Chrome (41 actions)', "Let me start with Topic 1.", 'Coverage plan: 11 pages', '- Topic 1', '- Gradebook', 'Now checking the gradebook.', 'CHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25', 'COVERAGE — CHM-113 — visited 11 of 11 pages', 'The Sept 12 announcement says topics must be claimed by 9/20 before the 9/27 presentation and 10/9 essay.', 'Nothing new on this page.', 'The lab handout mentions a 10/3 checkpoint I could not place.', 'a line nobody understood', '---', ''];
    const p = parseFromTool({ classes: [], findings: [{ class_code: 'CHM-113', title: 'Claim topic', status: 'announce', due: '2026-09-20 23:59', points: null, score: null, note: '', confidence: 'medium', quote: 'The Sept 12 announcement says topics must be claimed by 9/20 before the 9/27 presentation and 10/9 essay.', gates: [] }], all_match: false, stopped: null, unread: [] }, courses, courses);
    expect(markLines(text.join('\n'), p).map((l) => l.kind)).toEqual(['header', 'noise', 'noise', 'coverage', 'coverage', 'coverage', 'noise', 'finding', 'coverage', 'finding', 'noise', 'unknown', 'prose', 'noise', 'noise']);
  });
});
