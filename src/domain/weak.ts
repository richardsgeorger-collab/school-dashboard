import { weakTopics } from '../quiz/stats';
import { dateOf, diffDays } from './dates';
import type { Course, DateStr, Item, QuizStat } from './types';

export const WEAK_BELOW = 0.75;

export interface WeakSpot {
  item: Item;
  pct: number;
}

/** Graded items in a class that scored under the bar, lowest first. */
export function weakSpots(courseId: string, items: Item[], below = WEAK_BELOW): WeakSpot[] {
  return items
    .filter((i) => i.courseId === courseId && i.score !== null && i.points > 0 && i.score / i.points < below)
    .map((i) => ({ item: i, pct: Math.round((i.score! / i.points) * 100) }))
    .sort((a, b) => a.pct - b.pct || b.item.dueAt.localeCompare(a.item.dueAt));
}

/** The next open exam in a class, if any. */
export function nextExam(courseId: string, items: Item[], today: DateStr, tz: string): Item | null {
  return (
    items
      .filter((i) => i.courseId === courseId && i.type === 'exam' && i.status !== 'done' && dateOf(i.dueAt, tz) >= today)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null
  );
}

const inWords = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : days < 7 ? `in ${days} days` : days < 14 ? 'in a week' : `in ${Math.round(days / 7)} weeks`);

/** A topic worth practicing for the class: the lowest graded item's title, else the topic practice keeps missing. */
export function weakTopicFor(course: Course, items: Item[], stats: Record<string, QuizStat> | undefined): string | null {
  const spots = weakSpots(course.id, items);
  if (spots.length) return spots[0].item.title;
  const w = weakTopics(stats, course.id, 1);
  return w[0]?.topic ?? null;
}

/**
 * One calm line for the Grades card: where points went, what is coming that covers it, and what practice keeps
 * missing. Null when there is nothing to say. Never a verdict on the student.
 */
export function weakLine(course: Course, items: Item[], stats: Record<string, QuizStat> | undefined, today: DateStr, tz: string): string | null {
  const spots = weakSpots(course.id, items);
  const practice = weakTopics(stats, course.id, 2);
  const parts: string[] = [];
  if (spots.length) {
    const s = spots[0];
    const more = spots.length > 1 ? ` and ${spots.length - 1} other${spots.length - 1 === 1 ? '' : 's'}` : '';
    let line = `Lowest so far: ${s.item.title} at ${s.pct}%${more}`;
    const exam = nextExam(course.id, items, today, tz);
    if (exam) line += `. ${exam.label} is ${inWords(diffDays(today, dateOf(exam.dueAt, tz)))}`;
    parts.push(`${line}.`);
  }
  if (practice.length) parts.push(`Practice keeps slipping on ${practice.map((p) => p.topic).join(' and ')}.`);
  return parts.length ? parts.join(' ') : null;
}
