import { courseGrade, letterFor as scaleLetter } from './grades';
import type { Course, Item } from './types';

type Scale = NonNullable<Course['gradeScale']>;
/** GCU's published scale, only for a class whose Halo gives no scale of its own. */
export const GCU_SCALE: Scale = [
  { label: 'A', minPercent: 93, maxPercent: null },
  { label: 'A-', minPercent: 90, maxPercent: 92.99 },
  { label: 'B+', minPercent: 87, maxPercent: 89.99 },
  { label: 'B', minPercent: 83, maxPercent: 86.99 },
  { label: 'B-', minPercent: 80, maxPercent: 82.99 },
  { label: 'C+', minPercent: 77, maxPercent: 79.99 },
  { label: 'C', minPercent: 70, maxPercent: 76.99 },
  { label: 'D', minPercent: 60, maxPercent: 69.99 },
  { label: 'F', minPercent: 0, maxPercent: 59.99 },
];
/** Where A, B and C start on a scale: the plain letter's line, else the lowest of its family (A-, B-…). */
function linesOf(scale: Scale): [string, number][] | null {
  const out = (['A', 'B', 'C'] as const).map((l) => {
    const plain = scale.find((e) => e.label.trim() === l)?.minPercent;
    const fam = scale.filter((e) => e.label.trim().startsWith(l) && typeof e.minPercent === 'number').map((e) => e.minPercent as number);
    return [l, plain ?? (fam.length ? Math.min(...fam) : null)] as const;
  });
  return out.every(([, m]) => typeof m === 'number') ? (out as [string, number][]) : null;
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
  // The letter Halo shows wins (George, 2026-10-05: professors use their own scales). Letters for other percents come
  // from the class's Halo scale, else GCU's; a scale that disagrees with Halo's own letter is not this class's, so then
  // nothing is said in letters, only in percents.
  const scale = course?.gradeScale?.length ? course.gradeScale : GCU_SCALE;
  const halo = course?.haloGrade ?? null;
  const trusted = !(halo?.letter && halo.percent !== null && scaleLetter(halo.percent, scale) !== halo.letter.trim());
  const LINES = trusted ? linesOf(scale) : null;
  const full = (p: number) => scaleLetter(p, scale) ?? null;
  // Halo's own points when the class has them (2026-10-05: on items alone, CHM-113 at 95% read "a zero on Quiz 2 would
  // drop you to 43%", because only 20 of Halo's 200 graded points had a score in the planner).
  const g = courseGrade(courseId, items, course);
  if (g.possibleGraded === 0 || g.totalPossible === 0) return { line: null, zeroLine: null, letter: null };
  const letter = halo?.letter?.trim() || (g.pct === null || !trusted ? null : full(g.pct));
  const need = (min: number) => (g.remaining > 0 ? ((min / 100) * g.totalPossible - g.earned) / g.remaining : null);
  let line: string | null = null;
  if (LINES && g.remaining > 0) {
    const [aMin, bMin, cMin] = LINES.map(([, m]) => m);
    const a = need(aMin)!;
    const b = need(bMin)!;
    const c = need(cMin)!;
    if (a <= 1) line = a <= (g.pct ?? 0) / 100 ? `On track for an A: ${round(a * 100)}% on what's left keeps it.` : `Still an A if you average ${round(a * 100)}% on what's left.`;
    else if (b <= 1) line = `An A is out of reach now; a B needs ${round(Math.max(0, b) * 100)}% on what's left.`;
    else if (c <= 1) line = `A C needs ${round(Math.max(0, c) * 100)}% on what's left.`;
    else line = 'The remaining points cannot lift this to a C.';
  } else if (g.remaining === 0 && g.pct !== null && letter) {
    line = `Final: ${g.pct}%, ${letter}.`;
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
    const after = trusted ? full(pct) : null;
    const an = (l: string) => (/^[AEIOUF]/.test(l) ? 'an' : 'a');
    zeroLine =
      !after
        ? `${nextBig.label} carries a lot: a zero would take you to ${pct.toFixed(1)}%.`
        : letter && after === letter
        ? `Even a zero on ${nextBig.label} keeps you at ${an(after)} ${after} (${pct.toFixed(1)}%) if the rest holds.`
        : LINES && pct < LINES[2][1]
          ? `${nextBig.label} carries a lot: a zero would take you to ${pct.toFixed(1)}%.`
          : `${nextBig.label} carries a lot: a zero would take you to ${an(after)} ${after} (${pct.toFixed(1)}%).`;
  }
  return { line, zeroLine, letter };
}
