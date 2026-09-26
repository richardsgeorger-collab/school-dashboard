import { addDays, dateOf, diffDays, fmtMinutes, fmtTime, weekdayOf } from './dates';
import { isNoise } from './requirements';
import type { Schedule } from './schedule';
import { effectivePoints, gatingLine } from './gating';
import type { DerivedDeadline } from './deadlines';
import { startPhrase as sp } from './nextClass';
import type { DateStr, Item, Settings } from './types';

export const startPhrase = sp;

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEAVY_COUNT = 4;
const ms = (iso: string) => new Date(iso).getTime();

const isSnoozed = (i: Item, today: DateStr) => !!i.snoozedUntil && i.snoozedUntil > today;
/** Waiting on someone else, and the wait has not run out: it is not on Now and it is not late. */
export const isBlocked = (i: Item, today: DateStr) => !!i.blocked && i.blocked.until > today;

/**
 * What to do next: overdue first (by the real due date), then the derived deadline,
 * then the longer job, then the bigger one. Snoozed items sink to the back; done are excluded.
 */
export function rankItems(items: Item[], schedule: Schedule, now: string, tz: string): Item[] {
  const nowMs = ms(now);
  const today = dateOf(now, tz);
  // A derived deadline can cascade into the past (a Sunday post pulled to Saturday, then a day earlier for a crowded
  // day, then two days for "post, then reply"). That says "today", not "before today": clamped, so a 5-point post
  // never outranks a 175-point paper due tomorrow by being further past a date nobody set.
  const clamp = (d: DateStr) => (d < today ? today : d);
  const dl = (i: Item) => clamp(schedule.byItem[i.id]?.deadlineDay ?? i.dueAt.slice(0, 10));
  const pts = (i: Item) => effectivePoints(i, items);
  // The day a thing needs attention: its deadline, or today once its start window has opened and it is big. Started
  // counts as much as untouched: pressing Start must never make the thing leave the screen.
  const attention = (i: Item) => {
    const sb = schedule.byItem[i.id]?.startBy;
    return sb && sb <= today && (pts(i) >= 100 || i.estimatedMinutes >= 180) ? today : dl(i);
  };
  return items
    .filter((i) => i.status !== 'done' && !isBlocked(i, today))
    .sort((a, b) => {
      const as = isSnoozed(a, today) ? 1 : 0;
      const bs = isSnoozed(b, today) ? 1 : 0;
      if (as !== bs) return as - bs;
      const ao = ms(a.dueAt) < nowMs ? 0 : 1;
      const bo = ms(b.dueAt) < nowMs ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (ao === 0 && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      const att = attention(a).localeCompare(attention(b));
      if (att !== 0) return att;
      // Both need attention the same day: the real due date decides, then the bigger thing. A derived deadline gets
      // something onto today's list; it does not get a 5-point post ahead of a 175-point paper due tomorrow.
      const due = clamp(dateOf(a.dueAt, tz)).localeCompare(clamp(dateOf(b.dueAt, tz)));
      if (due !== 0) return due;
      if (a.estimatedMinutes !== b.estimatedMinutes) return b.estimatedMinutes - a.estimatedMinutes;
      if (pts(a) !== pts(b)) return pts(b) - pts(a);
      const d = dl(a).localeCompare(dl(b));
      if (d !== 0) return d;
      return a.dueAt.localeCompare(b.dueAt);
    });
}

function dayName(today: DateStr, d: DateStr): string {
  const k = diffDays(today, d);
  return k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : WEEKDAY_LONG[weekdayOf(d)];
}

const deadlineOf = (i: Item, schedule: Schedule) => schedule.byItem[i.id]?.deadlineDay ?? i.dueAt.slice(0, 10);

/** Open work per deadline day. The single source every count on Now reads from. */
export function openCountByDay(items: Item[], schedule: Schedule, today?: DateStr): Record<DateStr, number> {
  const out: Record<DateStr, number> = {};
  for (const i of items) {
    if (i.status === 'done' || (today && isBlocked(i, today))) continue;
    const d = deadlineOf(i, schedule);
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

/** The plain sentence at the top: what today actually holds. */
export function todayLine(items: Item[], schedule: Schedule, today: DateStr, now: string, tz: string): string {
  const open = items.filter((i) => i.status !== 'done' && !isBlocked(i, today));
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
  const counts = openCountByDay(items, schedule);
  const next = Object.keys(counts).filter((d) => d > today).sort()[0];
  if (!next) return 'Nothing due today.';
  const count = counts[next];
  return `Nothing due today. Next deadline ${lowerRel(dayName(today, next))}, ${count} thing${count === 1 ? '' : 's'}.`;
}

/**
 * The one sentence at the top of Now: "You're on track." or "2 things need you." A thing needs you when it is
 * overdue, or due within a day and not started. The risk line ("100 pts due today, not started") can only name an
 * item that is due within a day and not started, so whenever it speaks this line says "need you": the two cannot
 * contradict. "Today's done." is todayDone(): everything due today done and nothing overdue.
 */
export function statusLine(items: Item[], today: DateStr, now: string, tz: string): { text: string; needs: number; tone: 'late' | null } {
  const work = items.filter((i) => i.type !== 'participation' && !isNoise(i) && i.status !== 'done' && !isBlocked(i, today));
  const nowMs = ms(now);
  const overdue = work.filter((i) => ms(i.dueAt) < nowMs).length;
  const soon = work.filter((i) => ms(i.dueAt) >= nowMs && ms(i.dueAt) - nowMs <= 24 * 60 * 60 * 1000 && i.status === 'todo').length;
  const needs = overdue + soon;
  if (needs > 0) return { text: `${needs} thing${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you.`, needs, tone: overdue > 0 ? 'late' : null };
  if (todayDone(items, today, now, tz)) return { text: "Today's done.", needs: 0, tone: null };
  if (work.length === 0) return { text: 'Nothing open.', needs: 0, tone: null };
  return { text: "You're on track.", needs: 0, tone: null };
}

/** One line under the hero saying why it is the hero. */
/** "Today" and "Tomorrow" read as words mid-sentence; weekday names keep their capital. */
function lowerRel(name: string): string {
  return name === 'Today' || name === 'Tomorrow' ? name.toLowerCase() : name;
}

export function pickReason(item: Item, items: Item[], schedule: Schedule, today: DateStr, now: string, tz: string, derived: Record<string, DerivedDeadline>): string {
  const gate = gatingLine(item, items, tz);
  // "Small" is a claim the chips can check: only a half-hour thing gets called small.
  if (gate) return item.estimatedMinutes <= 30 ? `Picked because it's small and it gates bigger work. ${gate}` : `Picked because it gates bigger work. ${gate}`;
  if (ms(item.dueAt) < ms(now)) return `Picked because it was due ${WEEKDAY_LONG[weekdayOf(dateOf(item.dueAt, tz))]} and is still open.`;
  const due = dateOf(item.dueAt, tz);
  if (due === today) return "Picked because it's due today.";
  const s = schedule.byItem[item.id];
  const deadline = s?.deadlineDay ?? due;
  // An early due time pulls the work to the night before; say the real due day and time, not "due today".
  const dueWord =
    derived[item.id] && deadline !== due
      ? `it needs to be in by ${WEEKDAY_LONG[weekdayOf(deadline)]}`
      : deadline !== due
        ? `due ${lowerRel(dayName(today, due))} by ${fmtTime(item.dueAt, tz)}`
        : `due ${lowerRel(dayName(today, deadline))}`;
  const others = (openCountByDay(items, schedule)[deadline] ?? 1) - 1;
  const windowOpen = s ? s.startBy <= today : false;
  const alone = windowOpen && !items.some((o) => o.id !== item.id && o.status === 'todo' && (schedule.byItem[o.id]?.startBy ?? '9999') <= today);
  const tail = others > 0 ? `and ${others} other thing${others === 1 ? '' : 's'} land${others === 1 ? 's' : ''} that day` : alone ? "and it's the only thing in its start window" : windowOpen ? 'and its start window is open' : "and it's the next thing up";
  return `Picked because it's ~${fmtMinutes(item.estimatedMinutes)}, ${dueWord}, ${tail}.`;
}

/**
 * "Today's done" is earned: everything due today is done and nothing is overdue. Any screen that says the day is
 * done must use this, so a banner about work still open today can never sit under that title.
 */
export function todayDone(items: Item[], today: DateStr, now: string, tz: string): boolean {
  const work = items.filter((i) => i.type !== 'participation' && !isNoise(i));
  if (work.some((i) => i.status !== 'done' && ms(i.dueAt) < ms(now))) return false;
  const due = work.filter((i) => dateOf(i.dueAt, tz) === today);
  return due.length > 0 && due.every((i) => i.status === 'done');
}

export type NowMode = { mode: 'urgent' } | { mode: 'fine'; daysUntilNext: number } | { mode: 'enough' } | { mode: 'empty' };

/**
 * Which face Now shows: something urgent, "you're fine" (nothing due for 2+ days and no
 * pressure), "enough for today" (just finished, and today asks nothing more), or empty.
 */
export function nowMode(items: Item[], schedule: Schedule, settings: Settings, today: DateStr, now: string, justFinished = false): NowMode {
  const open = items.filter((i) => i.status !== 'done' && !isNoise(i) && !isBlocked(i, today));
  if (open.length === 0) return { mode: 'empty' };
  const nowMs = ms(now);
  const overdue = open.some((i) => ms(i.dueAt) < nowMs);
  const next = Object.keys(openCountByDay(open, schedule)).sort()[0];
  const daysUntilNext = next ? diffDays(today, next) : 999;
  const pressing = pressureLine(open, schedule, settings, today, now) !== null;
  if (overdue || daysUntilNext <= 0 || pressing) return { mode: 'urgent' };
  const plannedToday = schedule.loadByDay[today] ?? 0;
  if (justFinished && plannedToday === 0 && daysUntilNext >= 1) return { mode: 'enough' };
  if (daysUntilNext >= 2) return { mode: 'fine', daysUntilNext };
  return { mode: 'urgent' };
}

/** A first bite for anything over 90 minutes, and the day the plan finishes it. */
export function chunkSuggestion(item: Item, schedule: Schedule, today: DateStr): { chunk: number; text: string } | null {
  if (item.estimatedMinutes <= 90) return null;
  const chunk = item.estimatedMinutes >= 240 ? 60 : 45;
  const planned = Object.keys(schedule.byItem[item.id]?.plannedByDay ?? {}).sort();
  const finish = planned.at(-1) ?? schedule.byItem[item.id]?.deadlineDay ?? item.dueAt.slice(0, 10);
  const finishWord = finish <= today ? 'today' : diffDays(today, finish) === 1 ? 'tomorrow' : WEEKDAY_LONG[weekdayOf(finish)];
  return { chunk, text: `~${fmtMinutes(item.estimatedMinutes)} total — do ${chunk} min tonight, finish ${finishWord}.` };
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
export const isBigWork = (i: Item, items: Item[] = []) => effectivePoints(i, items) >= BIG_POINTS || i.estimatedMinutes >= BIG_MINUTES;

/**
 * One sentence, only when it is actionable: a big item whose start-by window is open and
 * untouched, or a heavy day coming with nothing started. Otherwise null.
 */
export function pressureLine(items: Item[], schedule: Schedule, settings: Settings, today: DateStr, _now: string): string | null {
  const tz = settings.timezone;
  const open = items.filter((i) => i.status !== 'done' && !isNoise(i));

  const bigOpen = open
    .filter((i) => i.status === 'todo' && isBigWork(i, items) && (schedule.byItem[i.id]?.startBy ?? '9999') <= today)
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
