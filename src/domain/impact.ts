import { courseGrade, letterFor } from './grades';
import type { Item } from './types';

/**
 * What a zero on this one item does to the class grade, with everything else scoring at the current average. Only
 * once enough is graded for the average to mean something; before that the share of the grade is the honest number.
 */
export interface SkipImpact {
  /** The class grade if the rest holds, as a whole percent. */
  from: number;
  /** The class grade with a zero on this item, as a whole percent. */
  to: number;
  fromLetter: string | null;
  toLetter: string | null;
}

export function skipImpact(item: Pick<Item, 'id' | 'courseId' | 'points' | 'status' | 'score'>, items: Item[]): SkipImpact | null {
  if (item.points <= 0 || item.status === 'done' || item.score !== null) return null;
  const g = courseGrade(item.courseId, items);
  if (!g.enough || g.pct === null || g.totalPossible <= 0 || g.remaining < item.points) return null;
  const avg = g.pct / 100;
  const rest = g.remaining - item.points;
  const from = ((g.earned + (rest + item.points) * avg) / g.totalPossible) * 100;
  const to = ((g.earned + rest * avg) / g.totalPossible) * 100;
  return { from: Math.round(from), to: Math.round(to), fromLetter: letterFor(from, undefined), toLetter: letterFor(to, undefined) };
}

/** "Skip it and CHM-113 goes from 88% to 84%." or with the letter when it changes; null when the drop is under a point. */
export function skipLine(item: Pick<Item, 'id' | 'courseId' | 'points' | 'status' | 'score'>, items: Item[], courseCode: string): string | null {
  const s = skipImpact(item, items);
  if (!s || s.from - s.to < 1) return null;
  const letters = s.fromLetter && s.toLetter && s.fromLetter !== s.toLetter ? ` (${s.fromLetter} to ${s.toLetter})` : '';
  return `Skip it and ${courseCode} goes from ${s.from}% to ${s.to}%${letters}.`;
}
