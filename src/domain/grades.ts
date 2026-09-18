import type { Item } from './types';

export interface GradeSummary {
  earned: number;
  possibleGraded: number;
  pct: number | null;
  remaining: number;
  totalPossible: number;
  projected: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function courseGrade(courseId: string, items: Item[]): GradeSummary {
  let earned = 0;
  let possibleGraded = 0;
  let remaining = 0;
  let totalPossible = 0;
  for (const it of items) {
    if (it.courseId !== courseId) continue;
    totalPossible += it.points;
    if (it.score !== null) {
      earned += it.score;
      possibleGraded += it.points;
    } else {
      remaining += it.points;
    }
  }
  const pct = possibleGraded > 0 ? round1((earned / possibleGraded) * 100) : null;
  const projected =
    pct !== null && totalPossible > 0 ? round1(((earned + (remaining * pct) / 100) / totalPossible) * 100) : null;
  return { earned, possibleGraded, pct, remaining, totalPossible, projected };
}

/** The letter for a percentage on one class's own scale, when Halo gave us one. */
export function letterFor(pct: number | null, scale: { label: string; minPercent: number | null; maxPercent: number | null }[] | undefined): string | null {
  if (pct === null || !scale?.length) return null;
  const hit = scale.find((e) => (e.minPercent === null || pct >= e.minPercent) && (e.maxPercent === null || pct <= e.maxPercent));
  return hit?.label ?? null;
}
