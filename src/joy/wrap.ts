import { addDays, dateOf } from '../domain/dates';
import type { DateStr, Item } from '../domain/types';
import { isWorkDone } from './joy';

/**
 * The Sunday wrap (2026-10-02): what was turned in Monday through Sunday, in the assignments' own points, and "Best
 * week yet" only when it is true: at least one earlier week with work in it, and more points than every one of them.
 */
export interface Wrap {
  weekStart: DateStr;
  weekEnd: DateStr;
  turnedIn: number;
  points: number;
  best: boolean;
}

const finishedDay = (i: Item, tz: string): DateStr | null => {
  if (!isWorkDone(i)) return null;
  const at = i.halo?.submittedAt ?? (i.status === 'done' ? i.completedAt : null);
  return at && !Number.isNaN(Date.parse(at)) ? dateOf(at, tz) : null;
};

/** The week that ends on `sunday` (Monday to Sunday). */
export function weekWrap(items: Item[], sunday: DateStr, tz: string): Wrap {
  const weekStart = addDays(sunday, -6);
  const byWeek = new Map<DateStr, number>();
  let turnedIn = 0;
  let points = 0;
  for (const i of items) {
    if (i.type === 'participation') continue;
    const d = finishedDay(i, tz);
    if (!d || d > sunday) continue;
    if (d >= weekStart) {
      turnedIn += 1;
      points += i.points;
    } else {
      // Which earlier Monday-to-Sunday week it fell in.
      const back = Math.ceil((Date.parse(`${weekStart}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / (7 * 86_400_000));
      const wk = addDays(weekStart, -7 * back);
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + i.points);
    }
  }
  const earlier = [...byWeek.values()].filter((p) => p > 0);
  const best = earlier.length > 0 && points > Math.max(...earlier);
  return { weekStart, weekEnd: sunday, turnedIn, points, best };
}

export function wrapLine(w: Wrap, which: 'This week' | 'Last week'): string | null {
  if (w.turnedIn === 0) return null;
  return `${which}: ${w.turnedIn} ${w.turnedIn === 1 ? 'thing' : 'things'} turned in, ${w.points} pts.${w.best ? ' Best week yet.' : ''}`;
}
