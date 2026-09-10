import { addDays, dateOf, diffDays, fmtMinutes, weekdayOf } from './dates';
import type { Schedule } from './schedule';
import type { DateStr, Item, Settings } from './types';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEAVY_COUNT = 4;
const ms = (iso: string) => new Date(iso).getTime();

const isSnoozed = (i: Item, today: DateStr) => !!i.snoozedUntil && i.snoozedUntil > today;

/**
 * What to do next: overdue first (by the real due date), then the derived deadline,
 * then the longer job, then the bigger one. Snoozed items sink to the back; done are excluded.
 */
export function rankItems(items: Item[], schedule: Schedule, now: string, tz: string): Item[] {
  const nowMs = ms(now);
  const today = dateOf(now, tz);
  const dl = (i: Item) => schedule.byItem[i.id]?.deadlineDay ?? i.dueAt.slice(0, 10);
  return items
    .filter((i) => i.status !== 'done')
    .sort((a, b) => {
      const as = isSnoozed(a, today) ? 1 : 0;
      const bs = isSnoozed(b, today) ? 1 : 0;
      if (as !== bs) return as - bs;
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

function dayName(today: DateStr, d: DateStr): string {
  const k = diffDays(today, d);
  return k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : WEEKDAY_LONG[weekdayOf(d)];
}

/** The plain sentence at the top: what today actually holds. */
export function todayLine(items: Item[], schedule: Schedule, today: DateStr, now: string, tz: string): string {
  const open = items.filter((i) => i.status !== 'done');
  if (open.length === 0) return 'Nothing open.';
  const nowMs = ms(now);
  const overdue = open.filter((i) => ms(i.dueAt) < nowMs).length;
  const dueToday = open.filter((i) => ms(i.dueAt) >= nowMs && dateOf(i.dueAt, tz) === today).length;
  if (overdue || dueToday) {
    const parts = [];
    if (overdue) parts.push(`${overdue} overdue`);
    if (dueToday) parts.push(`${dueToday} due today`);
    return `${parts.join(', ')}.`;
  }
  const next = open.map((i) => schedule.byItem[i.id]?.deadlineDay ?? dateOf(i.dueAt, tz)).filter((d) => d > today).sort()[0];
  if (!next) return 'Nothing due today.';
  const count = open.filter((i) => (schedule.byItem[i.id]?.deadlineDay ?? dateOf(i.dueAt, tz)) === next).length;
  return `Nothing due today. Next deadline ${dayName(today, next)}, ${count} thing${count === 1 ? '' : 's'}.`;
}

export type HeroFraming = 'overdue' | 'now' | 'ahead';

/** "Do this now" vs "get ahead on this": has its window opened yet? */
export function heroFraming(item: Item, schedule: Schedule, today: DateStr, now: string): HeroFraming {
  if (ms(item.dueAt) < ms(now)) return 'overdue';
  const s = schedule.byItem[item.id];
  if (!s) return 'now';
  return s.deadlineDay <= today || s.startBy <= today ? 'now' : 'ahead';
}

const BIG_POINTS = 100;
const BIG_MINUTES = 120;
export const isBigWork = (i: Item) => i.points >= BIG_POINTS || i.estimatedMinutes >= BIG_MINUTES;

/**
 * One sentence, only when it is actionable: a big item whose start-by window is open and
 * untouched, or a heavy day coming with nothing started. Otherwise null.
 */
export function pressureLine(items: Item[], schedule: Schedule, settings: Settings, today: DateStr, _now: string): string | null {
  const tz = settings.timezone;
  const open = items.filter((i) => i.status !== 'done' && i.type !== 'participation');

  const bigOpen = open
    .filter((i) => i.status === 'todo' && isBigWork(i) && (schedule.byItem[i.id]?.startBy ?? '9999') <= today)
    .sort((a, b) => (schedule.byItem[a.id]?.deadlineDay ?? '').localeCompare(schedule.byItem[b.id]?.deadlineDay ?? ''));
  if (bigOpen.length > 0) {
    const i = bigOpen[0];
    const d = schedule.byItem[i.id].deadlineDay;
    const k = diffDays(today, d);
    const when = k <= 0 ? 'today' : k === 1 ? 'tomorrow' : WEEKDAY_LONG[weekdayOf(d)];
    return `${i.label} is inside its start window — ~${fmtMinutes(i.estimatedMinutes)}, due ${when}. Start today.`;
  }

  for (let k = 0; k < 7; k++) {
    const d = addDays(today, k);
    const due = open.filter((i) => dateOf(i.dueAt, tz) === d);
    if (due.length < HEAVY_COUNT) continue;
    if (due.some((i) => i.status !== 'todo')) continue;
    const hours = fmtMinutes(due.reduce((a, i) => a + i.estimatedMinutes, 0));
    return `${dayName(today, d)} is heavy: ${due.length} things, ~${hours}. Nothing started yet.`;
  }
  return null;
}

export interface DeadlineGroup {
  day: DateStr;
  items: Item[];
}

/** Keep the ranked order, but bucket by deadline day for headings. */
export function groupByDeadline(ranked: Item[], schedule: Schedule): DeadlineGroup[] {
  const groups: DeadlineGroup[] = [];
  for (const i of ranked) {
    const day = schedule.byItem[i.id]?.deadlineDay ?? i.dueAt.slice(0, 10);
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(i);
    else groups.push({ day, items: [i] });
  }
  return groups.sort((a, b) => a.day.localeCompare(b.day));
}

export function termProgress(items: Item[], term: { start: DateStr; end: DateStr }, today: DateStr): { earned: number; total: number; pct: number; elapsedPct: number } {
  let earned = 0;
  let total = 0;
  for (const i of items) {
    total += i.points;
    if (i.status === 'done') earned += i.score ?? i.points;
  }
  const span = Math.max(1, diffDays(term.start, term.end));
  const elapsed = Math.min(span, Math.max(0, diffDays(term.start, today)));
  return { earned, total, pct: total > 0 ? Math.round((earned / total) * 100) : 0, elapsedPct: Math.round((elapsed / span) * 100) };
}
