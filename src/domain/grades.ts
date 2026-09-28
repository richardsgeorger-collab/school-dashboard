import type { Course, Item } from './types';

export interface GradeSummary {
  earned: number;
  possibleGraded: number;
  /** The class percent: Halo's own when the last sync carried it, otherwise points earned over points graded. */
  pct: number | null;
  remaining: number;
  totalPossible: number;
  projected: number | null;
  /** Graded items that carry points, participation included (Halo counts it). 0-point posts are not a grade. */
  graded: number;
  enough: boolean;
  /** 'halo' when the percent is Halo's own class grade; 'items' when it is summed here from the items. */
  source: 'halo' | 'items' | 'none';
  /** Halo's letter, exactly as Halo shows it. Null when Halo gave none (or the grade is summed here). */
  letter: string | null;
  /** The items' own sum, kept beside Halo's number so a disagreement can be flagged (never shown instead of it). */
  itemsPct: number | null;
}

export const NOT_GRADED = 'Not graded yet';

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The class grade. Halo's own (the letter and percent on its class card) wins whenever the last sync carried it;
 * the items' sum is the fallback for a class Halo has not reported yet, and is kept alongside for the mismatch check.
 * Every scored item with points counts, participation included, the way Halo's gradebook counts it.
 */
export function courseGrade(courseId: string, items: Item[], course?: Pick<Course, 'haloGrade'> | null): GradeSummary {
  let earned = 0;
  let possibleGraded = 0;
  let remaining = 0;
  let totalPossible = 0;
  let graded = 0;
  for (const it of items) {
    if (it.courseId !== courseId) continue;
    totalPossible += it.points;
    if (it.score !== null && it.points > 0) {
      earned += it.score;
      possibleGraded += it.points;
      graded += 1;
    } else if (it.score === null) {
      remaining += it.points;
    }
  }
  const itemsPct = possibleGraded > 0 ? round1((earned / possibleGraded) * 100) : null;
  const halo = course?.haloGrade ?? null;
  if (halo && (halo.percent !== null || halo.letter)) {
    // Halo's points are the ones the projection builds on, so every number on the card agrees with Halo's.
    const e = halo.points ?? earned;
    const p = halo.maxPoints ?? possibleGraded;
    const pct = halo.percent;
    const projected = pct !== null && totalPossible > 0 ? round1(((e + (remaining * pct) / 100) / totalPossible) * 100) : null;
    return { earned: e, possibleGraded: p, pct, remaining, totalPossible, projected, graded, enough: pct !== null, source: 'halo', letter: halo.letter, itemsPct };
  }
  const enough = graded > 0 && possibleGraded > 0;
  const pct = enough ? itemsPct : null;
  const projected = pct !== null && totalPossible > 0 ? round1(((earned + (remaining * pct) / 100) / totalPossible) * 100) : null;
  return { earned, possibleGraded, pct, remaining, totalPossible, projected, graded, enough, source: enough ? 'items' : 'none', letter: null, itemsPct };
}

/** "A (96.0%)": Halo's letter and percent, the way its class card shows them. A letter-only or percent-only grade shows what there is. */
export function gradeText(g: Pick<GradeSummary, 'pct' | 'letter'>): string {
  const pct = g.pct === null ? null : `${g.pct.toFixed(1)}%`;
  if (g.letter && pct) return `${g.letter} (${pct})`;
  return g.letter ?? pct ?? NOT_GRADED;
}

/** The grade as one line: Halo's own letter, or for a summed grade the class scale's letter. */
export function gradeLine(g: GradeSummary, scale?: { label: string; minPercent: number | null; maxPercent: number | null }[]): string {
  return gradeText({ pct: g.pct, letter: g.source === 'halo' ? g.letter : letterFor(g.pct, scale) });
}

/** "based on 3 items": only for a grade summed here. Halo's own grade needs no footnote. */
export function basedOn(g: Pick<GradeSummary, 'graded' | 'source'>): string | null {
  if (g.source !== 'items') return null;
  return `based on ${g.graded} item${g.graded === 1 ? '' : 's'}`;
}

/**
 * Where Halo's number and the items' sum disagree by more than a rounding, in words for Advanced. Halo's number is
 * what the app shows; this only says the per-item breakdown does not add up to it (usually a score not yet synced).
 */
export function gradeMismatch(g: GradeSummary): string | null {
  if (g.source !== 'halo' || g.pct === null) return null;
  if (g.itemsPct !== null && Math.abs(g.itemsPct - g.pct) < 0.15) return null;
  return `Halo says ${g.pct.toFixed(1)}%; the items here add up to ${g.itemsPct === null ? 'nothing yet' : `${g.itemsPct.toFixed(1)}%`}.`;
}

/** The letter for a percentage on one class's own scale, when Halo gave us one. */
export function letterFor(pct: number | null, scale: { label: string; minPercent: number | null; maxPercent: number | null }[] | undefined): string | null {
  if (pct === null || !scale?.length) return null;
  const hit = scale.find((e) => (e.minPercent === null || pct >= e.minPercent) && (e.maxPercent === null || pct <= e.maxPercent));
  return hit?.label ?? null;
}
