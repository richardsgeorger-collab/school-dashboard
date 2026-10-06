import { courseGrade, letterFor as scaleLetter } from './grades';
import type { Course, Item } from './types';

/** The usual A/B/C lines, for a class whose Halo scale is unknown. */
const DEFAULT_LETTERS: [string, number][] = [
  ['A', 90],
  ['B', 80],
  ['C', 70],
];

type Scale = Course['gradeScale'];
/**
 * A, B and C where this class draws them, from its own Halo scale (2026-10-05: GCU's is A ≥ 93, A- ≥ 90, B+ ≥ 87, and
 * the floor used to say "On track for an A" at 90). Plain letters only; the default when the scale has none.
 */
function lettersOf(scale: Scale): [string, number][] {
  const own = (['A', 'B', 'C'] as const).map((l) => [l, scale?.find((e) => e.label.trim() === l)?.minPercent ?? null] as const);
  return own.every(([, m]) => typeof m === 'number') ? (own as [string, number][]) : DEFAULT_LETTERS;
}
/** Halo's grade is points over points when it says what the points are; a class that weighs categories is not. */
export function weighted(course?: Pick<Course, 'haloGrade'> | null): boolean {
  const h = course?.haloGrade;
  if (!h || h.percent === null || !h.points || !h.maxPoints) return false;
  return Math.abs(h.percent - (h.points / h.maxPoints) * 100) > 0.5;
}
const round = (n: number) => Math.round(n);

export interface GradeFloor {
  /** "Still an A if you average 88% on what's left." */
  line: string | null;
  /** "Even a zero on Chem Exam 1 keeps you at a B." for the next big open item. */
  zeroLine: string | null;
  letter: string | null;
}

/** Is a bad score survivable? The average needed on the rest for each letter, and what a zero on the next big thing would do. */
export function gradeFloor(courseId: string, items: Item[], course?: Pick<Course, 'haloGrade' | 'gradeScale'> | null): GradeFloor {
  // A weighted class: points arithmetic would not match Halo, so nothing is said rather than a guess.
  if (weighted(course)) return { line: null, zeroLine: null, letter: null };
  const LETTERS = lettersOf(course?.gradeScale);
  const letterFor = (pct: number) => LETTERS.find(([, min]) => pct >= min)?.[0] ?? 'D or lower';
  const [aMin, bMin, cMin] = LETTERS.map(([, m]) => m);
  // Halo's own points when the class has them (2026-10-05: on items alone, CHM-113 at 95% read "a zero on Quiz 2 would
  // drop you to 43%", because only 20 of Halo's 200 graded points had a score in the planner).
  const g = courseGrade(courseId, items, course);
  if (g.possibleGraded === 0 || g.totalPossible === 0) return { line: null, zeroLine: null, letter: null };
  const letter = g.pct === null ? null : letterFor(g.pct);
  const need = (min: number) => (g.remaining > 0 ? ((min / 100) * g.totalPossible - g.earned) / g.remaining : null);
  let line: string | null = null;
  if (g.remaining > 0) {
    const a = need(aMin)!;
    const b = need(bMin)!;
    const c = need(cMin)!;
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
    // "Even a zero… keeps you at" only when it really keeps the letter, on the class's own full scale (A-, B+…), as Halo
    // shows it; a drop is said as a drop.
    const full = (p: number) => scaleLetter(p, course?.gradeScale) ?? letterFor(p);
    const after = full(pct);
    const now = g.pct === null ? null : (course?.haloGrade?.letter ?? full(g.pct));
    const an = (l: string) => (/^[AEIOU]/.test(l) ? 'an' : 'a');
    zeroLine =
      now && after === now
        ? `Even a zero on ${nextBig.label} keeps you at ${an(after)} ${after} (${pct.toFixed(1)}%) if the rest holds.`
        : pct < cMin
          ? `${nextBig.label} carries a lot: a zero would take you to ${pct.toFixed(1)}%.`
          : `${nextBig.label} carries a lot: a zero would take you to ${an(after)} ${after} (${pct.toFixed(1)}%).`;
  }
  return { line, zeroLine, letter };
}
