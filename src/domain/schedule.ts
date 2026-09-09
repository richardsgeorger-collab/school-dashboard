import { addDays, dateOf, diffDays, eachDay, isWeekend, weekStart, zonedParts } from './dates';
import type { DateStr, Item, Risk, Settings } from './types';

export interface ScheduledItem {
  itemId: string;
  startBy: DateStr;
  latestStart: DateStr;
  deadlineDay: DateStr;
  risk: Risk;
  fits: boolean;
  plannedByDay: Record<DateStr, number>;
}

export interface Schedule {
  byItem: Record<string, ScheduledItem>;
  loadByDay: Record<DateStr, number>;
  capacityByDay: Record<DateStr, number>;
  /** weekStart -> { [courseId]: minutes, total: minutes } */
  weekLoad: Record<DateStr, Record<string, number>>;
}

/** Items this small are done in one sitting: no allocation, start the day before. */
export const TINY_MINUTES = 45;
const EVENING_CUTOFF = 18 * 60;
const DUE_SOON_MS = 48 * 3_600_000;

/** Last calendar day the work can happen. Due before 6 PM means the night before. */
export function deadlineDay(item: Pick<Item, 'dueAt'>, tz: string): DateStr {
  const p = zonedParts(item.dueAt, tz);
  const d = dateOf(item.dueAt, tz);
  return p.hh * 60 + p.mm < EVENING_CUTOFF ? addDays(d, -1) : d;
}

/** Safety margin between the planned finish and the deadline. */
function bufferDays(minutes: number): number {
  return minutes <= 240 ? 1 : 2;
}

export function dayCapacity(settings: Pick<Settings, 'weekdayMinutes' | 'weekendMinutes'>, day: DateStr): number {
  return isWeekend(day) ? settings.weekendMinutes : settings.weekdayMinutes;
}

const maxDate = (...ds: DateStr[]) => ds.reduce((a, b) => (b > a ? b : a));
const minDate = (...ds: DateStr[]) => ds.reduce((a, b) => (b < a ? b : a));

export function computeSchedule(
  items: Item[],
  settings: Settings,
  today: DateStr,
  term: { start: DateStr; end: DateStr },
  now: string = new Date().toISOString(),
): Schedule {
  const tz = settings.timezone;
  const nowMs = new Date(now).getTime();

  const deadlines = new Map<string, DateStr>();
  for (const it of items) deadlines.set(it.id, deadlineDay(it, tz));

  const from = minDate(today, term.start);
  let to = maxDate(term.end, today);
  for (const dd of deadlines.values()) if (dd > to) to = dd;

  const capacityByDay: Record<DateStr, number> = {};
  for (const d of eachDay(from, to)) {
    capacityByDay[d] = dayCapacity(settings, d);
  }
  const free: Record<DateStr, number> = { ...capacityByDay };
  const loadByDay: Record<DateStr, number> = {};
  const weekLoad: Schedule['weekLoad'] = {};
  const byItem: Record<string, ScheduledItem> = {};

  const addLoad = (item: Item, day: DateStr, minutes: number, planned: Record<DateStr, number>) => {
    planned[day] = (planned[day] ?? 0) + minutes;
    loadByDay[day] = (loadByDay[day] ?? 0) + minutes;
    const wk = weekStart(day, settings.weekStartsOn);
    const row = (weekLoad[wk] ??= { total: 0 });
    row[item.courseId] = (row[item.courseId] ?? 0) + minutes;
    row.total += minutes;
  };

  // An open date only constrains the work when it is a real window (opens at least a day
  // before it is due). In-class quizzes and labs "open" the morning they happen.
  const windowStart = (item: Item): DateStr | null => {
    const rawOpens = item.opensAt ? dateOf(item.opensAt, tz) : null;
    return rawOpens && diffDays(rawOpens, dateOf(item.dueAt, tz)) > 0 ? rawOpens : null;
  };

  // Latest-deadline first so later work claims later days. Items boxed into an open window
  // go first within that order: unconstrained work can always slide earlier, they cannot.
  const byDeadlineDesc = (a: Item, b: Item) =>
    deadlines.get(b.id)!.localeCompare(deadlines.get(a.id)!) || b.points - a.points;
  const pending = items.filter((i) => i.status !== 'done');
  const open = [
    ...pending.filter((i) => windowStart(i) !== null).sort(byDeadlineDesc),
    ...pending.filter((i) => windowStart(i) === null).sort(byDeadlineDesc),
  ];

  for (const item of open) {
    const dd = deadlines.get(item.id)!;
    const opensDay = windowStart(item);
    const floor = maxDate(today, opensDay ?? from, from);
    const planned: Record<DateStr, number> = {};
    let latestStart = dd;
    let fits = true;

    if (item.estimatedMinutes > TINY_MINUTES) {
      // Aim to finish a buffer before the deadline; spill into the buffer days only if needed.
      let end = addDays(dd, -bufferDays(item.estimatedMinutes));
      if (end < floor) end = dd;
      let remaining = item.estimatedMinutes;
      const take = (day: DateStr) => {
        const avail = free[day] ?? 0;
        if (avail <= 0 || remaining <= 0) return;
        const t = Math.min(avail, remaining);
        free[day] = avail - t;
        remaining -= t;
        if (day < latestStart) latestStart = day;
        addLoad(item, day, t, planned);
      };
      latestStart = end;
      for (let day = end; remaining > 0 && day >= floor; day = addDays(day, -1)) take(day);
      for (let day = addDays(end, 1); remaining > 0 && day <= dd; day = addDays(day, 1)) take(day);
      if (remaining > 0) {
        fits = false;
        const dumpDay = floor > dd ? today : floor;
        addLoad(item, dumpDay, remaining, planned);
        if (dumpDay < latestStart) latestStart = dumpDay;
      }
      if (Object.keys(planned).length === 0) latestStart = dd;
    }

    let startBy = item.estimatedMinutes > TINY_MINUTES ? latestStart : addDays(dd, -1);
    if (opensDay && startBy < opensDay) startBy = opensDay;
    if (item.startByOverride) startBy = item.startByOverride;

    const dueMs = new Date(item.dueAt).getTime();
    let risk: Risk = null;
    if (dueMs < nowMs) risk = 'overdue';
    else if (!fits || (item.status === 'todo' && latestStart < today)) risk = 'at_risk';
    else if (dueMs - nowMs <= DUE_SOON_MS) risk = 'due_soon';
    else if (item.status === 'todo' && startBy <= today) risk = 'start_today';

    byItem[item.id] = { itemId: item.id, startBy, latestStart, deadlineDay: dd, risk, fits, plannedByDay: planned };
  }

  for (const item of items) {
    if (item.status !== 'done') continue;
    const dd = deadlines.get(item.id)!;
    byItem[item.id] = { itemId: item.id, startBy: dd, latestStart: dd, deadlineDay: dd, risk: null, fits: true, plannedByDay: {} };
  }

  return { byItem, loadByDay, capacityByDay, weekLoad };
}
