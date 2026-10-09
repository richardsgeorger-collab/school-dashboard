import { GCU_SCALE, weighted } from './floor';
import { courseGrade, letterFor } from './grades';
import type { Course, Item } from './types';

/**
 * What a zero on this one item does to the class grade, with everything else scoring at the current average. The
 * grade itself shows from the first scored item (with "based on 1 item" beside it), but a projection built on that
 * average waits for three real items or a tenth of the term's points; before that the share of the grade is the
 * honest number.
 */
const STEADY_ITEMS = 3;
const STEADY_SHARE = 0.1;
export interface SkipImpact {
  /** The class grade if the rest holds, as a whole percent. */
  from: number;
  /** The class grade with a zero on this item, as a whole percent. */
  to: number;
  fromLetter: string | null;
  toLetter: string | null;
}

export function skipImpact(item: Pick<Item, 'id' | 'courseId' | 'points' | 'status' | 'score'>, items: Item[], course?: Pick<Course, 'haloGrade' | 'gradeScale'> | null): SkipImpact | null {
  if (item.points <= 0 || item.status === 'done' || item.score !== null) return null;
  // A class whose Halo percent is not its points share weighs categories Halo does not tell us: no number is better
  // than a wrong one (George, 2026-10-08).
  if (weighted(course)) return null;
  // Halo's own class grade when the last sync carried it, so this line and the class card start from one number.
  const g = courseGrade(item.courseId, items, course);
  if (!g.enough || g.pct === null || g.totalPossible <= 0 || g.remaining < item.points) return null;
  if (g.graded < STEADY_ITEMS && g.possibleGraded / g.totalPossible < STEADY_SHARE) return null;
  const avg = g.pct / 100;
  const rest = g.remaining - item.points;
  const from = ((g.earned + (rest + item.points) * avg) / g.totalPossible) * 100;
  const to = ((g.earned + rest * avg) / g.totalPossible) * 100;
  const scale = course?.gradeScale?.length ? course.gradeScale : GCU_SCALE;
  return { from: Math.round(from), to: Math.round(to), fromLetter: letterFor(from, scale), toLetter: letterFor(to, scale) };
}

/** "Skip it and CHM-113 goes from 88% to 84%." or with the letter when it changes; null when the drop is under a point. */
export function skipLine(item: Pick<Item, 'id' | 'courseId' | 'points' | 'status' | 'score'>, items: Item[], courseCode: string, course?: Pick<Course, 'haloGrade'> | null): string | null {
  const s = skipImpact(item, items, course);
  if (!s || s.from - s.to < 1) return null;
  const letters = s.fromLetter && s.toLetter && s.fromLetter !== s.toLetter ? ` (${s.fromLetter} to ${s.toLetter})` : '';
  return `Skip it and ${courseCode} goes from ${s.from}% to ${s.to}%${letters}.`;
}
