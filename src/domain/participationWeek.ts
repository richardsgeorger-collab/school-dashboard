import { dateOf, diffDays } from './dates';
import { isParticipation } from './participation';
import type { Course, DateStr, Item, Requirement } from './types';

/**
 * Participation you won't forget. It stays out of the Now card (it is never the one thing to do next), so it gets its
 * own place: each participation item carries a checklist of exactly what earns the points, from announcements and
 * the syllabus, plus Halo's own rule when the class sets one ("2 forum posts on 2 different days"); Now's last line
 * counts what is left this week; Saturday morning says so if anything is.
 */

/** Halo's participation rule as a line, when the class sets numbers. */
export function policyLine(course: Course | undefined): string | null {
  const p = course?.participation;
  if (!p || !p.posts || !p.days) return null;
  return `${p.posts} forum post${p.posts === 1 ? '' : 's'} on ${p.days} different days`;
}

export const policyId = (item: Item) => `rq-policy-${item.id}`;

/** The lines that earn this item's points: its own (not the for-reference ones), then Halo's rule if nothing says it. */
export function checklistFor(item: Item, course: Course | undefined, now: string): Requirement[] {
  const own = (item.requirements ?? []).filter((r) => r.scope !== 'reference');
  const rule = policyLine(course);
  const says = own.some((r) => r.id === policyId(item) || /different days|\bdays?\b.*\b(post|repl|respond)|\b(post|repl|respond)\w*\b.*\bdays?\b/i.test(r.text));
  if (!rule || says) return own;
  return [...own, { id: policyId(item), text: rule, dueAt: null, done: false, doneAt: null, gradedOn: true, scope: 'rule', source: { kind: 'syllabus', id: null, title: 'Halo participation rule', quote: course?.participation?.description ?? null, at: null }, addedAt: now }];
}

export interface WeekEntry {
  item: Item;
  course: Course | undefined;
  lines: Requirement[];
  /** Lines still open; an item with no lines counts as one until it is marked done. */
  left: number;
  /** A day's participation (CHM-113's "Week 5, Day 1 Participation"): one tick, no checklist. */
  day: boolean;
  /** Past its due time and not done. */
  late: boolean;
}

/** How far back a missed day's participation still shows as late on the line. */
const LATE_DAYS = 7;

/**
 * Each class's participation item for the week (the first one due today or in the next six days), and its day-by-day
 * participation (2026-10-08): items with "participation" in the title that Halo files as discussions or assignments,
 * due this week, or missed in the past week (late).
 */
export function participationThisWeek(items: Item[], courses: Course[], today: DateStr, tz: string, now: string): WeekEntry[] {
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const picked = new Map<string, Item>();
  const days: Item[] = [];
  const nowMs = Date.parse(now);
  for (const i of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    if (!isParticipation(i)) continue;
    const k = diffDays(today, dateOf(i.dueAt, tz));
    if (i.type !== 'participation') {
      const missed = i.status !== 'done' && Date.parse(i.dueAt) < nowMs && k >= -LATE_DAYS;
      // A late one ticked off today stays for the day, so it can be unticked where it was ticked.
      const caughtUp = i.status === 'done' && k < 0 && k >= -LATE_DAYS && !!i.completedAt && dateOf(i.completedAt, tz) === today;
      if ((k >= 0 && k <= 6) || missed || caughtUp) days.push(i);
      continue;
    }
    if (picked.has(i.courseId)) continue;
    if (k >= 0 && k <= 6) picked.set(i.courseId, i);
  }
  const late = (i: Item) => i.status !== 'done' && Date.parse(i.dueAt) < nowMs;
  const weeks: WeekEntry[] = [...picked.values()].map((item) => {
    const course = byCourse.get(item.courseId);
    const lines = checklistFor(item, course, now);
    const left = item.status === 'done' ? 0 : lines.length === 0 ? 1 : lines.filter((r) => !r.done).length || 1;
    return { item, course, lines, left, day: false, late: late(item) };
  });
  const dayEntries: WeekEntry[] = days.map((item) => ({ item, course: byCourse.get(item.courseId), lines: [], left: item.status === 'done' ? 0 : 1, day: true, late: late(item) }));
  // Class by class: its week's item, then its days in order.
  const code = (e: WeekEntry) => e.course?.code ?? '';
  return [...weeks, ...dayEntries].sort((a, b) => code(a).localeCompare(code(b)) || Number(a.day) - Number(b.day) || a.item.dueAt.localeCompare(b.item.dueAt));
}

/** How many are late: "1 late" in red on the line. */
export const lateCount = (entries: WeekEntry[]): number => entries.filter((e) => e.late).length;

/** "Participation this week: 3 left" or "Participation done this week." */
export function weekLine(entries: WeekEntry[]): string | null {
  if (entries.length === 0) return null;
  const left = entries.reduce((s, e) => s + e.left, 0);
  return left === 0 ? 'Participation done this week.' : `Participation this week: ${left} left`;
}

/** Ticks a line (Halo's rule line is stored the first time it is ticked), and says whether every line is now done. */
export function tickLine(item: Item, lines: Requirement[], id: string, now: string): { item: Item; allDone: boolean } {
  const line = lines.find((r) => r.id === id);
  if (!line) return { item, allDone: false };
  const next = { ...line, done: !line.done, doneAt: line.done ? null : now };
  const has = (item.requirements ?? []).some((r) => r.id === id);
  const requirements = has ? (item.requirements ?? []).map((r) => (r.id === id ? next : r)) : [...(item.requirements ?? []), next];
  const after = lines.map((r) => (r.id === id ? next : r));
  return { item: { ...item, requirements }, allDone: after.length > 0 && after.every((r) => r.done) };
}
