import type { Item } from './types';

export interface GradeSummary {
  earned: number;
  possibleGraded: number;
  /** Null until enough is graded to mean something (see `enough`). */
  pct: number | null;
  remaining: number;
  totalPossible: number;
  projected: number | null;
  /** Graded items that carry points. Participation and 0-point posts are not a grade. */
  graded: number;
  /** Three real graded items, or a tenth of the term's points. Below that a percentage is noise, and an F from one
   * intro post is worse than noise. */
  enough: boolean;
}

export const MIN_GRADED_ITEMS = 3;
export const MIN_GRADED_SHARE = 0.1;
export const NOT_ENOUGH_GRADED = 'Not enough graded yet';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function courseGrade(courseId: string, items: Item[]): GradeSummary {
  let earned = 0;
  let possibleGraded = 0;
  let remaining = 0;
  let totalPossible = 0;
  let graded = 0;
  for (const it of items) {
    if (it.courseId !== courseId) continue;
    totalPossible += it.points;
    if (it.score !== null && it.points > 0 && it.type !== 'participation') {
      earned += it.score;
      possibleGraded += it.points;
      graded += 1;
    } else if (it.score === null) {
      remaining += it.points;
    }
  }
  const enough = graded > 0 && (graded >= MIN_GRADED_ITEMS || (totalPossible > 0 && possibleGraded / totalPossible >= MIN_GRADED_SHARE));
  const pct = enough && possibleGraded > 0 ? round1((earned / possibleGraded) * 100) : null;
  const projected =
    pct !== null && totalPossible > 0 ? round1(((earned + (remaining * pct) / 100) / totalPossible) * 100) : null;
  return { earned, possibleGraded, pct, remaining, totalPossible, projected, graded, enough };
}

/** The letter for a percentage on one class's own scale, when Halo gave us one. */
export function letterFor(pct: number | null, scale: { label: string; minPercent: number | null; maxPercent: number | null }[] | undefined): string | null {
  if (pct === null || !scale?.length) return null;
  const hit = scale.find((e) => (e.minPercent === null || pct >= e.minPercent) && (e.maxPercent === null || pct <= e.maxPercent));
  return hit?.label ?? null;
}
