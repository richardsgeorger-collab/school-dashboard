import { describe, expect, it } from 'vitest';
import { mkClass, mkCourse, mkExport, mkItem, TZ } from './fixtures';
import { problemLine, pullsFrom, staleBookmarkLine, staleness } from './freshness';
import { haloSaysIn, haloSaysNotIn, postedIn } from '../domain/confirm';
import { letterFor } from '../domain/grades';
import { quizShare, topicScores } from '../domain/concepts';
import { toCourse } from './normalize';
import type { HaloClass } from './types';

const scale = [
  { label: 'A', minPercent: 90, maxPercent: 100 },
  { label: 'B', minPercent: 80, maxPercent: 89.99 },
  { label: 'C', minPercent: 70, maxPercent: 79.99 },
];

describe('what the wider pull adds', () => {
  it('reads the class letter off Halo’s own scale, and says nothing without one', () => {
    expect(letterFor(94, scale)).toBe('A');
    expect(letterFor(80, scale)).toBe('B');
    expect(letterFor(79.99, scale)).toBe('C');
    expect(letterFor(65, scale)).toBeNull();
    expect(letterFor(94, undefined)).toBeNull();
    expect(letterFor(null, scale)).toBeNull();
  });
  it('treats the student’s own discussion post as proof it went in, whatever the gradebook says', () => {
    const notIn = mkItem({ id: 'd', courseId: 'c', title: 'Topic 3 DQ 1', type: 'discussion', halo: { status: 'ACTIVE', submittedAt: null, checkedAt: 'now' } });
    expect(haloSaysNotIn(notIn)).toBe(true);
    expect(haloSaysIn(notIn)).toBe(false);
    const posted = { ...notIn, feedback: { comment: null, gradedAt: null, criteria: [], files: [], post: { publishedAt: '2026-09-16T18:00:00.000Z', words: 180 }, at: 'now' } };
    expect(postedIn(posted)).toBe(true);
    expect(haloSaysIn(posted)).toBe(true);
    expect(haloSaysNotIn(posted)).toBe(false);
  });
  it('lets a quiz attempt score its topics when no grade has been posted', () => {
    const quiz = mkItem({ id: 'q', courseId: 'c', title: 'Topic 4 Quiz', topic: 'limiting reagent', points: 20, score: null, quiz: { userQuizId: 'u', finalScore: 14, answered: 10, correct: 7, incorrect: 3, submittedAt: null, questions: [], at: 'now' } });
    expect(quizShare(quiz)).toBeCloseTo(0.7);
    expect(topicScores('c', [quiz], undefined)).toEqual([{ topic: 'limiting reagent', key: 'limiting reagent', earned: 70, possible: 100, pct: 70, graded: 1, misses: 0, attempts: 0 }]);
    // A posted score always wins over the attempt's own totals.
    const graded = { ...quiz, score: 18 };
    expect(topicScores('c', [graded], undefined)[0].pct).toBe(90);
    expect(quizShare(mkItem({ id: 'x', courseId: 'c', title: 'x' }))).toBeNull();
  });
  it('keeps class facts when a later run could not fetch them, rather than wiping them', () => {
    const cls = (o: Partial<HaloClass> = {}): HaloClass => ({ id: 'h1', slugId: 's', classCode: 'CHM-113-101', courseCode: 'CHM-113', name: 'Chem', startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 4, assessments: [], ...o });
    const opts = { tz: TZ, now: '2026-09-17T12:00:00.000Z', index: 0 };
    const first = toCourse(cls({ gradeScale: scale, participation: { description: 'Post three days', days: 3, posts: 1 } }), undefined, opts);
    expect(first.gradeScale).toEqual(scale);
    expect(first.participation?.days).toBe(3);
    // The CurrentClass call failed this time: what is known survives.
    const again = toCourse(cls(), first, opts);
    expect(again.gradeScale).toEqual(scale);
    expect(again.participation?.days).toBe(3);
    // And a fresh scale replaces the old one.
    const changed = toCourse(cls({ gradeScale: [{ label: 'P', minPercent: 70, maxPercent: 100 }] }), again, opts);
    expect(changed.gradeScale).toEqual([{ label: 'P', minPercent: 70, maxPercent: 100 }]);
  });
  it('the existing course keeps everything else it had', () => {
    const existing = mkCourse({ id: 'c1', code: 'CHM-113', color: '#abc', credits: 4 });
    const out = toCourse({ id: 'h1', slugId: 's', classCode: 'CHM-113-101', courseCode: 'CHM-113', name: 'Chem', startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 4, assessments: [], holidays: [{ title: 'Fall break', description: null, startDate: '2026-10-12', duration: 2 }] }, existing, { tz: TZ, now: 'now', index: 0 });
    expect(out.color).toBe('#abc');
    expect(out.holidays?.[0].title).toBe('Fall break');
  });
});

describe('a half-working sync says so', () => {
  it('names what Halo would not give up, grouped by kind', () => {
    expect(problemLine({ problems: [] })).toBeNull();
    expect(problemLine({})).toBeNull();
    expect(problemLine({ problems: [{ klass: 'ENG-105', kind: 'announcements', message: 'boom' }] })).toBe(
      'Halo would not give up announcements for ENG-105. Everything else came through, and this is still missing rather than empty.',
    );
    expect(
      problemLine({
        problems: [
          { klass: 'ENG-105', kind: 'announcements', message: 'boom' },
          { klass: 'CHM-113', kind: 'announcements', message: 'boom' },
          { klass: null, kind: 'inbox', message: 'boom' },
        ],
      }),
    ).toBe('Halo would not give up announcements for CHM-113 and ENG-105 and inbox. Everything else came through, and this is still missing rather than empty.');
  });

  it('never stamps a kind the pull failed to read, so nothing looks freshly checked that was not', () => {
    const base = mkExport([mkClass({ id: 'h1', courseCode: 'CHM-113', announcements: [], resources: [] })]);
    const idOf = () => 'c1';
    const full = pullsFrom(base, idOf, undefined, '2026-09-17T12:00:00.000Z');
    expect(full.c1.announcements).toBe('2026-09-17T12:00:00.000Z');
    expect(full.c1.resources).toBe('2026-09-17T12:00:00.000Z');
    // The announcements call broke, so the bookmark leaves the key off entirely.
    const broken = mkExport([mkClass({ id: 'h1', courseCode: 'CHM-113', announcements: undefined, resources: [] })]);
    const after = pullsFrom(broken, idOf, full, '2026-09-19T12:00:00.000Z');
    expect(after.c1.announcements).toBe('2026-09-17T12:00:00.000Z');
    expect(after.c1.resources).toBe('2026-09-19T12:00:00.000Z');
    // Which means the staleness line can still call it out two days later.
    const courses = [mkCourse({ id: 'c1', code: 'CHM-113' })];
    const s = staleness(courses, { haloPulls: after, timezone: TZ }, '2026-09-20');
    expect(s.stale.find((x) => x.kind === 'announcements')?.courses.map((c) => c.code)).toEqual(['CHM-113']);
    expect(s.stale.find((x) => x.kind === 'resources')).toBeUndefined();
  });
});

describe('a bookmark saved before today', () => {
  it('names the stale bookmark rather than blaming the queries', () => {
    expect(staleBookmarkLine({ build: '2026-09-18c', pulls: ['a'] }, '2026-09-18c')).toBeNull();
    expect(staleBookmarkLine({}, '2026-09-18c')).toBe(
      'This came from an older copy of the Halo bookmark, saved before builds were stamped. It pulled assignments and grades only. Open You, Halo connection, and drag the bookmark to your bar again to replace it, then sync once more.',
    );
    expect(staleBookmarkLine({ build: '2026-09-01', pulls: ['assessments', 'grades', 'instructors'] }, '2026-09-18c')).toContain('built 2026-09-01. It pulled only 3 kinds of data');
  });
});
