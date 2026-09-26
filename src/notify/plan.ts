import { addDays, dateOf, diffDays, fmtDate, makeIso } from '../domain/dates';
import { isNoise } from '../domain/requirements';
import type { Schedule } from '../domain/schedule';
import type { Course, DateStr, Item, ReminderPrefs } from '../domain/types';

/**
 * What to tell the student, and when, for the next two days. Pure: the client computes it from the same schedule
 * the screens use and writes it to the server, which only sends what is due. Four kinds, each its own switch:
 * the morning note, the night-before heavy-day warning, the not-started nudge, and the re-sync reminder.
 */
export type NoticeKind = 'morning' | 'heavy_day' | 'not_started' | 'resync' | 'trial_ends';

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
  /** When the Max trial ends, for the one reminder the day before. */
  trialEndsAt?: string | null;
}

export const DEFAULT_PREFS: Required<Pick<ReminderPrefs, 'morningTime' | 'quietFrom' | 'quietTo' | 'morning' | 'heavyDay' | 'notStarted' | 'resync'>> = { morningTime: '07:30', quietFrom: '22:00', quietTo: '07:00', morning: true, heavyDay: true, notStarted: true, resync: true };

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
  const out: Notice[] = [];
  const push = (n: Notice) => {
    const sendAt = outsideQuiet(n.sendAt, tz, p.quietFrom, p.quietTo);
    if (sendAt > now) out.push({ ...n, sendAt });
  };
  const tomorrow = addDays(today, 1);

  if (p.morning && p.morningTime && p.morningTime !== 'off') {
    for (const day of [today, tomorrow]) {
      const due = dueOn(day);
      const next = open.filter((i) => dateOf(i.dueAt, tz) > day).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
      const body = due.length === 0 ? (next ? `Nothing due today. Next: ${next.label}, due ${fmtDate(dateOf(next.dueAt, tz), 'short')}.` : 'Nothing due today.') : `${due.length} due today. First: ${due[0].label} (${codeOf(courses, due[0].courseId)}, ${due[0].points} pts).`;
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

  // The trial: one reminder, the evening before it ends, with what it did (the app fills the receipts in when
  // the note is tapped). Never more than once.
  if (input.trialEndsAt && input.trialEndsAt > now) {
    const endDay = dateOf(input.trialEndsAt, tz);
    const dayBefore = addDays(endDay, -1);
    if (dayBefore >= today) {
      push({ kind: 'trial_ends', sendAt: at(dayBefore, '18:00', tz), title: 'Your Max trial ends tomorrow', body: "Here's what it has done for you, and one button if you want to keep it. Nothing charges on its own.", url: '#/you', key: `trial_ends:${endDay}` });
    }
  }

  return out.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}
