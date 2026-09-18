import { addDays, dateOf, diffDays, weekStart } from './dates';
import { isNoise } from './requirements';
import { courseGrade } from './grades';
import type { Course, DateStr, Item } from './types';

export interface TermWeek {
  start: DateStr;
  end: DateStr;
  index: number;
  points: number;
  items: number;
  /** Exams and 100+ point work due this week. */
  big: Item[];
  /** Heavy relative to the term: top quartile of weekly points, or two big things. */
  brutal: boolean;
  current: boolean;
}

export interface ClassStake {
  course: Course;
  banked: number;
  lost: number;
  atStake: number;
  total: number;
}

export interface TermShape {
  weeks: TermWeek[];
  midpoint: DateStr;
  /** 0..1 through the term. */
  elapsed: number;
  stakes: ClassStake[];
  maxPoints: number;
}

/** The term as a shape: week by week weight, where the big things sit, what is banked per class, where the midpoint is. */
export function termShape(items: Item[], courses: Course[], term: { start: DateStr; end: DateStr }, today: DateStr, tz: string, weekStartsOn: 0 | 1 = 1): TermShape {
  const work = items.filter((i) => !isNoise(i));
  const first = weekStart(term.start, weekStartsOn);
  const weeks: TermWeek[] = [];
  for (let s = first, k = 0; s <= term.end && k < 24; s = addDays(s, 7), k++) {
    const end = addDays(s, 6);
    const inside = work.filter((i) => {
      const d = dateOf(i.dueAt, tz);
      return d >= s && d <= end;
    });
    weeks.push({ start: s, end, index: k + 1, points: inside.reduce((n, i) => n + i.points, 0), items: inside.length, big: inside.filter((i) => i.type === 'exam' || i.points >= 100).sort((a, b) => b.points - a.points), brutal: false, current: today >= s && today <= end });
  }
  const sorted = [...weeks.map((w) => w.points)].sort((a, b) => a - b);
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  for (const w of weeks) w.brutal = (w.points >= q3 && w.points > 0 && w.points >= 150) || w.big.length >= 2;
  const total = Math.max(1, diffDays(term.start, term.end));
  const stakes = courses.map((course) => {
    const g = courseGrade(course.id, items);
    return { course, banked: g.earned, lost: g.possibleGraded - g.earned, atStake: g.remaining, total: g.totalPossible };
  });
  return { weeks, midpoint: addDays(term.start, Math.floor(total / 2)), elapsed: Math.min(1, Math.max(0, diffDays(term.start, today) / total)), stakes, maxPoints: Math.max(1, ...weeks.map((w) => w.points)) };
}
