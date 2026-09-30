import { describe, expect, it } from 'vitest';
import { mkAssessment, mkClass, mkCourse, NOW, TZ } from './fixtures';
import { assessmentIssue, findCourse, haloFlags, haloItemId, haloType, hasZone, isSubmitted, normCode, normTitle, oddDueTime, parseHaloDate, stripHtml, toCourse, toItem } from './normalize';

describe('parseHaloDate', () => {
  it('reads a zoned ISO instant into Phoenix wall time', () => {
    expect(parseHaloDate('2026-09-14T06:59:00.000Z', TZ)).toBe('2026-09-13T23:59:00-07:00');
    expect(parseHaloDate('2026-09-14T06:59:00+00:00', TZ)).toBe('2026-09-13T23:59:00-07:00');
  });
  it('reads a bare string as UTC by default and as local when asked', () => {
    expect(parseHaloDate('2026-09-14 06:59:00', TZ)).toBe('2026-09-13T23:59:00-07:00');
    expect(parseHaloDate('2026-09-14T06:59:00', TZ)).toBe('2026-09-13T23:59:00-07:00');
    expect(parseHaloDate('2026-09-14 06:59:00', TZ, 'local')).toBe('2026-09-14T06:59:00-07:00');
  });
  it('date-only means end of that day', () => {
    expect(parseHaloDate('2026-09-14', TZ)).toBe('2026-09-14T23:59:00-07:00');
  });
  it('rejects junk and blanks', () => {
    expect(parseHaloDate('', TZ)).toBeNull();
    expect(parseHaloDate(null, TZ)).toBeNull();
    expect(parseHaloDate('soon', TZ)).toBeNull();
  });
  it('knows which strings carry a zone', () => {
    expect(hasZone('2026-09-14T06:59:00Z')).toBe(true);
    expect(hasZone('2026-09-14 06:59:00')).toBe(false);
  });
});

describe('text helpers', () => {
  it('normalizes codes and titles', () => {
    expect(normCode('chm-113l')).toBe('CHM113L');
    expect(normTitle('Topic 1 DQ 1: &amp; Intro!')).toBe('topic 1 dq 1 intro');
  });
  it('strips HTML and decodes entities', () => {
    expect(stripHtml('<p>Read <b>chapter 2</b>.</p><p>Then&nbsp;answer &amp; submit.</p>')).toBe('Read chapter 2.\nThen answer & submit.');
    expect(stripHtml(null)).toBe('');
  });
});

describe('type and flags', () => {
  it('maps Halo types with title rules underneath', () => {
    expect(haloType(mkAssessment({ id: 'a', title: 'Topic 2 Quiz', type: 'QUIZ' }), 'CHM-113')).toBe('quiz');
    expect(haloType(mkAssessment({ id: 'a', title: 'Exam 1', type: 'QUIZ' }), 'CHM-113')).toBe('exam');
    expect(haloType(mkAssessment({ id: 'a', title: 'Topic 1 DQ 1', type: 'DISCUSSION_QUESTION' }), 'UNV-106')).toBe('discussion');
    expect(haloType(mkAssessment({ id: 'a', title: 'Class Participation', type: 'PARTICIPATION' }), 'ENG-105')).toBe('participation');
    expect(haloType(mkAssessment({ id: 'a', title: 'ALEKS Objective 3', type: 'LTI' }), 'CHM-113')).toBe('homework');
    expect(haloType(mkAssessment({ id: 'a', title: 'Formal Lab Report', type: 'ASSIGNMENT' }), 'CHM-113L')).toBe('paper');
  });
  it('turns tags into flags', () => {
    const f = haloFlags(mkAssessment({ id: 'a', title: 'Practice Quiz 1', tags: ['TIMED', 'IN_PERSON'], isGroupEnabled: true, requiresLopesWrite: true }));
    expect(f).toEqual({ inClass: true, group: true, lopesWrite: true, timed: true, practice: true });
  });
  it('knows what Halo counts as turned in', () => {
    expect(isSubmitted(mkAssessment({ id: 'a', title: 't', status: 'SUBMITTED' }))).toBe(true);
    expect(isSubmitted(mkAssessment({ id: 'a', title: 't', status: 'PUBLISHED' }))).toBe(true);
    expect(isSubmitted(mkAssessment({ id: 'a', title: 't', status: 'LATE', submittedAt: '2026-09-15T01:00:00Z' }))).toBe(true);
    expect(isSubmitted(mkAssessment({ id: 'a', title: 't', status: 'LATE' }))).toBe(false);
    expect(isSubmitted(mkAssessment({ id: 'a', title: 't', status: 'ACTIVE' }))).toBe(false);
  });
});

describe('toItem', () => {
  const course = mkCourse({ id: 'c1', code: 'CHM-113' });
  it('builds a Halo-sourced item with a stable id', () => {
    const a = mkAssessment({ id: 'h1', title: 'Topic 1 Quiz', type: 'QUIZ', points: 20, description: '<p>Covers ch. 1</p>', unit: 'Topic 1' });
    const item = toItem(a, course, { tz: TZ, now: NOW });
    expect(item.id).toBe(haloItemId('h1'));
    expect(item.haloId).toBe('h1');
    expect(item.source).toBe('halo');
    expect(item.type).toBe('quiz');
    expect(item.points).toBe(20);
    expect(item.dueAt).toBe('2026-09-13T23:59:00-07:00');
    expect(item.opensAt).toBe('2026-09-07T00:00:00-07:00');
    expect(item.notes).toBe('Covers ch. 1');
    expect(item.topic).toBe('Topic 1');
    expect(item.label).toMatch(/Quiz 1/);
    expect(item.estimatedMinutes).toBeGreaterThan(0);
  });
  it('reports why an assessment is skipped', () => {
    const opts = { tz: TZ, now: NOW };
    expect(assessmentIssue(mkAssessment({ id: 'a', title: 't', dueDate: null }), opts)).toBe('no due date');
    expect(assessmentIssue(mkAssessment({ id: 'a', title: 't', points: 0 }), opts)).toBe('worth 0 points');
    expect(assessmentIssue(mkAssessment({ id: 'a', title: 't', points: 0 }), { ...opts, includeZeroPoint: true })).toBeNull();
    expect(assessmentIssue(mkAssessment({ id: 'a', title: '  ' }), opts)).toBe('no title');
    expect(assessmentIssue(mkAssessment({ id: 'a', title: 't' }), opts)).toBeNull();
  });
});

describe('courses', () => {
  const courses = [mkCourse({ id: 'c1', code: 'CHM-113' }), mkCourse({ id: 'c2', code: 'CHM-113L' }), mkCourse({ id: 'c3', code: 'UNV-106', haloClassId: 'halo-unv' })];
  it('matches by link, then code, then the class code with its section dropped; a lab is never its lecture', () => {
    expect(findCourse(courses, mkClass({ id: 'halo-unv', courseCode: 'XXX-999' }))?.id).toBe('c3');
    expect(findCourse(courses, mkClass({ id: 'x', courseCode: 'chm 113l' }))?.id).toBe('c2');
    expect(findCourse(courses, mkClass({ id: 'x', courseCode: '', classCode: 'CHM-113L-O500' }))?.id).toBe('c2');
    expect(findCourse(courses, mkClass({ id: 'x', courseCode: '', classCode: 'CHM-113-O500' }))?.id).toBe('c1');
    expect(findCourse(courses, mkClass({ id: 'x', courseCode: 'MAT-261' }))).toBeUndefined();
    // The bug of 2026-09-30: with only the lecture in the planner, the lab matched it by prefix and was merged in.
    const lectureOnly = [mkCourse({ id: 'c1', code: 'CHM-113' })];
    expect(findCourse(lectureOnly, mkClass({ id: 'lab', courseCode: 'CHM-113L', classCode: 'CHM-113L-M600A' }))).toBeUndefined();
    expect(findCourse(lectureOnly, mkClass({ id: 'lab', courseCode: '', classCode: 'CHM-113L-M600A' }))).toBeUndefined();
    expect(findCourse([mkCourse({ id: 'e', code: 'ENG-105-ONL4' })], mkClass({ id: 'x', courseCode: 'ENG-105', classCode: 'ENG-105-ONL4' }))?.id).toBe('e');
  });
  it('a link to a lab merged into its lecture gives way when the lecture itself is in the export', () => {
    const merged = [mkCourse({ id: 'c1', code: 'CHM-113', haloClassId: 'lab' })];
    const lecture = mkClass({ id: 'lec', courseCode: 'CHM-113', classCode: 'CHM-113-WF700A' });
    const lab = mkClass({ id: 'lab', courseCode: 'CHM-113L', classCode: 'CHM-113L-M600A' });
    expect(findCourse(merged, lab, [lecture, lab])).toBeUndefined();
    expect(findCourse(merged, lecture, [lecture, lab])?.id).toBe('c1');
    // Without the lecture in the export the link still holds (a student who renamed the class's code).
    expect(findCourse(merged, lab, [lab])?.id).toBe('c1');
  });
  it('links an existing course without touching its setup', () => {
    const c = toCourse(mkClass({ id: 'h', courseCode: 'CHM-113', name: 'Renamed' }), courses[0], { tz: TZ, now: NOW, index: 0 });
    expect(c.haloClassId).toBe('h');
    expect(c.haloSlugId).toBe('slug-h');
    expect(c.name).toBe('CHM-113');
    expect(c.id).toBe('c1');
  });
  it('instructor names survive an export that sends objects or junk instead of strings; nothing crashes', () => {
    const c = toCourse(mkClass({ id: 'h', courseCode: 'PHY-111', name: 'Physics', instructors: [{ name: 'Dr. Lee' }, null, 7, '  Dr. Kim '] as never }), undefined, { tz: TZ, now: NOW, index: 0 });
    expect(c.instructors.map((i) => i.name)).toEqual(['Dr. Lee', 'Dr. Kim']);
  });
  it('creates a new course from Halo with its own section\'s times, never a table of someone else\'s', () => {
    const c = toCourse(mkClass({ id: 'h', courseCode: 'ESG-162', classCode: 'ESG-162-MW100A', name: 'Intro to Engineering', modality: 'ONGROUND' }), undefined, { tz: TZ, now: NOW, index: 0 });
    expect(c.code).toBe('ESG-162');
    expect(c.name).toBe('Intro to Engineering');
    expect(c.termStart).toBe('2026-09-08');
    expect(c.termEnd).toBe('2026-12-20');
    expect(c.meetings).toEqual([{ day: 1, start: '13:00', end: '14:15' }, { day: 3, start: '13:00', end: '14:15' }]);
    expect(c.meetingsFrom).toBe('section');
    expect(c.online).toBe(false);
    // Online by modality (ESG-162 used to be given Tuesday and Thursday at 7 whatever Halo said).
    const online = toCourse(mkClass({ id: 'h2', courseCode: 'ESG-162', classCode: 'ESG-162-ONL2', modality: 'ONLINE' }), undefined, { tz: TZ, now: NOW, index: 1 });
    expect(online.online).toBe(true);
    expect(online.meetings).toEqual([]);
    const unknown = toCourse(mkClass({ id: 'h3', courseCode: 'MAT-261', modality: 'ONGROUND' }), undefined, { tz: TZ, now: NOW, index: 1 });
    expect(unknown.online).toBe(false);
    expect(unknown.meetings).toEqual([]);
  });
});

describe('time zones, defensively', () => {
  const july = '2026-07-14T06:59:00Z';
  it('uses real zone rules, not a fixed offset: Phoenix has no DST, Denver does', () => {
    expect(parseHaloDate(july, 'America/Phoenix')).toBe('2026-07-13T23:59:00-07:00');
    expect(parseHaloDate(july, 'America/Denver')).toBe('2026-07-14T00:59:00-06:00');
    expect(parseHaloDate('2026-11-15T06:59:00Z', 'America/Denver')).toBe('2026-11-14T23:59:00-07:00');
    expect(parseHaloDate('2026-11-15T06:59:00Z', 'America/Phoenix')).toBe('2026-11-14T23:59:00-07:00');
  });
  it('reads the same bare string both ways and the wrong way shows its fingerprint', () => {
    const asUtc = parseHaloDate('2026-07-14 06:59:00', TZ, 'utc')!;
    const asLocal = parseHaloDate('2026-07-14 06:59:00', TZ, 'local')!;
    expect(asUtc).toBe('2026-07-13T23:59:00-07:00');
    expect(asLocal).toBe('2026-07-14T06:59:00-07:00');
    expect(oddDueTime(asUtc, TZ)).toBeNull();
    expect(oddDueTime(asLocal, TZ)).toBe('6:59 AM');
    const localString = '2026-09-14 23:59:00';
    expect(oddDueTime(parseHaloDate(localString, TZ, 'utc')!, TZ)).toBe('4:59 PM');
    expect(oddDueTime(parseHaloDate(localString, TZ, 'local')!, TZ)).toBeNull();
  });
  it('leaves normal times alone', () => {
    expect(oddDueTime('2026-09-14T07:00:00-07:00', TZ)).toBeNull();
    expect(oddDueTime('2026-09-14T12:30:00-07:00', TZ)).toBeNull();
    expect(oddDueTime('2026-09-14T23:59:00-07:00', TZ)).toBeNull();
  });
});

describe('Halo’s own class grade on the course', () => {
  it('keeps the letter and the points, and computes the percent the way Halo does', async () => {
    const { haloGradeFrom } = await import('./normalize');
    expect(haloGradeFrom({ letter: 'B-', points: 81.3, maxPoints: 100, published: false }, 'now')).toEqual({ letter: 'B-', points: 81.3, maxPoints: 100, percent: 81.3, at: 'now' });
    expect(haloGradeFrom({ letter: ' A ', points: 0, maxPoints: 0, published: false }, 'now')).toEqual({ letter: 'A', points: 0, maxPoints: 0, percent: null, at: 'now' });
    // Nothing graded in Halo yet: no grade, rather than a 0%.
    expect(haloGradeFrom({ letter: null, points: null, maxPoints: null, published: false }, 'now')).toBeNull();
    expect(haloGradeFrom(null, 'now')).toBeNull();
  });
});
