import { dateOf, diffDays } from './dates';
import { isNoise } from './requirements';
import type { DateStr, Item, ItemType } from './types';

/**
 * The Cook meter: how heavy the next two weeks are in one class. Each open thing due in the next 14 days counts by
 * how heavy its kind is (a discussion a little, a lab more, an essay, project or exam a lot), counts less in the second
 * week, and a quiz or exam counts more as it gets close. Estimated hours add to it, and so does anything overdue (up to
 * a cap, so a backlog alone never reads Cooked).
 */
export type CookLevel = 'Chillin' | 'Warm' | 'Cooking' | 'Cooked';

const WEIGHT: Record<ItemType, number> = { discussion: 1, participation: 0, homework: 2, other: 1.5, lab: 3, quiz: 3.5, paper: 5, project: 5, exam: 6 };
/** What each kind is called in the why line. */
const NOUN: Record<ItemType, [string, string]> = {
  paper: ['essay', 'essays'],
  project: ['project', 'projects'],
  exam: ['exam', 'exams'],
  quiz: ['quiz', 'quizzes'],
  lab: ['lab', 'labs'],
  homework: ['assignment', 'assignments'],
  discussion: ['discussion post', 'discussion posts'],
  other: ['other thing', 'other things'],
  participation: ['check-in', 'check-ins'],
};
const HORIZON = 14;
/** Score where each level starts; the bar is full at FULL. */
const LEVELS: [number, CookLevel][] = [
  [0, 'Chillin'],
  [5, 'Warm'],
  [11, 'Cooking'],
  [18, 'Cooked'],
];
const FULL = 24;

export interface Cook {
  level: CookLevel;
  /** 0 to 1, how full the bar is. */
  fill: number;
  score: number;
  /** One line on why, e.g. "2 essays and a quiz in the next 10 days." */
  why: string;
}

const count = (n: number, noun: string): string => (n === 1 ? `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}` : `${n} ${noun}`);
const list = (parts: string[]): string => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

export function cookMeter(items: Item[], today: DateStr, tz: string): Cook {
  let score = 0;
  let minutes = 0;
  let overdue = 0;
  let last = 0;
  /** Overdue work adds, but a backlog alone tops out at Warm-to-Cooking, never Cooked. */
  let late = 0;
  const kinds = new Map<ItemType, number>();
  for (const i of items) {
    if (i.status === 'done' || isNoise(i) || i.type === 'participation') continue;
    const days = diffDays(today, dateOf(i.dueAt, tz));
    if (days < 0) {
      overdue += 1;
      late += 1 + WEIGHT[i.type] * 0.4;
      continue;
    }
    if (days > HORIZON) continue;
    let w = WEIGHT[i.type] * (days <= 7 ? 1 : 0.6);
    if ((i.type === 'quiz' || i.type === 'exam') && days <= 3) w *= 1.6;
    else if ((i.type === 'quiz' || i.type === 'exam') && days <= 7) w *= 1.25;
    score += w;
    minutes += Math.max(0, i.estimatedMinutes || 0) * (i.status === 'in_progress' ? 0.5 : 1);
    kinds.set(i.type, (kinds.get(i.type) ?? 0) + 1);
    last = Math.max(last, days);
  }
  score += minutes / 60 / 2 + Math.min(late, 8);
  score = Math.round(score * 10) / 10;
  const level = [...LEVELS].reverse().find(([at]) => score >= at)?.[1] ?? 'Chillin';
  const fill = score <= 0 ? 0 : Math.max(0.06, Math.min(1, score / FULL));

  // The why: the heaviest kinds first, at most three named, the rest as "N more".
  const ranked = [...kinds.entries()].sort((a, b) => WEIGHT[b[0]] - WEIGHT[a[0]] || b[1] - a[1]);
  const named = ranked.slice(0, 3).map(([k, n]) => count(n, NOUN[k][n === 1 ? 0 : 1]));
  const rest = ranked.slice(3).reduce((s, [, n]) => s + n, 0);
  if (rest > 0) named.push(`${rest} more`);
  const when = last === 0 ? 'today' : last === 1 ? 'by tomorrow' : `in the next ${last} days`;
  const lateText = overdue > 0 ? `${overdue} overdue` : '';
  let why: string;
  if (named.length === 0) why = lateText ? `${lateText}, nothing else due in the next 2 weeks.` : 'Nothing due in the next 2 weeks.';
  else why = `${list(named)} ${when}${lateText ? `, plus ${lateText}` : ''}.`;
  why = why.charAt(0).toUpperCase() + why.slice(1);
  return { level, fill, score, why };
}
