import { courseGrade } from './grades';
import type { Item } from './types';

/** Reads on top of the points-based grade math in grades.ts; nothing here changes how a grade is computed. */

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Weight {
  item: Item;
  /** Share of the whole class, in percent. A 5-point DQ in a 700-point class is 0.7. */
  pct: number;
  graded: boolean;
}

/** Every item's share of the class total, biggest first. */
export function weights(courseId: string, items: Item[]): Weight[] {
  const mine = items.filter((i) => i.courseId === courseId);
  const total = mine.reduce((n, i) => n + i.points, 0);
  return mine
    .map((item) => ({ item, pct: total ? round1((item.points / total) * 100) : 0, graded: item.score !== null }))
    .sort((a, b) => b.pct - a.pct || a.item.dueAt.localeCompare(b.item.dueAt));
}

export interface Projection {
  /** Average over graded work, including the hypothetical. */
  average: number | null;
  /** Whole-class grade if the rest scores at that average. */
  projected: number | null;
}

/** What the class grade looks like if `itemId` came back with `score`. */
export function projectWith(courseId: string, items: Item[], itemId: string, score: number): Projection {
  const g = courseGrade(
    courseId,
    items.map((i) => (i.id === itemId ? { ...i, score } : i)),
  );
  return { average: g.pct, projected: g.projected };
}

export type RestAssumption = 'average' | 'perfect';

export interface Needed {
  /** Points needed on the item, or null when the target is already locked in or out of reach. */
  points: number | null;
  pctOfItem: number | null;
  reachable: boolean;
  alreadyThere: boolean;
  /** What the rest of the open work is assumed to score, in percent. */
  restAt: number;
}

/**
 * Score needed on one open item for the whole-class grade to reach `targetPct`,
 * assuming the other open items score at the current average (or perfectly).
 */
export function neededFor(courseId: string, items: Item[], itemId: string, targetPct: number, rest: RestAssumption = 'average'): Needed | null {
  const g = courseGrade(courseId, items);
  const item = items.find((i) => i.id === itemId && i.courseId === courseId);
  if (!item || item.score !== null || g.totalPossible === 0) return null;
  const restAt = rest === 'perfect' ? 100 : (g.pct ?? 100);
  const others = g.remaining - item.points;
  const needed = (targetPct / 100) * g.totalPossible - g.earned - (others * restAt) / 100;
  if (needed <= 0) return { points: null, pctOfItem: null, reachable: true, alreadyThere: true, restAt };
  if (needed > item.points) return { points: null, pctOfItem: null, reachable: false, alreadyThere: false, restAt };
  return { points: round1(needed), pctOfItem: item.points ? round1((needed / item.points) * 100) : null, reachable: true, alreadyThere: false, restAt };
}
