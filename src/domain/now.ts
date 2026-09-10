import { addDays, dateOf, fmtMinutes, weekdayOf } from './dates';
import { dayCapacity, type Schedule } from './schedule';
import type { DateStr, Item, Settings } from './types';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEAVY_COUNT = 4;
const ms = (iso: string) => new Date(iso).getTime();

/**
 * What to do next: overdue first (by the real due date), then the derived deadline,
 * then the longer job, then the bigger one. Done items are excluded.
 */
export function rankItems(items: Item[], schedule: Schedule, now: string, _tz: string): Item[] {
  const nowMs = ms(now);
  const dl = (i: Item) => schedule.byItem[i.id]?.deadlineDay ?? i.dueAt.slice(0, 10);
  return items
    .filter((i) => i.status !== 'done')
    .sort((a, b) => {
      const ao = ms(a.dueAt) < nowMs ? 0 : 1;
      const bo = ms(b.dueAt) < nowMs ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (ao === 0 && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      const d = dl(a).localeCompare(dl(b));
      if (d !== 0) return d;
      if (a.estimatedMinutes !== b.estimatedMinutes) return b.estimatedMinutes - a.estimatedMinutes;
      if (a.points !== b.points) return b.points - a.points;
      return a.dueAt.localeCompare(b.dueAt);
    });
}

/** One calm sentence when something is pressing; null when things are fine. */
export function pressureLine(items: Item[], schedule: Schedule, settings: Settings, today: DateStr, now: string): string | null {
  const tz = settings.timezone;
  const nowMs = ms(now);
  const open = items.filter((i) => i.status !== 'done');

  const overdue = open.filter((i) => ms(i.dueAt) < nowMs);
  if (overdue.length > 0) {
    const first = rankItems(items, schedule, now, tz)[0];
    return `${overdue.length} overdue. ${first.label} first.`;
  }

  const atRisk = open.filter((i) => schedule.byItem[i.id]?.risk === 'at_risk');
  if (atRisk.length > 0) {
    const i = rankItems(atRisk, schedule, now, tz)[0];
    const day = schedule.byItem[i.id].deadlineDay;
    return `${i.label} won't fit before ${WEEKDAY_LONG[weekdayOf(day)]} unless you start now.`;
  }

  for (let k = 0; k < 7; k++) {
    const d = addDays(today, k);
    const due = items.filter((i) => dateOf(i.dueAt, tz) === d);
    const openDue = due.filter((i) => i.status !== 'done');
    const planned = schedule.loadByDay[d] ?? 0;
    if (openDue.length >= HEAVY_COUNT || (planned >= dayCapacity(settings, d) && openDue.length > 0)) {
      const hours = fmtMinutes(due.reduce((a, i) => a + i.estimatedMinutes, 0));
      const done = due.filter((i) => i.status === 'done').length;
      const touched = due.some((i) => i.status !== 'todo');
      const dayName = k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : WEEKDAY_LONG[weekdayOf(d)];
      const tail = touched ? `${done} of ${due.length} done.` : "You haven't started any.";
      return `${dayName} is heavy: ${due.length} items, ${hours}. ${tail}`;
    }
  }
  return null;
}

export function termProgress(items: Item[]): { earned: number; total: number; pct: number } {
  let earned = 0;
  let total = 0;
  for (const i of items) {
    total += i.points;
    if (i.status === 'done') earned += i.score ?? i.points;
  }
  return { earned, total, pct: total > 0 ? Math.round((earned / total) * 100) : 0 };
}
