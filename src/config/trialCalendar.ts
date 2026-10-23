import { addDays, dateOf, fmtDate, makeIso, zonedParts } from '../domain/dates';
import type { DateStr } from '../domain/types';
import { TRIAL } from './tiers';
import type { TrialUse } from './trialUse';

/**
 * The trial's calendar in the student's own time zone: trial_ends_at, kept by the server from the days of use (0040).
 * The "last day" is the last date with Max most of the day (a trial ending at 1 AM has its last day the day before).
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

/** "Free trial · 5 days left", "Free trial · last day". */
export const trialChipText = (daysLeft: number): string => (daysLeft <= 1 ? 'Max · last day' : `Max · ${daysLeft} days left`);
/** The same on a phone's narrow top bar: "Max · 5 days", "Max · last day". */
export const trialChipShort = (daysLeft: number): string => (daysLeft <= 1 ? 'Max · last day' : `Max · ${daysLeft} days`);

/** How the trial counts and what happens after it, in plain words (days of use, 2026-10-22). */
export function trialEndSentence(use: TrialUse, tz: string): string {
  const then = 'After that you go back to Free: Halo sync pauses, announcements aren\'t read, and the study tools lock. Everything you have stays. Nothing charges.';
  if (!use.started) return `Your ${TRIAL.days} days of Max start when your classes first sync. A day counts when you open Halo+. ${then}`;
  const cap = use.capAt ? fmtDate(dateOf(use.capAt, tz), 'long') : '';
  return `It ends after your ${TRIAL.days}th day of use${cap ? `, or on ${cap}, whichever comes first` : ''}. ${then}`;
}
