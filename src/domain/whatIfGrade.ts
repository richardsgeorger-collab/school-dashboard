import { weighted } from './floor';
import { letterForPercent } from './gpa';
import type { Course, Item, ItemType } from './types';

/**
 * What-if grades (George, 2026-10-29: "much better… before every exam"). One engine for the class page's what-if, "What
 * do I need?", and the GPA sheet. Pure; every number is tested (whatIfGrade.test.ts).
 *
 * How Halo grades a class (its gradebook: getAllClassGrades.finalGrade): finalPoints over maxPoints, counting a grade
 * only once it is PUBLISHED. Halo shares no category weights, no drops and no extra-credit flags. So:
 * - A points class with Halo's grade on hand ("anchored"): the start is Halo's own points, never a re-sum of the
 *   items (an item Halo+ has not synced, or one it has under another score, would make the re-sum differ). A what-if
 *   on an item Halo has graded moves the earned points by the difference from its real score; one on an open item adds
 *   its score and its points. With no what-ifs the result is Halo's percent, exactly. Extra credit is what Halo does:
 *   a score above an item's points, or a 0-point item with a score, adds to earned points only.
 * - A class whose Halo percent is not its points share weighs categories. The student can enter the syllabus's weights
 *   (with drops and extra credit); the result is checked against Halo's percent and called exact only when it agrees.
 *   Without weights it is an estimate: Halo's percent moved by the points arithmetic, said so, with why.
 * - No Halo grade yet: the items' own scores ("from your scores").
 */

export interface Category {
  id: string;
  name: string;
  /** Share of the class, in percent. */
  weight: number;
  /** Drop this many of the lowest graded scores (by percent) in the category. */
  drop: number;
  /** An extra-credit category: its weight is added on top, never in the denominator. */
  extra?: boolean;
}

export interface Grading {
  mode: 'points' | 'weighted';
  categories: Category[];
  /** Which category an item is in; an item not listed goes by its type (TYPE_CATEGORY). */
  assign: Record<string, string>;
}

/** A score for an item in a scenario, in points earned (the UI converts percent). */
export type Scenario = Record<string, number>;

export type Basis = 'exact' | 'estimate' | 'yours';
export interface ClassGrade {
  /** The class percent, unrounded. Null when there is nothing graded yet. */
  pct: number | null;
  letter: string | null;
  basis: Basis;
  /** Why it is an estimate, in plain words. */
  why: string | null;
  earned: number;
  possible: number;
}

/** Up to the next tenth, past floating-point noise (86.0000001 is 86.0, not 86.1). */
const up1 = (x: number) => Math.ceil(x * 10 - 1e-6) / 10;
const norm = (l: string) => l.trim().toUpperCase().replace(/\s+/g, '');
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isExtra = (i: Pick<Item, 'points'>) => i.points <= 0;
/** An item that counts toward the grade once scored. 0-point items count only as extra credit (when scored). */
export const graded = (i: Pick<Item, 'score'>) => finite(i.score);
/** Halo has graded it: Halo's score, which Halo's own points already hold. A typed score is not in Halo's points. */
const inHalo = (i: Pick<Item, 'score' | 'scoreSource'>) => graded(i) && i.scoreSource !== 'manual';

export const TYPE_CATEGORY: Record<ItemType, string> = { exam: 'Exams', quiz: 'Quizzes', homework: 'Assignments', lab: 'Labs', paper: 'Assignments', project: 'Assignments', discussion: 'Discussions', participation: 'Participation', other: 'Assignments' };
export const categoryOf = (item: Pick<Item, 'id' | 'type'>, grading: Grading): string => grading.assign[item.id] ?? grading.categories.find((c) => c.name === TYPE_CATEGORY[item.type])?.id ?? grading.categories[0]?.id ?? '';

/** A starting point from the class's items: one category per kind of work, weighted by its points, none dropped. */
export function suggestCategories(items: Pick<Item, 'type' | 'points'>[]): Category[] {
  const by = new Map<string, number>();
  for (const i of items) by.set(TYPE_CATEGORY[i.type], (by.get(TYPE_CATEGORY[i.type]) ?? 0) + Math.max(0, i.points));
  const total = [...by.values()].reduce((a, b) => a + b, 0) || 1;
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([name, pts]) => ({ id: name.toLowerCase(), name, weight: Math.round((pts / total) * 100), drop: 0 }));
}

/** An item's score in a scenario: the what-if when there is one, else its real score (null when open). */
const scoreIn = (i: Pick<Item, 'id' | 'score'>, s: Scenario): number | null => (finite(s[i.id]) ? s[i.id] : finite(i.score) ? i.score : null);

/** Points: earned over possible from the items themselves, extra credit included. */
function pointsOf(items: Item[], s: Scenario): { earned: number; possible: number } {
  let earned = 0;
  let possible = 0;
  for (const i of items) {
    const sc = scoreIn(i, s);
    if (sc === null) continue;
    earned += sc;
    possible += Math.max(0, i.points);
  }
  return { earned, possible };
}

/** Weighted: each category's earned over possible after its drops, weighted, over the weights of categories with grades. */
export function weightedPct(items: Item[], grading: Grading, s: Scenario): number | null {
  let sum = 0;
  let weights = 0;
  let bonus = 0;
  for (const c of grading.categories) {
    const mine = items.filter((i) => categoryOf(i, grading) === c.id);
    const scored = mine.map((i) => ({ i, sc: scoreIn(i, s) })).filter((x): x is { i: Item; sc: number } => x.sc !== null);
    // Drop the lowest by percent, never an extra-credit item, never every score.
    const ranked = scored.filter((x) => !isExtra(x.i)).sort((a, b) => a.sc / a.i.points - b.sc / b.i.points);
    const dropped = new Set(ranked.slice(0, Math.min(Math.max(0, Math.floor(c.drop)), Math.max(0, ranked.length - 1))).map((x) => x.i.id));
    let e = 0;
    let p = 0;
    for (const x of scored) {
      if (dropped.has(x.i.id)) continue;
      e += x.sc;
      p += Math.max(0, x.i.points);
    }
    if (c.extra) {
      if (p > 0) bonus += c.weight * Math.min(1, e / p);
      continue;
    }
    // An empty category (nothing graded) does not count yet: its weight waits.
    if (p <= 0) continue;
    sum += c.weight * (e / p);
    weights += c.weight;
  }
  if (weights <= 0) return null;
  return (sum / weights) * 100 + bonus;
}

export interface ClassInput {
  course: Pick<Course, 'id' | 'haloGrade' | 'gradeScale'>;
  items: Item[];
  grading?: Grading | null;
}

/** The class percent under a scenario. With an empty scenario: Halo's own percent when exact. */
export function classGrade(input: ClassInput, s: Scenario = {}): ClassGrade {
  const { course, grading } = input;
  const items = input.items.filter((i) => i.courseId === course.id);
  const h = course.haloGrade;
  const scale = course.gradeScale;
  const letter = (pct: number | null) => (pct === null ? null : letterForPercent(pct, scale));
  const haloPts = h && finite(h.points) && finite(h.maxPoints) && h.maxPoints > 0 ? { points: h.points, max: h.maxPoints } : null;

  if (grading?.mode === 'weighted' && grading.categories.length) {
    const base = weightedPct(items, grading, {});
    const pct = weightedPct(items, grading, s);
    const agree = h && finite(h.percent) && base !== null ? Math.abs(base - h.percent) < 0.05 : null;
    const pts = pointsOf(items, s);
    if (agree === false)
      return { pct: pct === null ? null : pct + (h!.percent! - base!), letter: letter(pct === null ? null : pct + (h!.percent! - base!)), basis: 'estimate', why: `Your weights give ${base!.toFixed(1)}% today; Halo shows ${h!.percent!.toFixed(1)}%. Check them against the syllabus.`, ...pts };
    return { pct, letter: letter(pct), basis: agree ? 'exact' : 'yours', why: null, ...pts };
  }

  if (haloPts && !weighted(course)) {
    // Anchored on Halo's own points: exact with no what-ifs, by construction.
    let earned = haloPts.points;
    let possible = haloPts.max;
    for (const i of items) {
      if (!finite(s[i.id])) continue;
      if (inHalo(i)) earned += s[i.id] - (i.score as number);
      else {
        earned += s[i.id];
        possible += Math.max(0, i.points);
      }
    }
    // Halo's own percent, moved by exactly what the what-ifs change: with none, Halo's number to the digit.
    const pct = possible > 0 ? (finite(h!.percent) ? h!.percent : (haloPts.points / haloPts.max) * 100) + ((earned / possible) - haloPts.points / haloPts.max) * 100 : null;
    return { pct, letter: earned === haloPts.points && possible === haloPts.max && h!.letter ? norm(h!.letter) : letter(pct), basis: 'exact', why: null, earned, possible };
  }

  if (h && finite(h.percent)) {
    // Halo weighs this class and no weights are entered: Halo's percent moved by the points arithmetic.
    const base = pointsOf(items, {});
    const now = pointsOf(items, s);
    const shift = base.possible > 0 && now.possible > 0 ? (now.earned / now.possible - base.earned / base.possible) * 100 : 0;
    const pct = h.percent + shift;
    return { pct, letter: letter(pct), basis: 'estimate', why: 'Halo weighs this class by categories and does not share the weights, so this is points arithmetic on top of Halo’s grade. Add the weights from your syllabus to make it exact.', ...now };
  }

  const pts = pointsOf(items, s);
  const pct = pts.possible > 0 ? (pts.earned / pts.possible) * 100 : null;
  return { pct, letter: letter(pct), basis: 'yours', why: null, ...pts };
}

/** What is still to come: open items that count (points above zero), soonest first. */
export const remainingOf = (items: Item[], courseId: string): Item[] => items.filter((i) => i.courseId === courseId && !graded(i) && i.points > 0).sort((a, b) => a.dueAt.localeCompare(b.dueAt));

export interface Need {
  target: string;
  /** The lowest percent of the class's cutoff for the target. */
  cutoff: number;
  state: 'locked' | 'impossible' | 'needs' | 'nothing-left';
  /** The average needed on what is left, in percent (state 'needs'). */
  avg: number | null;
  /** The best grade possible: everything left at 100%. */
  best: { pct: number; letter: string } | null;
  /** The end-of-term grade if everything left scores zero. */
  worst: { pct: number; letter: string } | null;
}

/** The scale's letters, best first, with their cutoffs (the class's own, else GCU's). */
export function cutoffs(scale: Course['gradeScale']): { label: string; min: number }[] {
  const own = (scale ?? []).filter((e) => e.label && finite(e.minPercent)).map((e) => ({ label: e.label.trim(), min: e.minPercent as number }));
  const use = own.length ? own : [
    { label: 'A', min: 93 }, { label: 'A-', min: 90 }, { label: 'B+', min: 87 }, { label: 'B', min: 83 }, { label: 'B-', min: 80 }, { label: 'C+', min: 77 }, { label: 'C', min: 70 }, { label: 'D', min: 60 }, { label: 'F', min: 0 },
  ];
  return use.sort((a, b) => b.min - a.min);
}

/** The end-of-term grade with every remaining item (not already given a what-if) at `x` percent. */
export function finalAt(input: ClassInput, s: Scenario, x: number): ClassGrade {
  const rest: Scenario = { ...s };
  for (const i of remainingOf(input.items, input.course.id)) if (!finite(s[i.id])) rest[i.id] = (i.points * x) / 100;
  return classGrade(input, rest);
}

/**
 * "What do I need?": the lowest average on everything still to come (the same percent on each, the items given a
 * what-if kept at it) for the end-of-term grade to reach `target`'s cutoff. Locked in when a zero on the rest still
 * makes it; out of reach when 100% on the rest does not, with the best grade possible.
 */
export function needFor(input: ClassInput, s: Scenario, target: string): Need | null {
  const cut = cutoffs(input.course.gradeScale).find((c) => c.label.toUpperCase() === target.toUpperCase());
  if (!cut) return null;
  const open = remainingOf(input.items, input.course.id).filter((i) => !finite(s[i.id]));
  const top = finalAt(input, s, 100);
  const bottom = finalAt(input, s, 0);
  const best = top.pct === null ? null : { pct: top.pct, letter: top.letter ?? '' };
  const worst = bottom.pct === null ? null : { pct: bottom.pct, letter: bottom.letter ?? '' };
  const base = { target: cut.label, cutoff: cut.min, best, worst };
  if (open.length === 0) return { ...base, state: 'nothing-left', avg: null };
  if (bottom.pct !== null && bottom.pct >= cut.min) return { ...base, state: 'locked', avg: null };
  if (top.pct === null || top.pct < cut.min) return { ...base, state: 'impossible', avg: null };
  // The grade rises with the average on the rest: find the lowest average that reaches the cutoff (to 0.1%).
  let lo = 0;
  let hi = 100;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const g = finalAt(input, s, mid).pct ?? 0;
    if (g >= cut.min) hi = mid;
    else lo = mid;
  }
  return { ...base, state: 'needs', avg: up1(hi) };
}

/** The biggest items still to come (by their share of what is left), at most `n`, for "Exam 2: 82%, Final: 82%". */
export function bigRemaining(items: Item[], courseId: string, s: Scenario, n = 3): Item[] {
  const open = remainingOf(items, courseId).filter((i) => !finite(s[i.id]));
  const total = open.reduce((a, i) => a + i.points, 0) || 1;
  return open
    .filter((i) => i.points / total >= 0.08)
    .sort((a, b) => b.points - a.points || a.dueAt.localeCompare(b.dueAt))
    .slice(0, n);
}

/** How much the class grade moves for each 10% on an item, everything else as it is: what an item is worth now. */
export function swingOf(input: ClassInput, s: Scenario, item: Item): number {
  const at = (pct: number) => classGrade(input, { ...s, [item.id]: (item.points * pct) / 100 }).pct ?? 0;
  return (at(100) - at(0)) / 10;
}

/** For the next big item: the score it takes for each letter, everything else as it is (the exam-day ladder). */
export function ladderFor(input: ClassInput, s: Scenario, item: Item): { label: string; pct: number | null; state: 'locked' | 'needs' | 'impossible' }[] {
  const at = (pct: number) => classGrade(input, { ...s, [item.id]: (item.points * pct) / 100 }).pct ?? 0;
  return cutoffs(input.course.gradeScale)
    .filter((c) => c.min > 0)
    .map((c) => {
      if (at(0) >= c.min) return { label: c.label, pct: null, state: 'locked' as const };
      if (at(100) < c.min) return { label: c.label, pct: null, state: 'impossible' as const };
      let lo = 0;
      let hi = 100;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (at(mid) >= c.min) hi = mid;
        else lo = mid;
      }
      return { label: c.label, pct: up1(hi), state: 'needs' as const };
    });
}

/** Kinds of work that move a grade when they are worth anything (George, 2026-10-29: "exams, quizzes, labs, big assignments"). */
const BIG_KINDS = new Set<ItemType>(['exam', 'quiz', 'lab', 'paper', 'project']);

/**
 * What a first-time student needs to see (2026-10-29): the items that really move the grade, and everything small in
 * one bundle. Big: 4% or more of the class's points, or an exam, quiz, lab, paper or project worth 2% or more. Small:
 * the rest (participation posts, short homework, activities). The class's points are Halo's possible so far plus
 * everything still to come.
 */
export function splitByWeight(input: ClassInput, items: Item[]): { big: Item[]; small: Item[] } {
  const h = input.course.haloGrade;
  const mine = input.items.filter((i) => i.courseId === input.course.id);
  const gradedPossible = h && finite(h.maxPoints) && h.maxPoints > 0 ? h.maxPoints : mine.filter((i) => graded(i)).reduce((a, i) => a + Math.max(0, i.points), 0);
  const total = gradedPossible + remainingOf(input.items, input.course.id).reduce((a, i) => a + i.points, 0) || 1;
  const isBig = (i: Item) => i.points / total >= 0.04 || (BIG_KINDS.has(i.type) && i.points / total >= 0.02);
  const big = items.filter(isBig).sort((a, b) => b.points - a.points || a.dueAt.localeCompare(b.dueAt));
  return { big, small: items.filter((i) => !isBig(i)) };
}

/** The student's average so far on the small kind of work (graded small items), else the class grade: where "Everything else" starts. */
export function smallAverage(input: ClassInput): number | null {
  const mine = input.items.filter((i) => i.courseId === input.course.id && graded(i) && i.points > 0);
  const { small } = splitByWeight(input, mine);
  const pts = small.reduce((a, i) => a + i.points, 0);
  if (pts > 0) return (small.reduce((a, i) => a + (i.score as number), 0) / pts) * 100;
  return classGrade(input).pct;
}
