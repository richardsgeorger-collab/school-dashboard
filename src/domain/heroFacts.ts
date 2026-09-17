import { addDays, dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from './dates';
import { nextMeeting } from './nextClass';
import type { Schedule } from './schedule';
import type { Course, DateStr, Item } from './types';

/**
 * Facts for the hero instead of urgency: what it is worth, how long it takes, when it is due, what it feeds, what it
 * needs, and whether it fits the time actually free. Nothing here counts down or turns red.
 */
export interface Fact {
  text: string;
  /** For a fact that names another item, so it can be opened. */
  itemId?: string;
}

/** Points, time, due date, what it feeds, what goes through LopesWrite. In that order, only what applies. */
export function heroFacts(item: Item, items: Item[], minutes: number, tz: string, today: DateStr): Fact[] {
  const out: Fact[] = [];
  if (item.points > 0) out.push({ text: `${item.points} pts` });
  out.push({ text: `~${fmtMinutes(minutes)}` });
  const d = dateOf(item.dueAt, tz);
  const time = fmtTime(item.dueAt, tz);
  const k = diffDays(today, d);
  const when = k === 0 ? 'today' : k === 1 ? 'tomorrow' : k < 0 ? `was ${fmtDate(d, 'short')}` : fmtDate(d, 'long');
  out.push({ text: `due ${when}${time !== '11:59 PM' ? ` ${time}` : ''}` });
  const feeds = item.plan?.feeds ? items.find((i) => i.id === item.plan!.feeds) : null;
  if (feeds) out.push({ text: `feeds ${feeds.label}`, itemId: feeds.id });
  else if (item.blocks?.length) {
    const first = items.find((i) => i.id === item.blocks![0] && i.status !== 'done');
    if (first) out.push({ text: `unlocks ${first.label}${item.blocks.length > 1 ? ` +${item.blocks.length - 1}` : ''}`, itemId: first.id });
  }
  if (item.flags.lopesWrite || item.plan?.flags.lopesWrite) out.push({ text: 'goes through LopesWrite' });
  if (item.flags.group || item.plan?.flags.group) out.push({ text: 'group work' });
  if (item.flags.timed || item.plan?.flags.timed) out.push({ text: 'timed' });
  return out;
}

/**
 * Whether the work fits the time actually free: before the next class today, or across the days left before it is
 * due. One line, or nothing when there is nothing useful to say.
 */
export function fitLine(item: Item, minutes: number, schedule: Schedule, courses: Course[], today: DateStr, now: string, tz: string): string | null {
  const meeting = nextMeeting(courses, now, tz);
  if (meeting && meeting.day === today) {
    const left = Math.round((new Date(meeting.startAt).getTime() - new Date(now).getTime()) / 60_000);
    if (left > 20 && minutes <= left - 10) return `Fits before ${meeting.course.code} at ${fmtTime(meeting.startAt, tz)}.`;
    if (left > 20 && minutes > left) return `${fmtMinutes(left)} until ${meeting.course.code}: enough for the first step.`;
  }
  if (minutes < 60) return null;
  const s = schedule.byItem[item.id];
  const end = s?.deadlineDay ?? dateOf(item.dueAt, tz);
  if (end < today) return null;
  let free = 0;
  for (let d = today; d <= end; d = addDays(d, 1)) {
    const cap = schedule.capacityByDay[d] ?? 0;
    const load = (schedule.loadByDay[d] ?? 0) - (s?.plannedByDay[d] ?? 0);
    free += Math.max(0, cap - load);
  }
  if (free <= 0) return `Your usual hours before it's due are already spoken for; the first step still fits an evening.`;
  const days = diffDays(today, end) + 1;
  return `${fmtMinutes(minutes)} of work, ~${fmtMinutes(free)} free across the ${days === 1 ? 'day' : `${days} days`} before it's due.`;
}

export const HALO_HOME = 'https://halo.gcu.edu/';

/**
 * Where to go to hand this in. The export carries a direct link for some items and not others, so the fallback is
 * Halo itself: one press either way, and never a guessed URL that lands on an error page.
 */
export function haloLink(item: Item, code: string | undefined): { href: string; label: string } {
  return item.url ? { href: item.url, label: 'Open in Halo' } : { href: HALO_HOME, label: code ? `Open ${code} in Halo` : 'Open Halo' };
}

/** "Started 12 min ago" for the timer. */
export function elapsedLine(startedAt: string | null | undefined, now: string): string | null {
  if (!startedAt) return null;
  const min = Math.max(0, Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 60_000));
  return min < 1 ? 'Just started' : `Started ${fmtMinutes(min)} ago`;
}

export const elapsedMinutes = (startedAt: string | null | undefined, now: string): number => (startedAt ? Math.max(0, Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 60_000)) : 0);
