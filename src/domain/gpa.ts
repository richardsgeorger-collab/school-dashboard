import type { Course } from './types';

/**
 * The semester GPA on Classes (George, 2026-10-24), from each class's current Halo grade.
 *
 * GCU's own rule, from its University Policy Handbook (Fall 2026, effective May 4, 2026, "Grading System" and
 * "Undergraduate Grading Scale", pp. 202-203): each course's semester credits times the grade points for its letter,
 * summed, divided by the credits of the courses with a letter grade (A through F). No rounding of grades: 92.99 is an
 * A-. The undergraduate scale below is the standard one (COE, COFAP, CONHCP: HIM, PH, HCA; COT, CHSS, CSET, CCOB);
 * a class graded on another scale (nursing, CSD, OTA) has its own cutoffs in Halo, which win for its letter.
 * GCU's scale has no C-, D+ or D-: a letter outside it has no grade points GCU publishes, so that class is left out
 * rather than guessed.
 */
export const GCU_POINTS: Record<string, number> = { A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, D: 1.0, F: 0.0 };

/** The standard undergraduate cutoffs (the lowest percent for each letter). */
export const GCU_SCALE: { label: string; minPercent: number }[] = [
  { label: 'A', minPercent: 93 },
  { label: 'A-', minPercent: 90 },
  { label: 'B+', minPercent: 87 },
  { label: 'B', minPercent: 83 },
  { label: 'B-', minPercent: 80 },
  { label: 'C+', minPercent: 77 },
  { label: 'C', minPercent: 70 },
  { label: 'D', minPercent: 60 },
  { label: 'F', minPercent: 0 },
];

type Scale = { label: string; minPercent: number | null; maxPercent?: number | null }[] | undefined;

const norm = (label: string) => label.trim().toUpperCase().replace(/\s+/g, '').replace('−', '-');

/**
 * The letter for a percent: the class's own cutoffs (Halo's grade scale for that class) when it has them, else GCU's
 * standard ones. The highest letter whose lowest percent the grade reaches; never rounded up (92.99 stays below 93).
 */
export function letterForPercent(percent: number, scale?: Scale): string {
  const own = (scale ?? []).filter((e) => e.label && e.minPercent !== null && Number.isFinite(e.minPercent)) as { label: string; minPercent: number }[];
  const use = own.length ? own : GCU_SCALE;
  const sorted = [...use].sort((a, b) => b.minPercent - a.minPercent);
  const hit = sorted.find((e) => percent >= e.minPercent);
  return norm(hit?.label ?? sorted[sorted.length - 1]?.label ?? 'F');
}

/** GCU's grade points for a letter, or null for a letter GCU's scale does not have. */
export const pointsFor = (letter: string): number | null => {
  const p = GCU_POINTS[norm(letter)];
  return p === undefined ? null : p;
};

/**
 * Credits for a class: what the student set, else what Halo or the syllabus says, else a default (a lab 1, any other
 * class 3). A class from before credits were tracked by source, a lab at 3, was the old fallback, not Halo: 1.
 */
export function creditsFor(course: Pick<Course, 'code' | 'credits' | 'creditsFrom'>): number {
  if (course.creditsFrom && Number.isFinite(course.credits)) return course.credits;
  if (/L$/i.test(course.code.trim()) && course.credits === 3) return 1;
  return Number.isFinite(course.credits) ? course.credits : defaultCredits(course.code);
}

/** The default credits for a class Halo has no credits for. */
export const defaultCredits = (code: string): number => (/L$/i.test(code.trim()) ? 1 : 3);

export interface GpaRow {
  courseId: string;
  code: string;
  percent: number | null;
  letter: string | null;
  points: number | null;
  credits: number;
  /** A what-if grade is in place of the real one. */
  whatIf: boolean;
  /** Why it is not in the GPA. */
  left: 'no-grade' | 'no-points' | 'no-credits' | null;
}

export interface Gpa {
  gpa: number | null;
  credits: number;
  rows: GpaRow[];
  /** Classes with no grade yet (left out). */
  ungraded: number;
}

/**
 * The semester GPA from each class's current grade: Halo's own letter when Halo gives one (it is graded on the class's
 * own scale), else the letter for its percent. `whatIf` replaces a class's percent for a try-out, never saved.
 */
export function semesterGpa(courses: Course[], whatIf: Record<string, number> = {}): Gpa {
  const rows: GpaRow[] = courses.map((c) => {
    const credits = creditsFor(c);
    const tryPct = whatIf[c.id];
    const tried = typeof tryPct === 'number' && Number.isFinite(tryPct);
    const percent = tried ? tryPct : (c.haloGrade?.percent ?? null);
    const letter = tried ? letterForPercent(tryPct, c.gradeScale) : c.haloGrade?.letter ? norm(c.haloGrade.letter) : percent !== null ? letterForPercent(percent, c.gradeScale) : null;
    const points = letter ? pointsFor(letter) : null;
    const left = letter === null ? 'no-grade' : points === null ? 'no-points' : credits <= 0 ? 'no-credits' : null;
    return { courseId: c.id, code: c.code, percent, letter, points, credits, whatIf: tried, left };
  });
  const counted = rows.filter((r) => r.left === null);
  const credits = counted.reduce((n, r) => n + r.credits, 0);
  const sum = counted.reduce((n, r) => n + r.credits * (r.points as number), 0);
  return { gpa: credits > 0 ? sum / credits : null, credits, rows, ungraded: rows.filter((r) => r.left === 'no-grade').length };
}

/** The projected cumulative GPA: what is on the transcript so far, with this semester's credits added at its GPA. */
export function cumulativeGpa(sofar: { gpa: number; credits: number }, semester: { gpa: number | null; credits: number }): number | null {
  if (!(sofar.credits >= 0) || !(sofar.gpa >= 0) || sofar.gpa > 4) return null;
  if (semester.gpa === null || semester.credits <= 0) return sofar.credits > 0 ? sofar.gpa : null;
  const total = sofar.credits + semester.credits;
  return total > 0 ? (sofar.gpa * sofar.credits + semester.gpa * semester.credits) / total : null;
}

/** "3.62": GPAs are shown to two places, and only shown, never rounded into the math. */
export const fmtGpa = (g: number | null): string => (g === null ? '–' : (Math.round(g * 100) / 100).toFixed(2));
