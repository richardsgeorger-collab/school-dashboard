import { addDays, dateOf, fmtMinutes, weekStart } from '../domain/dates';
import { letterFor } from '../domain/grades';
import type { Course, DateStr, Item } from '../domain/types';

/**
 * The rewards (George, 2026-10-02: "the dopamine system"). Pure, so every claim is tested. Everything here comes from
 * real Halo data where there is any (submitted, graded, the class's own point totals), and is derived fresh from the
 * planner each time, so unchecking something takes back whatever it gave.
 */

/** Halo says it was handed in: a submission time, a submitted or published status, or a score. */
export function isTurnedIn(i: Item): boolean {
  const s = i.halo?.status ?? null;
  return !!i.halo?.submittedAt || s === 'SUBMITTED' || s === 'PUBLISHED' || i.score !== null;
}

/** Work done: handed in on Halo, or checked off here. */
export const isWorkDone = (i: Item): boolean => i.status === 'done' || isTurnedIn(i);

export interface ClassProgress {
  done: number;
  total: number;
  /** Whole percent, 0 to 100. */
  pct: number;
}

/**
 * How much of a class's work is done, by points: the points of the work handed in or checked off, over the class's
 * real total from Halo (the sum of every Halo assignment's points in that class, never an assumed 1,000). Work you
 * added by hand is not Halo's, so it is in neither number. Null when Halo gave the class no points.
 */
export function classProgress(courseId: string, items: Item[]): ClassProgress | null {
  const halo = items.filter((i) => i.courseId === courseId && i.source === 'halo' && i.points > 0);
  const total = halo.reduce((n, i) => n + i.points, 0);
  if (total <= 0) return null;
  const done = halo.filter(isWorkDone).reduce((n, i) => n + i.points, 0);
  return { done, total, pct: Math.min(100, Math.floor((done / total) * 100)) };
}

/** The last of 25, 50, 75 and 100 a class has reached. */
export const milestoneOf = (pct: number): 0 | 25 | 50 | 75 | 100 => (pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0);

/**
 * How many things a sync newly saw handed in. Zero on a first sync (a whole term arriving is history, not a moment),
 * and nothing that was already turned in before.
 */
export function turnedInSince(before: Item[], after: Item[]): number {
  if (!before.some((i) => i.source === 'halo')) return 0;
  const was = new Map(before.map((i) => [i.id, i]));
  return after.filter((i) => {
    if (!isTurnedIn(i)) return false;
    const b = was.get(i.id);
    return !!b && !isTurnedIn(b);
  }).length;
}

export interface GradeUp {
  courseId: string;
  code: string;
  percent: number;
  /** The new letter, only when the rise crossed into it ("now an A"). */
  letter?: string | null;
}

/** Classes whose grade from Halo went up in a sync. Never a drop; never a class with no grade before. */
export function gradeUps(before: Course[], after: Course[]): GradeUp[] {
  const was = new Map(before.map((c) => [c.id, c]));
  const letter = (c: Course) => letterFor(c.haloGrade?.percent ?? null, c.gradeScale) ?? c.haloGrade?.letter ?? null;
  return after
    .filter((c) => {
      const b = was.get(c.id)?.haloGrade?.percent ?? null;
      const a = c.haloGrade?.percent ?? null;
      return b !== null && a !== null && a - b >= 0.5;
    })
    .map((c) => {
      const from = letter(was.get(c.id)!);
      const to = letter(c);
      return { courseId: c.id, code: c.code, percent: Math.round(c.haloGrade!.percent!), ...(to && from && to !== from ? { letter: to } : {}) };
    });
}

const article = (l: string) => (/^[AEFHILMNORSX]/.test(l) ? 'an' : 'a');
/** "Your BIO-181 grade went up to 93%, now an A." */
export const gradeUpText = (g: GradeUp): string => `Your ${g.code} grade went up to ${g.percent}%${g.letter ? `, now ${article(g.letter)} ${g.letter}` : ''}.`;

/** The line under a check-off: "+50 pts done · CHM-113L is 34% complete", with "2 days early" when it was. */
export function doneLine(points: number, code: string | null, pct: number | null, early: number | null = null): string {
  const pts = `${points > 0 ? `+${points} pts done` : 'Done'}${early ? `, ${early} ${early === 1 ? 'day' : 'days'} early` : ''}`;
  return code && pct !== null ? `${pts} · ${code} is ${pct}% complete` : pts;
}

// ---- Phase 7 (2026-10-02): three of our own ------------------------------------------------------------------------

/** A grade worth celebrating: 90% or better. Only ever up, as with class grades; a lower score is never a moment. */
export const GRADED_WELL = 0.9;

export interface GradedWell {
  id: string;
  label: string;
  score: number;
  points: number;
}

/**
 * Work that came back graded well in a sync: a Halo score where there was none, on something with points, at 90% or
 * better. Nothing on a first sync (a whole term of grades arriving is history), and never a lower score.
 */
export function gradedWell(before: Item[], after: Item[]): GradedWell[] {
  if (!before.some((i) => i.source === 'halo')) return [];
  const was = new Map(before.map((i) => [i.id, i]));
  return after
    .filter((i) => {
      const b = was.get(i.id);
      return !!b && b.score === null && i.score !== null && i.points > 0 && i.score / i.points >= GRADED_WELL;
    })
    .map((i) => ({ id: i.id, label: i.label || i.title, score: i.score!, points: i.points }));
}

/** "Graded: 47/50 on Lab 3.", or "Full marks: 50/50 on Lab 3." */
export const gradedLine = (g: GradedWell): string => `${g.score >= g.points ? 'Full marks' : 'Graded'}: ${+g.score.toFixed(1)}/${g.points} on ${g.label}.`;

export interface TopicDone {
  key: string;
  courseId: string;
  topic: string;
}

/**
 * Halo topics (units) where every assignment with points is turned in or done. A topic of one assignment is that
 * assignment, so it takes two. Derived fresh each time, so unchecking one takes the topic back.
 */
export function topicsCleared(items: Item[]): TopicDone[] {
  const units = new Map<string, Item[]>();
  for (const i of items) {
    if (i.source !== 'halo' || !i.haloUnitId || i.points <= 0) continue;
    const k = `${i.courseId}|${i.haloUnitId}`;
    units.set(k, [...(units.get(k) ?? []), i]);
  }
  return [...units]
    .filter(([, list]) => list.length >= 2 && list.every(isWorkDone))
    .map(([key, list]) => ({ key, courseId: list[0].courseId, topic: list.find((i) => i.topic)?.topic ?? 'A topic' }));
}

/** Whole days between now and the due time, when it was done at least a day ahead; null otherwise. */
export function daysEarly(dueAt: string | null, at: string): number | null {
  if (!dueAt) return null;
  const d = Math.floor((Date.parse(dueAt) - Date.parse(at)) / 86_400_000);
  return d >= 1 ? d : null;
}

// ---- the moments, as events (shared by the app and the Admin preview, so they cannot drift) ---------------------------

export interface JoyEvent {
  text: string;
  /** Confetti with it (a real submission, a clear day, a finished class). */
  big?: boolean;
  /** A card instead of a toast: the finished class. */
  card?: { title: string; body: string };
  /** Admin preview only: shown whatever the Celebrations switch says. */
  preview?: boolean;
  /** Admin preview only: a card that closes itself after this many milliseconds (Play all). */
  hold?: number;
}

export const syncMoment = (n: number): JoyEvent => ({ text: `Nice. ${n} ${n === 1 ? 'thing' : 'things'} turned in since last sync.`, big: true });
export const gradeUpMoment = (g: GradeUp): JoyEvent => ({ text: gradeUpText(g) });
export const CLEAR_MOMENT: JoyEvent = { text: "You're clear for today.", big: true };
export const streakMoment = (days: number): JoyEvent => ({ text: `${days}-day streak going.` });
export const topicMoment = (code: string | null | undefined, topic: string): JoyEvent => ({ text: `${code ? `${code} · ` : ''}${topic} cleared.` });
export const gradedMoment = (g: GradedWell): JoyEvent => ({ text: gradedLine(g) });
/** 25, 50 and 75 are a toast; 100 is the finished-class card with confetti. */
export function classMilestoneMoment(code: string, name: string, m: 25 | 50 | 75 | 100, total: number): JoyEvent {
  if (m !== 100) return { text: `${code} is ${m}% done.` };
  return { text: `You finished ${code}.`, big: true, card: { title: `You finished ${code}.`, body: `Every Halo assignment in ${name || code} is turned in or done: ${total} points of work.` } };
}

/** What the grade-up push says: one class by name and number, several by name. Used by the planner and the preview. */
export const gradeUpBody = (ups: GradeUp[]): string => (ups.length === 1 ? gradeUpText(ups[0]) : `Your ${ups.map((g) => g.code).slice(0, 3).join(' and ')} grades went up.`);

// ---- more moments (2026-10-02, round two) ----------------------------------------------------------------------------

/** Things turned in on Halo this term, counted at 10, 25, 50, 100, 150 and 200. */
export const TERM_MILESTONES = [10, 25, 50, 100, 150, 200] as const;
export const turnedInCount = (items: Item[]): number => items.filter((i) => i.source === 'halo' && isTurnedIn(i)).length;
export const termMilestone = (n: number): number => [...TERM_MILESTONES].reverse().find((m) => n >= m) ?? 0;
export const termMoment = (m: number): JoyEvent => ({ text: `${m} things turned in this term.` });

/** When something was finished: Halo's submission time when there is one, else the check-off. */
const finishedAt = (i: Item): string | null => (isWorkDone(i) ? (i.halo?.submittedAt ?? (i.status === 'done' ? i.completedAt : null)) : null);

/**
 * Today's count against every earlier day. A best day needs three things today, more than any earlier day, and at
 * least a week of earlier days with something finished, so the first week of term is not a string of records.
 */
export function bestDay(items: Item[], today: DateStr, tz: string): { today: number; best: number; record: boolean } {
  const per = new Map<DateStr, number>();
  for (const i of items) {
    const at = finishedAt(i);
    if (at && !Number.isNaN(Date.parse(at))) per.set(dateOf(at, tz), (per.get(dateOf(at, tz)) ?? 0) + 1);
  }
  const n = per.get(today) ?? 0;
  const earlier = [...per].filter(([d]) => d < today);
  const best = earlier.reduce((m, [, c]) => Math.max(m, c), 0);
  return { today: n, best, record: n >= 3 && n > best && earlier.length >= 7 };
}
export const bestDayMoment = (n: number): JoyEvent => ({ text: `Best day yet: ${n} things done today.` });

/**
 * Everything due this week (two or more things) done with at least a day of the week left: the week start, else null.
 * On the last day it is just a clear day, which has its own moment.
 */
export function weekCleared(items: Item[], today: DateStr, tz: string, weekStartsOn: 0 | 1 = 1): DateStr | null {
  const start = weekStart(today, weekStartsOn);
  const end = addDays(start, 6);
  if (today >= end) return null;
  const due = items.filter((i) => i.dueAt && dateOf(i.dueAt, tz) >= start && dateOf(i.dueAt, tz) <= end);
  return due.length >= 2 && due.every(isWorkDone) ? start : null;
}
export const weekMoment = (weekStartsOn: 0 | 1 = 1): JoyEvent => ({ text: `Week cleared. Nothing else due until ${weekStartsOn === 1 ? 'Monday' : 'Sunday'}.` });

/** After the time tap: quicker than planned by a quarter or more. Never anything about being slower. */
export function fasterMoment(actual: number, planned: number): JoyEvent | null {
  if (!(actual > 0) || planned < 20 || actual > planned * 0.75) return null;
  return { text: `Faster than planned: ${fmtMinutes(actual)}, planned ${fmtMinutes(planned)}.` };
}
