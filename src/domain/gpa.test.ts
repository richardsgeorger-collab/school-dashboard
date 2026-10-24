import { describe, expect, it } from 'vitest';
import { creditsFor, cumulativeGpa, fmtGpa, letterForPercent, pointsFor, semesterGpa } from './gpa';
import type { Course } from './types';

const course = (id: string, code: string, credits: number, percent: number | null, more: Partial<Course> = {}): Course =>
  ({
    id,
    code,
    name: code,
    color: '#888',
    credits,
    creditsFrom: 'halo',
    instructors: [],
    meetings: [],
    online: false,
    termStart: '2026-09-08',
    termEnd: '2026-12-20',
    updatedAt: '2026-10-24T00:00:00Z',
    haloGrade: percent === null ? null : { letter: null, points: null, maxPoints: null, percent, at: '2026-10-24T00:00:00Z' },
    ...more,
  }) as Course;

describe("GCU's undergraduate scale (University Policy Handbook, Fall 2026, pp. 202-203)", () => {
  it('cutoffs, never rounded up: 92.99 is an A-', () => {
    expect(letterForPercent(100)).toBe('A');
    expect(letterForPercent(93)).toBe('A');
    expect(letterForPercent(92.99)).toBe('A-');
    expect(letterForPercent(90)).toBe('A-');
    expect(letterForPercent(89.99)).toBe('B+');
    expect(letterForPercent(87)).toBe('B+');
    expect(letterForPercent(86.5)).toBe('B');
    expect(letterForPercent(83)).toBe('B');
    expect(letterForPercent(82)).toBe('B-');
    expect(letterForPercent(79)).toBe('C+');
    expect(letterForPercent(70)).toBe('C');
    expect(letterForPercent(69.9)).toBe('D');
    expect(letterForPercent(59.9)).toBe('F');
  });
  it('grade points: A 4.0, A- 3.7, B+ 3.3, B 3.0, B- 2.7, C+ 2.3, C 2.0, D 1.0, F 0.0; none for a letter GCU does not use', () => {
    expect(['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'].map(pointsFor)).toEqual([4, 3.7, 3.3, 3, 2.7, 2.3, 2, 1, 0]);
    expect(pointsFor('C-')).toBeNull();
    expect(pointsFor(' a- ')).toBe(3.7);
  });
  it("a class's own cutoffs win for its letter (a nursing-style scale: 95 for an A)", () => {
    const own = [
      { label: 'A', minPercent: 95, maxPercent: 100 },
      { label: 'A-', minPercent: 92, maxPercent: 94.99 },
      { label: 'B+', minPercent: 90, maxPercent: 91.99 },
      { label: 'B', minPercent: 87, maxPercent: 89.99 },
      { label: 'F', minPercent: 0, maxPercent: 71.99 },
    ];
    expect(letterForPercent(94, own)).toBe('A-');
    expect(letterForPercent(94)).toBe('A');
    expect(letterForPercent(91, own)).toBe('B+');
  });
});

describe('the semester GPA, against hand-worked examples', () => {
  it('four classes: (4·4.0 + 3·3.7 + 1·3.3 + 3·3.0) / 11 = 39.4 / 11 = 3.5818…', () => {
    // CHM-113 4 cr 95% A 4.0 = 16.0; ENG-105 3 cr 91% A- 3.7 = 11.1; CHM-113L 1 cr 88% B+ 3.3 = 3.3; UNV-106 3 cr 84% B 3.0 = 9.0.
    const g = semesterGpa([course('a', 'CHM-113', 4, 95), course('b', 'ENG-105', 3, 91), course('c', 'CHM-113L', 1, 88), course('d', 'UNV-106', 3, 84)]);
    expect(g.credits).toBe(11);
    expect(g.gpa).toBeCloseTo(39.4 / 11, 10);
    expect(fmtGpa(g.gpa)).toBe('3.58');
  });
  it("Halo's own letter is the class's letter (it is graded on the class's own scale)", () => {
    // Halo says B+ at 89.5% (its scale): 3 cr · 3.3 + 3 cr · 4.0 (96%) = 21.9 / 6 = 3.65.
    const g = semesterGpa([course('a', 'X-101', 3, 89.5, { haloGrade: { letter: 'B+', points: null, maxPoints: null, percent: 89.5, at: '' } }), course('b', 'Y-102', 3, 96)]);
    expect(g.rows[0].letter).toBe('B+');
    expect(g.gpa).toBeCloseTo(3.65, 10);
  });
  it('no grade yet: left out and counted; zero credits and a letter GCU does not use: left out', () => {
    // Only A (3 cr, 4.0) and C (4 cr, 2.0) count: (12 + 8) / 7 = 2.857142…
    const g = semesterGpa([course('a', 'A-1', 3, 94), course('b', 'B-1', 4, 72), course('c', 'C-1', 3, null), course('d', 'D-1', 0, 99), course('e', 'E-1', 3, 75, { haloGrade: { letter: 'C-', points: null, maxPoints: null, percent: 75, at: '' } })]);
    expect(g.gpa).toBeCloseTo(20 / 7, 10);
    expect(g.ungraded).toBe(1);
    expect(g.rows.map((r) => r.left)).toEqual([null, null, 'no-grade', 'no-credits', 'no-points']);
  });
  it('what-if: a try-out percent for one class, by its cutoffs, never the stored grade', () => {
    const cs = [course('a', 'CHM-113', 4, 81), course('b', 'ENG-105', 3, 93)];
    // Now: (4·2.7 + 3·4.0) / 7 = 22.8 / 7 = 3.2571…; if CHM-113 ends at 90%: (4·3.7 + 12) / 7 = 26.8 / 7 = 3.8285…
    expect(semesterGpa(cs).gpa).toBeCloseTo(22.8 / 7, 10);
    const w = semesterGpa(cs, { a: 90 });
    expect(w.gpa).toBeCloseTo(26.8 / 7, 10);
    expect(w.rows[0]).toMatchObject({ letter: 'A-', whatIf: true });
    expect(cs[0].haloGrade?.percent).toBe(81);
    // A what-if on a class with no grade yet brings it in.
    expect(semesterGpa([course('a', 'A-1', 3, null)], { a: 85 }).gpa).toBe(3);
  });
  it('nothing graded: no GPA', () => {
    expect(semesterGpa([course('a', 'A-1', 3, null)]).gpa).toBeNull();
    expect(fmtGpa(null)).toBe('–');
  });
});

describe('credits and the cumulative GPA', () => {
  it("credits: the student's own, Halo's or the syllabus's, else a lab 1 and any other class 3", () => {
    expect(creditsFor({ code: 'CHM-113L', credits: 2, creditsFrom: 'student' })).toBe(2);
    expect(creditsFor({ code: 'CHM-113', credits: 4, creditsFrom: 'halo' })).toBe(4);
    // Before sources were kept: a lab at 3 was the old fallback.
    expect(creditsFor({ code: 'CHM-113L', credits: 3 })).toBe(1);
    expect(creditsFor({ code: 'CHM-113', credits: 3 })).toBe(3);
  });
  it('projected cumulative: (3.40 · 30 + 3.5818… · 11) / 41', () => {
    const sem = { gpa: 39.4 / 11, credits: 11 };
    // 3.40 · 30 = 102; 102 + 39.4 = 141.4; / 41 = 3.4487…
    expect(cumulativeGpa({ gpa: 3.4, credits: 30 }, sem)).toBeCloseTo(141.4 / 41, 10);
    expect(fmtGpa(cumulativeGpa({ gpa: 3.4, credits: 30 }, sem))).toBe('3.45');
    expect(cumulativeGpa({ gpa: 4.5, credits: 30 }, sem)).toBeNull();
    expect(cumulativeGpa({ gpa: 3.2, credits: 15 }, { gpa: null, credits: 0 })).toBe(3.2);
  });
});
