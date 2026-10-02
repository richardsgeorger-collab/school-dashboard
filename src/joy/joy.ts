import type { Course, Item } from '../domain/types';

/**
 * The rewards (George, 2026-10-02: "the dopamine system"). Pure, so every claim is tested. Everything here comes from
 * real Halo data where there is any (submitted, graded, the class's own point totals), and is derived fresh from the
 * planner each time, so unchecking something takes back whatever it gave.
 */

/** Halo says it was handed in: a submission time, a submitted or published status, or a score. */
export function isTurnedIn(i: Item): boolean {
  const s = i.halo?.status ?? null;
  return !!i.halo?.submittedAt || s === 'SUBMITTED' || s === 'PUBLISHED' || i.score !== null;
}

/** Work done: handed in on Halo, or checked off here. */
export const isWorkDone = (i: Item): boolean => i.status === 'done' || isTurnedIn(i);

export interface ClassProgress {
  done: number;
  total: number;
  /** Whole percent, 0 to 100. */
  pct: number;
}

/**
 * How much of a class's work is done, by points: the points of the work handed in or checked off, over the class's
 * real total from Halo (the sum of every Halo assignment's points in that class, never an assumed 1,000). Work you
 * added by hand is not Halo's, so it is in neither number. Null when Halo gave the class no points.
 */
export function classProgress(courseId: string, items: Item[]): ClassProgress | null {
  const halo = items.filter((i) => i.courseId === courseId && i.source === 'halo' && i.points > 0);
  const total = halo.reduce((n, i) => n + i.points, 0);
  if (total <= 0) return null;
  const done = halo.filter(isWorkDone).reduce((n, i) => n + i.points, 0);
  return { done, total, pct: Math.min(100, Math.floor((done / total) * 100)) };
}

/** The last of 25, 50, 75 and 100 a class has reached. */
export const milestoneOf = (pct: number): 0 | 25 | 50 | 75 | 100 => (pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0);

/**
 * How many things a sync newly saw handed in. Zero on a first sync (a whole term arriving is history, not a moment),
 * and nothing that was already turned in before.
 */
export function turnedInSince(before: Item[], after: Item[]): number {
  if (!before.some((i) => i.source === 'halo')) return 0;
  const was = new Map(before.map((i) => [i.id, i]));
  return after.filter((i) => {
    if (!isTurnedIn(i)) return false;
    const b = was.get(i.id);
    return !!b && !isTurnedIn(b);
  }).length;
}

/** Classes whose grade from Halo went up in a sync. Never a drop; never a class with no grade before. */
export function gradeUps(before: Course[], after: Course[]): { courseId: string; code: string; percent: number }[] {
  const was = new Map(before.map((c) => [c.id, c.haloGrade?.percent ?? null]));
  return after
    .filter((c) => {
      const b = was.get(c.id);
      const a = c.haloGrade?.percent ?? null;
      return b !== null && b !== undefined && a !== null && a - b >= 0.5;
    })
    .map((c) => ({ courseId: c.id, code: c.code, percent: Math.round(c.haloGrade!.percent!) }));
}

/** The line under a check-off: "+50 pts done · CHM-113L is 34% complete". */
export function doneLine(points: number, code: string | null, pct: number | null): string {
  const pts = `+${points} pts done`;
  return code && pct !== null ? `${pts} · ${code} is ${pct}% complete` : pts;
}
