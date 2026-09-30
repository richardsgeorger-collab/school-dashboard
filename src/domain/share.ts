import type { Item } from './types';

/**
 * Below this many pointed items on file the class total is not the term's, so a share would be fiction: a 10-point
 * discussion in a class with 15 points synced so far showed "67% of grade" on a new student's Now (2026-09-30).
 */
export const SHARE_MIN_ITEMS = 6;

/** What one item is worth as a share of everything in its class, as a whole percent, or null when unknown. */
export function gradeShare(item: Pick<Item, 'courseId' | 'points'>, items: Pick<Item, 'courseId' | 'points'>[]): number | null {
  if (item.points <= 0) return null;
  const mine = items.filter((i) => i.courseId === item.courseId && i.points > 0);
  if (mine.length < SHARE_MIN_ITEMS) return null;
  const total = mine.reduce((n, i) => n + i.points, 0);
  if (total <= 0) return null;
  const pct = (item.points / total) * 100;
  return pct < 1 ? Math.round(pct * 10) / 10 : Math.round(pct);
}

/** "5% of grade", or "0.3% of grade" for the tiny ones; null when unknown. */
export function shareLine(item: Pick<Item, 'courseId' | 'points'>, items: Pick<Item, 'courseId' | 'points'>[]): string | null {
  const s = gradeShare(item, items);
  return s === null ? null : `${s}% of grade`;
}
