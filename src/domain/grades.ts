import type { Item } from './types';

export interface GradeSummary {
  earned: number;
  possibleGraded: number;
  /** Null until one real item is scored. */
  pct: number | null;
  remaining: number;
  totalPossible: number;
  projected: number | null;
  /** Graded items that carry points. Participation and 0-point posts are not a grade. */
  graded: number;
  /** One real scored item is enough to show the percentage; what it rests on is said next to it (`basedOn`). */
  enough: boolean;
}

export const NOT_GRADED = 'Not graded yet';

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The grade as Halo's gradebook has it so far. Any real scored item shows a percentage; the count it rests on is
 * always written beside it, so one 98% from a 20-point warm-up reads as what it is rather than as the term.
 */
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
  const enough = graded > 0 && possibleGraded > 0;
  const pct = enough ? round1((earned / possibleGraded) * 100) : null;
  const projected =
    pct !== null && totalPossible > 0 ? round1(((earned + (remaining * pct) / 100) / totalPossible) * 100) : null;
  return { earned, possibleGraded, pct, remaining, totalPossible, projected, graded, enough };
}

/** "based on 3 items": what the percentage rests on, written under it wherever it shows. */
export function basedOn(g: Pick<GradeSummary, 'graded'>): string {
  return `based on ${g.graded} item${g.graded === 1 ? '' : 's'}`;
}

/** The letter for a percentage on one class's own scale, when Halo gave us one. */
export function letterFor(pct: number | null, scale: { label: string; minPercent: number | null; maxPercent: number | null }[] | undefined): string | null {
  if (pct === null || !scale?.length) return null;
  const hit = scale.find((e) => (e.minPercent === null || pct >= e.minPercent) && (e.maxPercent === null || pct <= e.maxPercent));
  return hit?.label ?? null;
}
