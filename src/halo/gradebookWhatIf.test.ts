import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../domain/types';
import { classGrade, ladderFor, needFor } from '../domain/whatIfGrade';

// The what-if on Halo's Gradebook (extension/onhalo/logic.js, 0.12.14) must say what the app says (domain/whatIfGrade.ts):
// the same Halo anchor, the same what-ifs, the same ladder and the same "What do I need?".
const ctx: Record<string, unknown> = { URL, Intl, Date };
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), ctx);
type R = { id: string; points: number; score: number | null; published: boolean };
type H = { earned: number; max: number };
const L = ctx.HaloPlusOnLogic as {
  wiGrade: (h: H, rows: R[], s?: Record<string, number>) => { pct: number | null; earned: number; max: number };
  wiExact: (h: H, rows: R[]) => boolean;
  wiLetter: (pct: number | null, gs?: [string, number][]) => string | null;
  wiBig: (rows: R[], h: H, kind?: (r: R) => string) => R[];
  wiLadder: (h: H, rows: R[], s: Record<string, number>, item: R, gs?: [string, number][]) => { label: string; state: string; pct: number | null }[];
  wiNeed: (h: H, rows: R[], s: Record<string, number>, target: string, gs?: [string, number][]) => { state: string; avg?: number; best?: number } | null;
};

// One class two ways: Halo's gradebook rows (the extension) and the app's items.
const rows: R[] = [
  { id: 'q1', points: 50, score: 40, published: true },
  { id: 'hw', points: 150, score: 142, published: true },
  { id: 'ex', points: 100, score: null, published: false },
  { id: 'lab', points: 30, score: null, published: false },
  { id: 'p1', points: 2, score: null, published: false },
];
const halo = { earned: 182, max: 200 };
const course = { id: 'c', haloGrade: { letter: 'A-', points: 182, maxPoints: 200, percent: 91, at: '' } } as Course;
const items = rows.map((r) => ({ id: r.id, courseId: 'c', title: r.id, label: r.id, type: r.id === 'ex' ? 'exam' : r.id === 'lab' ? 'lab' : 'homework', points: r.points, score: r.score, scoreSource: r.score === null ? null : 'halo', dueAt: '2026-11-10T06:59:00.000Z', status: r.score === null ? 'todo' : 'done' }) as Item);
const input = { course, items };

describe('the Gradebook what-if says what the app says', () => {
  it('no what-ifs: Halo’s own grade', () => {
    expect(L.wiGrade(halo, rows).pct).toBe(91);
    expect(L.wiLetter(91)).toBe('A-');
  });
  for (const s of [{ ex: 90 }, { q1: 45 }, { ex: 70, lab: 30, p1: 2 }, { hw: 150, ex: 100 }] as Record<string, number>[]) {
    it(`the same percent for ${JSON.stringify(s)}`, () => {
      expect(L.wiGrade(halo, rows, s).pct).toBeCloseTo(classGrade(input, s).pct as number, 9);
    });
  }
  it('the same ladder for the exam, and the same "What do I need?"', () => {
    const app = ladderFor(input, {}, items[2]);
    const ext = L.wiLadder(halo, rows, {}, rows[2]);
    expect(ext.map((x) => [x.label, x.state, x.pct])).toEqual(app.map((x) => [x.label, x.state, x.pct]));
    const appNeed = needFor(input, {}, 'A');
    expect(L.wiNeed(halo, rows, {}, 'A')).toMatchObject({ state: appNeed!.state, avg: Math.ceil(appNeed!.avg as number) });
  });
  it('exact only when Halo’s rows add up to Halo’s total', () => {
    expect(L.wiExact(halo, rows)).toBe(true);
    expect(L.wiExact({ earned: 180, max: 200 }, rows)).toBe(false);
  });
  it('the big items: the exam and the lab, never a 2-point post', () => {
    expect(L.wiBig(rows, halo, (r) => (r.id === 'ex' ? 'exam' : r.id === 'lab' ? 'lab' : 'homework')).map((r) => r.id)).toEqual(['ex', 'lab']);
  });
  it('the class’s own letter scale when it has one, never rounded up', () => {
    expect(L.wiLetter(92.99)).toBe('A-');
    expect(L.wiLetter(89.9, [['A', 90], ['B', 80], ['F', 0]])).toBe('B');
  });
});
