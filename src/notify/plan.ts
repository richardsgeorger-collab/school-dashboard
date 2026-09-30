import { participationThisWeek } from '../domain/participationWeek';
import { addDays, dateOf, diffDays, fmtDate, makeIso, weekdayOf } from '../domain/dates';
import { trialCalendar } from '../config/trialCalendar';
import { weekReview } from '../domain/sunday';
import { partsDueOn } from '../domain/reqClean';
import { isNoise } from '../domain/requirements';
import type { Schedule } from '../domain/schedule';
import type { Course, DateStr, Item, ReminderPrefs } from '../domain/types';

/**
 * What to tell the student, and when, for the next two days. Pure: the client computes it from the same schedule
 * the screens use and writes it to the server, which only sends what is due. Each kind has its own switch: the
 * morning note, the night-before heavy-day warning, the not-started nudge, the re-sync reminder, and on Max the
 * Sunday recap; the trial's one reminder has none.
 */
export type NoticeKind = 'morning' | 'heavy_day' | 'not_started' | 'resync' | 'trial_ends' | 'sunday' | 'participation' | 'welcome_sync';

export interface Notice {
  kind: NoticeKind;
  /** ISO instant. */
  sendAt: string;
  title: string;
  body: string;
  url: string;
  /** One per kind per day. */
  key: string;
}

export interface PlanInput {
  items: Item[];
  courses: Course[];
  schedule: Schedule;
  prefs: ReminderPrefs | undefined;
  tz: string;
  today: DateStr;
  now: string;
  lastPull: string | null;
  /** When the welcome gift started, for the one "connect Halo" reminder a few hours in. */
  trialStartedAt?: string | null;
  /** When the free trial ends, for its two reminders. */
  trialEndsAt?: string | null;
  /** What Max did during the trial, one line ("Max during your trial: read 23 announcements, …"), for those reminders. */
  trialRecap?: string | null;
  /** The plan includes the Sunday recap (Max, or the trial). */
  recap?: boolean;
}

export const DEFAULT_PREFS: Required<Pick<ReminderPrefs, 'morningTime' | 'quietFrom' | 'quietTo' | 'morning' | 'heavyDay' | 'notStarted' | 'resync' | 'sunday' | 'participation'>> = { morningTime: '07:30', quietFrom: '22:00', quietTo: '07:00', morning: true, heavyDay: true, notStarted: true, resync: true, sunday: true, participation: true };

export const RESYNC_AFTER_DAYS = 3;
const HEAVY_DUE = 3;
const NUDGE_POINTS = 20;

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const at = (day: DateStr, hhmm: string, tz: string): string => new Date(makeIso(day, HHMM.test(hhmm) ? hhmm : '08:00', tz)).toISOString();
const hhmmOf = (iso: string, tz: string): string => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** Quiet hours: anything inside them moves to the moment they end. A window that wraps midnight is handled. */
export function outsideQuiet(iso: string, tz: string, quietFrom: string, quietTo: string): string {
  const t = hhmmOf(iso, tz);
  const wraps = quietFrom > quietTo;
  const inside = wraps ? t >= quietFrom || t < quietTo : t >= quietFrom && t < quietTo;
  if (!inside) return iso;
  const day = dateOf(iso, tz);
  const endDay = wraps && t >= quietFrom ? addDays(day, 1) : day;
  return at(endDay, quietTo, tz);
}

const codeOf = (courses: Course[], id: string) => courses.find((c) => c.id === id)?.code ?? '';

export function planNotices(input: PlanInput): Notice[] {
  const p = { ...DEFAULT_PREFS, ...(input.prefs ?? {}) };
  const { items, courses, schedule, tz, today, now, lastPull } = input;
  const open = items.filter((i) => i.status !== 'done' && !isNoise(i));
  const dueOn = (day: DateStr) => open.filter((i) => dateOf(i.dueAt, tz) === day).sort((a, b) => b.points - a.points);
  // A part with its own date (a discussion's Wednesday initial post inside a Sunday assignment) is due that day too.
  const partsOn = (day: DateStr) => open.flatMap((i) => (dateOf(i.dueAt, tz) === day ? [] : partsDueOn(i, day, tz).filter((r) => r.dueAt).map((r) => ({ item: i, req: r }))));
  const out: Notice[] = [];
  const push = (n: Notice) => {
    const sendAt = outsideQuiet(n.sendAt, tz, p.quietFrom, p.quietTo);
    if (sendAt > now) out.push({ ...n, sendAt });
  };
  const tomorrow = addDays(today, 1);

  if (p.morning && p.morningTime && p.morningTime !== 'off') {
    for (const day of [today, tomorrow]) {
      const due = dueOn(day);
      const parts = partsOn(day);
      const n = due.length + parts.length;
      const next = open.filter((i) => dateOf(i.dueAt, tz) > day).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
      const first = due[0] ? `${due[0].label} (${codeOf(courses, due[0].courseId)}, ${due[0].points} pts)` : `${parts[0]?.item.label}: ${parts[0]?.req.text.replace(/\s*[.!]$/, '')} (${codeOf(courses, parts[0]?.item.courseId ?? '')})`;
      const body = n === 0 ? (next ? `Nothing due today. Next: ${next.label}, due ${fmtDate(dateOf(next.dueAt, tz), 'short')}.` : 'Nothing due today.') : `${n} due today. First: ${first}.`;
      push({ kind: 'morning', sendAt: at(day, p.morningTime, tz), title: day === today ? 'Today' : 'Today', body, url: '#/now', key: `morning:${day}` });
    }
  }

  if (p.heavyDay) {
    const due = dueOn(tomorrow);
    const load = schedule.loadByDay[tomorrow] ?? 0;
    const capacity = schedule.capacityByDay[tomorrow] ?? 0;
    if (due.length >= HEAVY_DUE || (capacity > 0 && load > capacity)) {
      const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
      const body = `${due.length} due tomorrow${capacity > 0 ? `, about ${hours(load)} planned against ${hours(capacity)}` : ''}. ${due[0] ? `Start tonight: ${due[0].label}.` : ''}`.trim();
      push({ kind: 'heavy_day', sendAt: at(today, '20:00', tz), title: 'Heavy day tomorrow', body, url: '#/calendar', key: `heavy_day:${tomorrow}` });
    }
  }

  if (p.notStarted) {
    const soon = open
      .filter((i) => i.status === 'todo' && (i.points >= NUDGE_POINTS || i.type === 'exam' || i.type === 'paper' || i.type === 'project'))
      .filter((i) => {
        const day = schedule.byItem[i.id]?.deadlineDay ?? dateOf(i.dueAt, tz);
        const k = diffDays(today, day);
        return k >= 0 && k <= 2;
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    if (soon.length > 0) {
      const names = soon.slice(0, 2).map((i) => `${i.label} (due ${fmtDate(dateOf(i.dueAt, tz), 'short')})`).join(', ');
      const sendAt = at(today, '18:00', tz);
      push({ kind: 'not_started', sendAt: sendAt > now ? sendAt : at(tomorrow, '18:00', tz), title: 'Not started yet', body: `${names}${soon.length > 2 ? ` and ${soon.length - 2} more` : ''}. Twenty minutes tonight beats an hour tomorrow.`, url: '#/now', key: `not_started:${sendAt > now ? today : tomorrow}` });
    }
  }

  if (p.resync) {
    const days = lastPull ? diffDays(dateOf(lastPull, tz), today) : null;
    if (days === null || days >= RESYNC_AFTER_DAYS) {
      const sendAt = at(today, '10:00', tz);
      const day = sendAt > now ? today : tomorrow;
      push({ kind: 'resync', sendAt: at(day, '10:00', tz), title: 'Sync Halo', body: days === null ? 'Halo has not been synced yet. One tap and your week is in.' : `Halo was last synced ${days} days ago. Deadlines may have moved.`, url: '#/now?sync=1', key: `resync:${day}` });
    }
  }

  // The welcome gift, a few hours in and still nothing synced: one reminder, once (George, 2026-09-29).
  if (input.trialStartedAt && !lastPull && input.courses.length === 0) {
    const sendAt = new Date(new Date(input.trialStartedAt).getTime() + 3 * 3_600_000).toISOString();
    if (sendAt > now && (!input.trialEndsAt || sendAt < input.trialEndsAt)) push({ kind: 'welcome_sync', sendAt, title: 'Your free week of Max has started', body: 'Connect Halo to use it. It takes about two minutes.', url: '#/now', key: 'welcome_sync' });
  }

  // Saturday at nine: participation still open this week, class by class. Planned when Saturday is today or tomorrow.
  if (p.participation) {
    const saturday = [today, tomorrow].find((d) => weekdayOf(d) === 6);
    if (saturday) {
      const week = participationThisWeek(items, input.courses, saturday, tz, now).filter((e) => e.left > 0);
      const left = week.reduce((s, e) => s + e.left, 0);
      const sendAt = at(saturday, '09:00', tz);
      if (left > 0 && sendAt > now) {
        const codes = week.map((e) => e.course?.code ?? e.item.label).slice(0, 3).join(', ');
        push({ kind: 'participation', sendAt, title: 'Participation still open', body: `${left} thing${left === 1 ? '' : 's'} left this week in ${codes}${week.length > 3 ? ` and ${week.length - 3} more` : ''}. Open the list on Now.`, url: '#/now?pw=1', key: `participation:${saturday}` });
      }
    }
  }

  // Sunday at six, on Max: last week done and slipped, this week coming, in the same sentence the Sunday review
  // opens with. Planned when the coming Sunday is today or tomorrow, from the work as it stands now.
  if (input.recap && p.sunday) {
    const sunday = [today, tomorrow].find((d) => weekdayOf(d) === 0);
    if (sunday) {
      const sentence = weekReview(items, schedule, sunday, tz).sentence;
      push({ kind: 'sunday', sendAt: at(sunday, '18:00', tz), title: 'Your week', body: sentence, url: '#/now', key: `sunday:${sunday}` });
    }
  }

  // The trial: two reminders, two days before it ends (the evening) and the morning of the last day, each with what
  // Max actually did (the recap line is filled in by the app from the student's own records).
  if (input.trialEndsAt && input.trialEndsAt > now) {
    const cal = trialCalendar(input.trialEndsAt, tz, now);
    const recap = input.trialRecap ? ` ${input.trialRecap}` : '';
    for (const r of cal.reminders) {
      if (r.sendAt <= now) continue;
      const last = r.daysBefore === 0;
      push({
        kind: 'trial_ends',
        sendAt: r.sendAt,
        title: last ? 'Last day of your free trial' : 'Your free trial ends in 2 days',
        body: `${recap.trim() ? `${recap.trim()} ` : ''}${last ? 'Tomorrow you go back to Free' : 'After that you go back to Free'}: Halo sync pauses and the study tools lock. Nothing charges.`,
        url: '#/you?s=plan',
        key: `trial_ends:${cal.lastDay}:${r.daysBefore}`,
      });
    }
  }

  return out.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}
