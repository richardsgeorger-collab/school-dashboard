import { addDays, dateOf, diffDays, fmtDate, makeIso, weekdayOf } from '../domain/dates';
import type { DateStr, Item } from '../domain/types';
import { outsideQuiet, type Notice } from '../notify/plan';
import { isTest } from '../study/upcoming';

/**
 * Winning back students who stayed on Free after their Max week (George, 2026-09-29), never spammy:
 * at most one win-back push a week across every kind; only with notifications on; quiet hours respected; none after
 * three ignored in a row until they open the app on their own; none for anyone who upgraded or is in a referral;
 * and every message says something true about their own classes.
 */
export const WEEK = 7 * 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The quiz or exam 3 to 5 days away, by the dates as of the last sync. */
export function examOffer(items: Item[], today: DateStr, tz: string): Item | null {
  return (
    items
      .filter((i) => isTest(i) && i.status !== 'done')
      .map((i) => ({ i, k: diffDays(today, dateOf(i.dueAt, tz)) }))
      .filter(({ k }) => k >= 3 && k <= 5)
      .sort((a, b) => a.i.dueAt.localeCompare(b.i.dueAt))[0]?.i ?? null
  );
}

/** "Your Chem Quiz 2 is Friday. Get a study plan and practice worksheet with Max." (+ the as-of date when old) */
export function examLine(item: Item, tz: string, lastPull: string | null, now: string): string {
  const day = WEEKDAYS[weekdayOf(dateOf(item.dueAt, tz))];
  const old = lastPull && new Date(now).getTime() - new Date(lastPull).getTime() > 3 * 86_400_000;
  return `Your ${item.label} is ${day}. Get a study plan and practice worksheet with Max.${old ? ` (Dates as of your last sync, ${fmtDate(dateOf(lastPull!, tz), 'short')}.)` : ''}`;
}

export function staleLine(lastPull: string, at: string): string {
  const weeks = Math.max(1, Math.round((new Date(at).getTime() - new Date(lastPull).getTime()) / WEEK));
  return `Your Halo+ planner is ${weeks} week${weeks === 1 ? '' : 's'} out of date. See what's changed.`;
}

export interface WinbackInput {
  items: Item[];
  tz: string;
  today: DateStr;
  now: string;
  lastPull: string | null;
  quietFrom: string;
  quietTo: string;
  /** Free, the Max week over, not in a referral, never upgraded. */
  eligible: boolean;
  /** When the last win-back push went out. */
  lastSentAt: string | null;
  /** Win-back pushes sent since the student last opened the app on their own. */
  ignoredInRow: number;
}

/** At most one win-back push planned at a time: the exam-week one when a test is 3 to 5 days out, else the stale one. */
export function planWinback(w: WinbackInput): Notice[] {
  if (!w.eligible || !w.lastPull || w.ignoredInRow >= 3) return [];
  const earliest = w.lastSentAt ? new Date(new Date(w.lastSentAt).getTime() + WEEK).toISOString() : w.now;
  const at = (day: DateStr, hhmm: string) => new Date(makeIso(day, hhmm, w.tz)).toISOString();
  const fit = (iso: string) => {
    const t = iso < earliest ? earliest : iso;
    return outsideQuiet(t, w.tz, w.quietFrom, w.quietTo);
  };
  const exam = examOffer(w.items, w.today, w.tz);
  if (exam) {
    const sendAt = fit(at(w.today, '09:00') > w.now ? at(w.today, '09:00') : w.now);
    // Still three or more days before the test when it arrives, or it is not the exam-week offer any more.
    if (diffDays(dateOf(sendAt, w.tz), dateOf(exam.dueAt, w.tz)) >= 3) {
      return [{ kind: 'winback_exam', sendAt, title: 'Halo+', body: examLine(exam, w.tz, w.lastPull, w.now), url: `#/practice?i=${exam.id}&wb=exam`, key: `winback_exam:${exam.id}` }];
    }
  }
  // Not opened for seven days: 10 AM on the first morning at least a week after this visit; every visit moves it back.
  // Keyed by the minute it goes, so the next one never lands on the key of one already sent.
  const weekOut = new Date(new Date(w.now).getTime() + WEEK).toISOString();
  const morning = at(addDays(w.today, 7), '10:00') >= weekOut ? at(addDays(w.today, 7), '10:00') : at(addDays(w.today, 8), '10:00');
  const sendAt = fit(morning);
  return [{ kind: 'winback_stale', sendAt, title: 'Halo+', body: staleLine(w.lastPull, sendAt), url: '#/now?peek=1&wb=stale', key: `winback_stale:${sendAt.slice(0, 16)}` }];
}
