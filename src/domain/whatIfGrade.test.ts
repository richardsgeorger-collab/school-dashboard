import { describe, expect, it } from 'vitest';
import type { Course, Item } from './types';
import { bigRemaining, classGrade, ladderFor, needFor, suggestCategories, swingOf, weightedPct, type Grading } from './whatIfGrade';

let k = 0;
const item = (p: Partial<Item>): Item => ({ id: `i${k++}`, courseId: 'c', title: 'Item', label: 'Item', type: 'homework', points: 10, dueAt: '2026-11-10T06:59:00.000Z', status: 'todo', score: null, scoreSource: null, ...p }) as Item;
const course = (p: Partial<Course> = {}) => ({ id: 'c', haloGrade: null, gradeScale: undefined, ...p }) as Course;
const r = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000);

describe('points, anchored on Halo’s own grade', () => {
  // Halo: 182 of 200 = 91.0% (A-). The items here add up to 180 of 200 (a score Halo+ has not synced): Halo wins.
  const quiz = item({ type: 'quiz', points: 50, score: 40, scoreSource: 'halo', status: 'done' });
  const hw = item({ points: 150, score: 140, scoreSource: 'halo', status: 'done' });
  const exam = item({ type: 'exam', points: 100, title: 'Exam 2' });
  const c = course({ haloGrade: { letter: 'A-', points: 182, maxPoints: 200, percent: 91, at: '' } });
  const input = { course: c, items: [quiz, hw, exam] };

  it('with no what-ifs, exactly Halo’s grade', () => {
    expect(classGrade(input)).toMatchObject({ pct: 91, letter: 'A-', basis: 'exact', earned: 182, possible: 200 });
  });
  it('a what-if on an open item adds its score and its points', () => {
    // (182 + 90) / (200 + 100) = 90.667%
    expect(r(classGrade(input, { [exam.id]: 90 }).pct)).toBe(90.667);
  });
  it('a retake on a graded item moves earned points by the difference only', () => {
    // Quiz 40 → 45: (182 + 5) / 200 = 93.5%, an A.
    expect(classGrade(input, { [quiz.id]: 45 })).toMatchObject({ pct: 93.5, letter: 'A', possible: 200 });
  });
  it('a typed score is not in Halo’s points: it counts like a what-if, never changes Halo’s number', () => {
    const typed = item({ points: 20, score: 18, scoreSource: 'manual', status: 'done' });
    expect(classGrade({ course: c, items: [quiz, hw, exam, typed] }).pct).toBe(91);
    expect(r(classGrade({ course: c, items: [quiz, hw, exam, typed] }, { [typed.id]: 20 }).pct)).toBe(r((202 / 220) * 100));
  });
  it('extra credit the way Halo counts it: points above the max, and 0-point items, add to earned only', () => {
    const bonus = item({ points: 0, title: 'Extra credit' });
    expect(r(classGrade({ course: c, items: [quiz, hw, exam, bonus] }, { [bonus.id]: 5 }).pct)).toBe(93.5);
    expect(r(classGrade(input, { [exam.id]: 105 }).pct)).toBe(r((287 / 300) * 100));
  });
  it('uses the class’s own cutoffs for the letter, never rounding up', () => {
    const own = course({ haloGrade: { letter: 'B', points: 179.8, maxPoints: 200, percent: 89.9, at: '' }, gradeScale: [{ label: 'A', minPercent: 90, maxPercent: 100 }, { label: 'B', minPercent: 80, maxPercent: 89.99 }, { label: 'F', minPercent: 0, maxPercent: 79.99 }] });
    expect(classGrade({ course: own, items: [] }).letter).toBe('B');
  });
});

describe('points from the student’s own scores (no Halo grade yet)', () => {
  it('earned over possible, ungraded items left out', () => {
    const items = [item({ points: 50, score: 45 }), item({ points: 20, score: 18 }), item({ points: 100 })];
    expect(classGrade({ course: course(), items })).toMatchObject({ pct: 90, basis: 'yours' });
  });
  it('nothing graded: no grade, never 0%', () => {
    expect(classGrade({ course: course(), items: [item({ points: 100 })] })).toMatchObject({ pct: null, letter: null });
  });
});

describe('weighted categories (entered from the syllabus)', () => {
  const g: Grading = {
    mode: 'weighted',
    categories: [
      { id: 'ex', name: 'Exams', weight: 50, drop: 0 },
      { id: 'hw', name: 'Assignments', weight: 30, drop: 1 },
      { id: 'pa', name: 'Participation', weight: 20, drop: 0 },
    ],
    assign: {},
  };
  const e1 = item({ type: 'exam', points: 100, score: 60 });
  const e2 = item({ type: 'exam', points: 100, score: 80 });
  const h = [item({ score: 9 }), item({ score: 10 }), item({ score: 5 })];
  const part = item({ type: 'participation', points: 5 });
  const items = [e1, e2, ...h, part];

  it('hand check: exams 140/200 = 70%, assignments with the lowest dropped 19/20 = 95%, participation empty and waiting', () => {
    // (50 × 0.70 + 30 × 0.95) / 80 = 79.375%
    expect(weightedPct(items, g, {})).toBe(79.375);
    expect(classGrade({ course: course(), items, grading: g })).toMatchObject({ pct: 79.375, letter: 'C+', basis: 'yours' });
  });
  it('an empty category starts counting with its first score', () => {
    // Participation 5/5: (35 + 28.5 + 20) / 100 = 83.5%
    expect(weightedPct(items, g, { [part.id]: 5 })).toBe(83.5);
  });
  it('a drop never drops every score', () => {
    const solo: Grading = { ...g, categories: [{ id: 'hw', name: 'Assignments', weight: 100, drop: 5 }] };
    expect(weightedPct([item({ score: 4 }), item({ score: 8 })], solo, {})).toBe(80);
  });
  it('an extra-credit category adds its weight on top', () => {
    const ec: Grading = { ...g, categories: [...g.categories, { id: 'xc', name: 'Extra credit', weight: 2, drop: 0, extra: true }], assign: {} };
    const bonus = item({ points: 5, score: 5 });
    ec.assign[bonus.id] = 'xc';
    expect(weightedPct([...items, bonus], ec, {})).toBe(81.375);
  });
  it('exact only when the weights reproduce Halo’s grade; otherwise an estimate that says why', () => {
    const agrees = course({ haloGrade: { letter: 'C+', points: 1, maxPoints: 1, percent: 79.375, at: '' } });
    expect(classGrade({ course: agrees, items, grading: g }).basis).toBe('exact');
    const off = course({ haloGrade: { letter: 'B', points: 1, maxPoints: 1, percent: 84, at: '' } });
    const e = classGrade({ course: off, items, grading: g });
    expect(e.basis).toBe('estimate');
    expect(e.pct).toBe(84);
    expect(e.why).toMatch(/^Your weights give 79\.4% today; Halo shows 84\.0%/);
  });
  it('a weighted class with no weights entered: an estimate on top of Halo’s grade, never a confident number', () => {
    // Halo 85% while its points say 70%: Halo weighs categories.
    const w = course({ haloGrade: { letter: 'B', points: 70, maxPoints: 100, percent: 85, at: '' } });
    const g0 = classGrade({ course: w, items: [item({ points: 100, score: 70 }), item({ points: 100 })] });
    expect(g0).toMatchObject({ pct: 85, basis: 'estimate' });
    expect(g0.why).toMatch(/weighs this class/);
  });
  it('suggests one category per kind of work, weighted by points', () => {
    expect(suggestCategories([item({ type: 'exam', points: 200 }), item({ points: 100 }), item({ type: 'discussion', points: 100 })])).toEqual([
      { id: 'exams', name: 'Exams', weight: 50, drop: 0 },
      { id: 'assignments', name: 'Assignments', weight: 25, drop: 0 },
      { id: 'discussions', name: 'Discussions', weight: 25, drop: 0 },
    ]);
  });
});

describe('What do I need?', () => {
  // 80 of 100 graded, 100 points to come (Exam 2 60, Final 40).
  const done = item({ points: 100, score: 80 });
  const ex2 = item({ type: 'exam', points: 60, title: 'Exam 2' });
  const fin = item({ type: 'exam', points: 40, title: 'Final' });
  const input = { course: course(), items: [done, ex2, fin] };

  it('the lowest average on what is left: a B (83%) needs 86% on the rest', () => {
    // (80 + x) / 200 ≥ 0.83 → x ≥ 86 points of 100 → 86%.
    expect(needFor(input, {}, 'B')).toMatchObject({ state: 'needs', avg: 86, cutoff: 83 });
  });
  it('out of reach: says so, with the best grade possible', () => {
    expect(needFor(input, {}, 'A')).toMatchObject({ state: 'impossible', best: { pct: 90, letter: 'A-' } });
  });
  it('locked in when a zero on the rest still makes it', () => {
    const safe = { course: course(), items: [item({ points: 180, score: 180 }), item({ type: 'exam', points: 20 })] };
    // 180 of 200 even with a zero on the last 20: 90%, an A-. An A still needs (180 + x) / 200 ≥ 0.93: x ≥ 6 of 20 = 30%.
    expect(needFor(safe, {}, 'A-')).toMatchObject({ state: 'locked', worst: { pct: 90, letter: 'A-' } });
    expect(needFor(safe, {}, 'A')).toMatchObject({ state: 'needs', avg: 30 });
  });
  it('a what-if already given is kept; the rest carries the need', () => {
    // Exam 2 at 54/60: (80 + 54 + y) / 200 ≥ 0.83 → y ≥ 32 of 40 → 80%.
    expect(needFor(input, { [ex2.id]: 54 }, 'B')).toMatchObject({ state: 'needs', avg: 80 });
  });
  it('the big items it spreads across, biggest first', () => {
    expect(bigRemaining(input.items, 'c', {}).map((i) => i.title)).toEqual(['Exam 2', 'Final']);
  });
  it('with Halo’s anchor, the same arithmetic on Halo’s points', () => {
    const c = course({ haloGrade: { letter: 'B-', points: 80, maxPoints: 100, percent: 80, at: '' } });
    expect(needFor({ course: c, items: [ex2, fin] }, {}, 'B')).toMatchObject({ state: 'needs', avg: 86 });
  });
});

describe('the exam-day ladder and what an item is worth', () => {
  const done = item({ points: 100, score: 85 });
  const exam = item({ type: 'exam', points: 100, title: 'Exam 2' });
  const input = { course: course(), items: [done, exam] };
  it('the score on the next exam for each letter, right after it', () => {
    const l = ladderFor(input, {}, exam);
    // A: (85 + x)/200 ≥ 0.93 → x ≥ 101: out of reach. A-: x ≥ 95. B+: 89. B: 81. C: 55. D: 35.
    expect(l.find((x) => x.label === 'A')).toMatchObject({ state: 'impossible' });
    expect(l.find((x) => x.label === 'A-')).toMatchObject({ state: 'needs', pct: 95 });
    expect(l.find((x) => x.label === 'B')).toMatchObject({ state: 'needs', pct: 81 });
    expect(l.find((x) => x.label === 'D')).toMatchObject({ state: 'needs', pct: 35 });
  });
  it('each 10% on the exam moves the class 5 points', () => {
    expect(swingOf(input, {}, exam)).toBe(5);
  });
});

describe('Maya Torres (the made-up demo student): with no what-ifs, every class equals Halo’s grade', () => {
  it('each class: the same percent and letter as Halo’s, exact', async () => {
    const { demoStudent } = await import('../demo/student');
    const d = demoStudent('2026-10-29T17:00:00.000Z').data;
    expect(d.courses.length).toBe(6);
    for (const c of d.courses) {
      const g = classGrade({ course: c, items: d.items });
      expect({ code: c.code, pct: g.pct, letter: g.letter, basis: g.basis }).toEqual({ code: c.code, pct: c.haloGrade!.percent, letter: c.haloGrade!.letter, basis: 'exact' });
    }
  });
});
