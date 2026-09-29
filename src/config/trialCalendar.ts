import { addDays, dateOf, fmtDate, makeIso, zonedParts } from '../domain/dates';
import type { DateStr } from '../domain/types';
import { TRIAL } from './tiers';

/**
 * The trial's calendar in the student's own time zone. It ends at the clock time it was started, seven days on; the
 * "last day" is the last date with Max most of the day (a trial ending at 1 AM has its last day the day before).
 */
export interface TrialCalendar {
  endsAt: string;
  lastDay: DateStr;
  /** Days of Max left, counted in whole 24-hour days rounded up: 7 the moment it starts, 1 in its last 24 hours. */
  daysLeft: number;
  /** Reminders, earliest first: two days before (evening), and the last day's morning. */
  reminders: { day: DateStr; sendAt: string; daysBefore: number }[];
}

export function trialCalendar(endsAt: string, tz: string, now: string = new Date().toISOString()): TrialCalendar {
  const endDay = dateOf(endsAt, tz);
  const lastDay = zonedParts(endsAt, tz).hh >= 12 ? endDay : addDays(endDay, -1);
  const daysLeft = Math.max(0, Math.ceil((new Date(endsAt).getTime() - new Date(now).getTime()) / 86_400_000));
  const reminders = TRIAL.remindDaysBefore
    .map((daysBefore) => {
      const day = addDays(lastDay, -daysBefore);
      // Two days out: the evening, when there is time to think; the last day: first thing in the morning.
      const sendAt = new Date(makeIso(day, daysBefore === 0 ? '08:00' : '18:00', tz)).toISOString();
      return { day, sendAt, daysBefore };
    })
    .filter((r) => r.sendAt < endsAt);
  return { endsAt, lastDay, daysLeft, reminders };
}

/** "Max trial · 5 days left", "Max trial · last day". */
export const trialChipText = (daysLeft: number): string => (daysLeft <= 1 ? 'Max trial · last day' : `Max trial · ${daysLeft} days left`);
/** The same on a phone's narrow top bar: "Max · 5 days", "Max · last day". */
export const trialChipShort = (daysLeft: number): string => (daysLeft <= 1 ? 'Max · last day' : `Max · ${daysLeft} days`);

/** "Sat, Oct 3" and the plain sentence of what happens then. */
export function trialEndSentence(cal: TrialCalendar, tz: string): string {
  const when = fmtDate(dateOf(cal.endsAt, tz), 'long');
  return `Your trial ends ${when}. After that you go back to Free: Halo sync pauses, announcements aren't read, and the study tools lock. Everything you have stays. Nothing charges.`;
}
