import { addDays, dateOf, weekStart } from '../domain/dates';
import type { DateStr, Item } from '../domain/types';
import { isWorkDone } from './joy';

/**
 * The streak (2026-10-02): days in a row with at least one thing finished, where "finished" is Halo's own submission
 * time when there is one, else the check-off. Today not done yet never breaks it. One missed day a week is forgiven
 * (a skip day), only between two finished days. Derived from the items each time, so unchecking takes it back.
 */
export interface Streak {
  days: number;
  /** A skip day was used in the current week. */
  skipUsedThisWeek: boolean;
}

export const STREAK_MILESTONES = [3, 7, 14, 30] as const;

export function finishedDays(items: Item[], tz: string): Set<DateStr> {
  const out = new Set<DateStr>();
  for (const i of items) {
    if (!isWorkDone(i)) continue;
    const at = i.halo?.submittedAt ?? (i.status === 'done' ? i.completedAt : null);
    if (at && !Number.isNaN(Date.parse(at))) out.add(dateOf(at, tz));
  }
  return out;
}

export function streakFor(items: Item[], today: DateStr, tz: string, weekStartsOn: 0 | 1 = 1): Streak {
  const days = finishedDays(items, tz);
  const used = new Set<DateStr>();
  let n = 0;
  let d: DateStr = days.has(today) ? today : addDays(today, -1);
  for (let guard = 0; guard < 400; guard++) {
    if (days.has(d)) {
      n += 1;
      d = addDays(d, -1);
      continue;
    }
    const wk = weekStart(d, weekStartsOn);
    const prev = addDays(d, -1);
    if (n > 0 && !used.has(wk) && days.has(prev)) {
      used.add(wk);
      d = prev;
      continue;
    }
    if (n === 0 && !used.has(wk) && days.has(prev) && d === addDays(today, -1)) {
      // Yesterday missed, the day before finished: the week's skip day keeps it alive.
      used.add(wk);
      d = prev;
      continue;
    }
    break;
  }
  return { days: n, skipUsedThisWeek: used.has(weekStart(today, weekStartsOn)) };
}

/** The highest milestone reached, or 0. */
export const streakMilestone = (days: number): number => [...STREAK_MILESTONES].reverse().find((m) => days >= m) ?? 0;
