import { dateOf, diffDays } from './dates';
import { isNoise } from './requirements';
import { isWorkDone } from '../joy/joy';
import type { DateStr, Item } from './types';

/**
 * The Cooked meter (rebuilt 2026-10-04, George: "isn't accurate"). It means one thing: how much unfinished work this
 * class needs from you in the next 7 days, in hours.
 *
 * - Counts only work that is still owed: not submitted or graded on Halo, not checked off here (joy.isWorkDone, the
 *   same rule as the class progress bar), and not an unexplained participation check-in.
 * - Counts what is due today through six days from now, and anything overdue from the last two weeks (older than that
 *   is history, not this week's load).
 * - Weighs each by its time estimate (the same ~estimate the rows show, calibrated by your own timings when there are
 *   enough). Something already started counts half. Overdue counts 1.5x, and due in the next 48 hours 1.25x.
 * - Green under 3 weighted hours, yellow from 3, red from 6. The bar is full at 9. Nothing owed is green.
 *
 * The old meter scored kinds of work (an essay was 5 whatever its length) over 14 days, so a class with 3 hours of
 * real work this week could read Cooked from what was due the week after.
 */
export type CookLevel = 'green' | 'yellow' | 'red';

export const WINDOW_DAYS = 7;
const OVERDUE_LOOKBACK = 14;
export const YELLOW_AT = 3;
export const RED_AT = 6;
const FULL_AT = 9;

export interface Cook {
  level: CookLevel;
  /** 0 to 1, how full the bar is. */
  fill: number;
  /** Weighted hours: the estimate, with the bumps for overdue and due soon. */
  load: number;
  /** Plain hours of work owed (the estimates, not weighted). */
  hours: number;
  items: number;
  overdue: number;
  soon: number;
  /** One line on why: "4 items, ~5h this week, 1 overdue". */
  why: string;
}

const fmtHours = (h: number): string => (h < 1 ? `~${Math.max(5, Math.round((h * 60) / 5) * 5)}m` : `~${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)}h`);

/** `minutesOf` gives an item's estimate (the store's calibrated one in the app); the raw estimate otherwise. */
export function cookMeter(items: Item[], today: DateStr, tz: string, minutesOf: (i: Item) => number = (i) => i.estimatedMinutes): Cook {
  let load = 0;
  let minutes = 0;
  let n = 0;
  let overdue = 0;
  let soon = 0;
  for (const i of items) {
    if (isWorkDone(i) || isNoise(i)) continue;
    const days = diffDays(today, dateOf(i.dueAt, tz));
    if (days >= WINDOW_DAYS || days < -OVERDUE_LOOKBACK) continue;
    const m = Math.max(0, minutesOf(i) || 0) * (i.status === 'in_progress' ? 0.5 : 1);
    const bump = days < 0 ? 1.5 : days <= 1 ? 1.25 : 1;
    if (days < 0) overdue += 1;
    else if (days <= 1) soon += 1;
    n += 1;
    minutes += m;
    load += (m / 60) * bump;
  }
  const hours = minutes / 60;
  load = Math.round(load * 100) / 100;
  const level: CookLevel = load >= RED_AT ? 'red' : load >= YELLOW_AT ? 'yellow' : 'green';
  // Nothing owed this week still shows: a short green bar, not an empty grey track that reads as broken.
  const fill = Math.max(0.06, Math.min(1, load / FULL_AT));
  const why =
    n === 0
      ? 'Nothing due in the next 7 days.'
      : [`${n} ${n === 1 ? 'item' : 'items'}, ${fmtHours(hours)} this week`, overdue ? `${overdue} overdue` : '', soon ? `${soon} due in the next 48 hours` : ''].filter(Boolean).join(', ') + '.';
  return { level, fill, load, hours, items: n, overdue, soon, why };
}
