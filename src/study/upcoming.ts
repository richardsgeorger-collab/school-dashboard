import { dateOf, diffDays } from '../domain/dates';
import type { DateStr, Item } from '../domain/types';

/** A quiz or an exam: the things Practice is for. */
export const isTest = (i: Pick<Item, 'type'>): boolean => i.type === 'quiz' || i.type === 'exam';

/**
 * The quizzes and exams ahead, nearest first: everything within `days` (three weeks), or, when nothing is that
 * close, the next three so the screen is never empty while the term still has tests in it.
 */
export function upcomingTests(items: Item[], today: DateStr, tz: string, days = 21): Item[] {
  const ahead = items.filter((i) => isTest(i) && i.status !== 'done' && dateOf(i.dueAt, tz) >= today).sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.points - a.points);
  const soon = ahead.filter((i) => diffDays(today, dateOf(i.dueAt, tz)) <= days);
  return soon.length ? soon : ahead.slice(0, 3);
}

/** The nearest quiz or exam within `days` (five): what Now offers Practice for. Null when none is that close. */
export function testWithin(items: Item[], today: DateStr, tz: string, days = 5): Item | null {
  return upcomingTests(items, today, tz, days).find((i) => diffDays(today, dateOf(i.dueAt, tz)) <= days) ?? null;
}

/** "in 3 days", "tomorrow", "today". */
export function inDays(item: Pick<Item, 'dueAt'>, today: DateStr, tz: string): string {
  const n = diffDays(today, dateOf(item.dueAt, tz));
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

/** The open assignments Check is for: not tests, not done, due within a month or already late. Nearest first. */
export function checkableWork(items: Item[], today: DateStr, tz: string, days = 30): Item[] {
  return items
    .filter((i) => !isTest(i) && i.type !== 'participation' && i.status !== 'done' && diffDays(today, dateOf(i.dueAt, tz)) <= days && diffDays(today, dateOf(i.dueAt, tz)) >= -14)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
