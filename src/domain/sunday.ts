import { addDays, dateOf, fmtDate, weekdayOf } from './dates';
import type { Schedule } from './schedule';
import type { DateStr, Item, SundayReviewState } from './types';

export const MAX_SKIPS = 2;

/** Sundays only, once a Sunday, never after it has been waved off twice or switched off. */
export function shouldOfferSunday(state: SundayReviewState | undefined, today: DateStr): boolean {
  if (weekdayOf(today) !== 0) return false;
  if (state?.off) return false;
  if ((state?.skips ?? 0) >= MAX_SKIPS) return false;
  return state?.lastOffered !== today && state?.lastDone !== today;
}

export const offered = (state: SundayReviewState | undefined, today: DateStr): SundayReviewState => ({ skips: state?.skips ?? 0, lastOffered: today, lastDone: state?.lastDone ?? null, off: state?.off });
export const skipped = (state: SundayReviewState | undefined, today: DateStr): SundayReviewState => {
  const skips = (state?.skips ?? 0) + 1;
  return { skips, lastOffered: today, lastDone: state?.lastDone ?? null, off: skips >= MAX_SKIPS ? true : state?.off };
};
export const finished = (state: SundayReviewState | undefined, today: DateStr): SundayReviewState => ({ skips: 0, lastOffered: today, lastDone: today, off: state?.off });
export const switchedOn = (state: SundayReviewState | undefined): SundayReviewState => ({ skips: 0, lastOffered: state?.lastOffered ?? null, lastDone: state?.lastDone ?? null, off: false });

export interface WeekReview {
  done: Item[];
  /** Went past its date in the last seven days and is still open. */
  slipped: Item[];
  /** Still open from before last week: named once, not listed with buttons. */
  older: Item[];
  coming: Item[];
  sentence: string;
}

/** Last week done, what slipped, what the next seven days hold, and one sentence that says it. */
export function weekReview(items: Item[], schedule: Schedule, today: DateStr, tz: string): WeekReview {
  const weekAgo = addDays(today, -7);
  const work = items.filter((i) => i.type !== 'participation');
  const done = work.filter((i) => i.status === 'done' && i.completedAt && dateOf(i.completedAt, tz) >= weekAgo).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
  const open = work.filter((i) => i.status !== 'done');
  const day = (i: Item) => schedule.byItem[i.id]?.deadlineDay ?? dateOf(i.dueAt, tz);
  const past = open.filter((i) => day(i) < today).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const slipped = past.filter((i) => day(i) >= weekAgo);
  const older = past.filter((i) => day(i) < weekAgo);
  const end = addDays(today, 6);
  const coming = open.filter((i) => day(i) >= today && day(i) <= end).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const biggest = [...coming].sort((a, b) => b.points - a.points || a.dueAt.localeCompare(b.dueAt))[0];
  const first = `Last week: ${done.length} done${slipped.length ? `, ${slipped.length} slipped` : ''}${older.length ? `${slipped.length ? ';' : ','} ${older.length} older thing${older.length === 1 ? '' : 's'} still open` : ''}.`;
  const second = coming.length === 0 ? 'Nothing due this week.' : `This week: ${coming.length} coming${biggest && biggest.points >= 50 ? `, the biggest is ${biggest.label} on ${fmtDate(day(biggest), 'long').split(',')[0]}` : ''}.`;
  return { done, slipped, older, coming, sentence: `${first} ${second}` };
}

