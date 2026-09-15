import { courseGrade } from './grades';
import type { Item } from './types';

const LETTERS: [string, number][] = [
  ['A', 90],
  ['B', 80],
  ['C', 70],
];

const letterFor = (pct: number) => LETTERS.find(([, min]) => pct >= min)?.[0] ?? 'D or lower';
const round = (n: number) => Math.round(n);

export interface GradeFloor {
  /** "Still an A if you average 88% on what's left." */
  line: string | null;
  /** "Even a zero on Chem Exam 1 keeps you at a B." for the next big open item. */
  zeroLine: string | null;
  letter: string | null;
}

/** Is a bad score survivable? The average needed on the rest for each letter, and what a zero on the next big thing would do. */
export function gradeFloor(courseId: string, items: Item[]): GradeFloor {
  const g = courseGrade(courseId, items);
  if (g.possibleGraded === 0 || g.totalPossible === 0) return { line: null, zeroLine: null, letter: null };
  const letter = g.pct === null ? null : letterFor(g.pct);
  const need = (min: number) => (g.remaining > 0 ? ((min / 100) * g.totalPossible - g.earned) / g.remaining : null);
  let line: string | null = null;
  if (g.remaining > 0) {
    const a = need(90)!;
    const b = need(80)!;
    const c = need(70)!;
    if (a <= 1) line = a <= (g.pct ?? 0) / 100 ? `On track for an A: ${round(a * 100)}% on what's left keeps it.` : `Still an A if you average ${round(a * 100)}% on what's left.`;
    else if (b <= 1) line = `An A is out of reach now; a B needs ${round(Math.max(0, b) * 100)}% on what's left.`;
    else if (c <= 1) line = `A C needs ${round(Math.max(0, c) * 100)}% on what's left.`;
    else line = 'The remaining points cannot lift this to a C.';
  } else if (g.pct !== null) {
    line = `Final: ${g.pct}%, ${letterFor(g.pct)}.`;
  }
  // The next big open item: what a zero on it would do with the rest at the current average.
  const nextBig = items.filter((i) => i.courseId === courseId && i.status !== 'done' && i.score === null && i.points >= 50).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  let zeroLine: string | null = null;
  if (nextBig && g.pct !== null) {
    const restAvg = g.pct / 100;
    const rest = g.remaining - nextBig.points;
    const pct = ((g.earned + rest * restAvg) / g.totalPossible) * 100;
    zeroLine = `Even a zero on ${nextBig.label} keeps you at ${/^[AEIOU]/.test(letterFor(pct)) ? 'an' : 'a'} ${letterFor(pct)} (${round(pct)}%) if the rest holds.`;
    if (pct < 70) zeroLine = `A zero on ${nextBig.label} would drop you to ${round(pct)}%. It matters.`;
  }
  return { line, zeroLine, letter };
}
