import { dateOf, diffDays } from './dates';
import { isNoise } from './requirements';
import { isWorkDone } from '../joy/joy';
import type { DateStr, Item } from './types';

/**
 * A class card's "Next" and its overdue work (2026-10-04, George: Halo said "Week 4, Day 2 Participation" was 2 days
 * overdue while Halo+ said On pace, and "Next" skipped participation due today).
 * - Unfinished means not turned in or graded on Halo and not checked off here (joy.isWorkDone).
 * - Overdue: unfinished and past its due day, when Halo itself says OVERDUE or it is within the last two weeks (an
 *   old item Halo no longer lists is history, not today's problem).
 * - Next: the oldest overdue thing first; otherwise the soonest unfinished thing, participation included (a weekly
 *   participation due today is the next thing, even when its lines are folded into it).
 */
export const OVERDUE_DAYS = 14;

export function overdueOf(items: Item[], today: DateStr, tz: string): Item[] {
  return items
    .filter((i) => {
      if (isWorkDone(i) || (isNoise(i) && i.halo?.status !== 'OVERDUE')) return false;
      const d = diffDays(today, dateOf(i.dueAt, tz));
      return d < 0 && (i.halo?.status === 'OVERDUE' || d >= -OVERDUE_DAYS);
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function classNext(items: Item[], today: DateStr, tz: string): { next: Item | null; overdue: Item[] } {
  const overdue = overdueOf(items, today, tz);
  if (overdue.length) return { next: overdue[0], overdue };
  const next = items.filter((i) => !isWorkDone(i) && dateOf(i.dueAt, tz) >= today).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null;
  return { next, overdue };
}

/** "today", "tomorrow", "Oct 9", or for overdue work "2 days late". */
export function whenLine(i: Item, today: DateStr, tz: string, fmt: (d: DateStr) => string): string {
  const d = diffDays(today, dateOf(i.dueAt, tz));
  if (d < 0) return `${-d} ${d === -1 ? 'day' : 'days'} late`;
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : fmt(dateOf(i.dueAt, tz));
}
