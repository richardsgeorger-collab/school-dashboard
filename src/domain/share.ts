import type { Item } from './types';

/** What one item is worth as a share of everything in its class, as a whole percent, or null when unknown. */
export function gradeShare(item: Pick<Item, 'courseId' | 'points'>, items: Pick<Item, 'courseId' | 'points'>[]): number | null {
  if (item.points <= 0) return null;
  const total = items.reduce((n, i) => (i.courseId === item.courseId ? n + i.points : n), 0);
  if (total <= 0) return null;
  const pct = (item.points / total) * 100;
  return pct < 1 ? Math.round(pct * 10) / 10 : Math.round(pct);
}

/** "5% of grade", or "0.3% of grade" for the tiny ones; null when unknown. */
export function shareLine(item: Pick<Item, 'courseId' | 'points'>, items: Pick<Item, 'courseId' | 'points'>[]): string | null {
  const s = gradeShare(item, items);
  return s === null ? null : `${s}% of grade`;
}
