import { addDays, dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from './dates';
import { nextMeeting } from './nextClass';
import { shareLine } from './share';
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
export function heroFacts(item: Item, items: Item[], minutes: number, tz: string, today: DateStr, finishBy?: string | null): Fact[] {
  const out: Fact[] = [];
  if (item.points > 0) {
    const share = shareLine(item, items);
    out.push({ text: share ? `${item.points} pts · ${share}` : `${item.points} pts` });
  }
  out.push({ text: `~${fmtMinutes(minutes)}` });
  const d = dateOf(item.dueAt, tz);
  const time = fmtTime(item.dueAt, tz);
  const k = diffDays(today, d);
  const when = k === 0 ? 'today' : k === 1 ? 'tomorrow' : k < 0 ? `was ${fmtDate(d, 'short')}` : fmtDate(d, 'long');
  out.push({ text: `due ${when}${time !== '11:59 PM' ? ` ${time}` : ''}` });
  // A derived deadline (LopesWrite processing, a class the day before) is a second chip, so the why line and the
  // chips name the same day.
  if (finishBy) {
    const f = dateOf(finishBy, tz);
    // Only while it still helps: a finish-by day that has passed is noise next to "was due".
    if (f < d && f >= today) out.push({ text: `finish by ${diffDays(today, f) === 0 ? 'today' : diffDays(today, f) === 1 ? 'tomorrow' : fmtDate(f, 'short')}` });
  }
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
  if (free <= 0) return `Every hour you normally work before this is due is already taken by something else. Start it anyway: the first step is short.`;
  const days = diffDays(today, end) + 1;
  const over = minutes > free;
  if (over) return `It takes about ${fmtMinutes(minutes)} and you have about ${fmtMinutes(free)} free before it is due. That is not enough, so start today.`;
  return `About ${fmtMinutes(minutes)} of work, and about ${fmtMinutes(free)} free ${days === 1 ? 'today' : `over the next ${days} days`}. It fits.`;
}

export const HALO_HOME = 'https://halo.gcu.edu/';

/**
 * Where to go to hand this in, as close to the assignment as Halo's own pages allow. Halo has no page for a single
 * assignment: its routes (read from its build manifest, 2026-09-29) are /quiz/[assessmentId] for a quiz, and
 * /courses/[slugId]/course-units/[courseUnitId] for the topic an assignment sits on, whose page lists it. So: a quiz
 * opens its quiz page, anything else its topic page, then the class page, then Halo's home. Never a guessed URL.
 */
export function haloLink(item: Item, course: { code?: string; haloSlugId?: string | null } | undefined): { href: string; label: string } {
  // A calendar-feed link in the /courses/…/assessments/… shape is not a Halo page (it answers 404), so it never wins.
  if (item.url && !/halo\.gcu\.edu\/courses\/[^/]+\/assessments\//.test(item.url)) return { href: item.url, label: 'Open in Halo' };
  const slug = course?.haloSlugId;
  if (item.haloId && item.haloType === 'QUIZ') return { href: `${HALO_HOME}quiz/${encodeURIComponent(item.haloId)}`, label: 'Open in Halo' };
  if (slug && item.haloUnitId) return { href: `${HALO_HOME}courses/${encodeURIComponent(slug)}/course-units/${encodeURIComponent(item.haloUnitId)}`, label: 'Open in Halo' };
  if (slug) return { href: `${HALO_HOME}courses/${encodeURIComponent(slug)}`, label: course?.code ? `Open ${course.code} in Halo` : 'Open in Halo' };
  return { href: HALO_HOME, label: course?.code ? `Open ${course.code} in Halo` : 'Open Halo' };
}

/** "Started 12 min ago" for the timer. */
export function elapsedLine(startedAt: string | null | undefined, now: string): string | null {
  if (!startedAt) return null;
  const min = Math.max(0, Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 60_000));
  return min < 1 ? 'Just started' : `Started ${fmtMinutes(min)} ago`;
}

export const elapsedMinutes = (startedAt: string | null | undefined, now: string): number => (startedAt ? Math.max(0, Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 60_000)) : 0);
