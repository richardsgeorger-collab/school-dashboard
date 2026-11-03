import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cumulativeGpa, fmtGpa, semesterGpa } from '../domain/gpa';
import type { Course } from '../domain/types';

// The GPA on Halo (extension 0.12.18) is the app's GPA (src/domain/gpa.ts): the same classes give the same answer.
const ctx: Record<string, unknown> = { URL, Intl, Date };
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), ctx);
type Cls = { slug: string; code: string; g: number | null; gl?: string; gs?: [string, number][]; cr?: number };
const L = ctx.HaloPlusOnLogic as {
  gpaOf: (c: Cls[], own?: Record<string, number>, tryLetter?: Record<string, string>) => { gpa: number | null; credits: number; rows: { slug: string; letter: string | null; credits: number; left: string | null; tried: boolean }[] };
  gpaCumulative: (s: { gpa: number; credits: number } | null, sem: { gpa: number | null; credits: number }) => number | null;
  fmtGpa: (g: number | null) => string;
};

const course = (c: Cls, credits?: number, from?: 'halo' | 'student'): Course =>
  ({ id: c.slug, code: c.code, name: c.code, credits: credits ?? c.cr ?? NaN, creditsFrom: from, haloGrade: c.g === null && !c.gl ? null : { percent: c.g, letter: c.gl ?? null }, gradeScale: c.gs ? c.gs.map(([label, minPercent]) => ({ label, minPercent })) : [] }) as unknown as Course;

describe('the GPA on Halo is the app’s GPA (0.12.18)', () => {
  const classes: Cls[] = [
    { slug: 'bio', code: 'BIO-181', g: 91, gl: 'A-', cr: 4 },
    { slug: 'bio-l', code: 'BIO-181L', g: 88.4 },
    { slug: 'mat', code: 'MAT-250', g: 92.99, cr: 4 },
    { slug: 'psy', code: 'PSY-102', g: 76.5, cr: 3 },
    { slug: 'com', code: 'COM-100', g: null, cr: 3 },
    { slug: 'nur', code: 'NUR-100', g: 84, gs: [['A', 94], ['B', 84], ['C', 75], ['F', 0]], cr: 3 },
    { slug: 'odd', code: 'XYZ-101', g: 70, gl: 'C-', cr: 3 },
  ];
  it('the same GPA, credits, letters and classes left out', () => {
    const app = semesterGpa(classes.map((c) => course(c, c.cr, c.cr !== undefined ? 'halo' : undefined)));
    const ext = L.gpaOf(classes);
    expect(ext.gpa).toBeCloseTo(app.gpa as number, 10);
    expect(ext.credits).toBe(app.credits);
    expect(ext.rows.map((r) => [r.letter, r.credits, r.left])).toEqual(app.rows.map((r) => [r.letter, r.credits, r.left]));
    expect(L.fmtGpa(ext.gpa)).toBe(fmtGpa(app.gpa));
  });
  it('92.99 is an A-, never rounded up; a lab with no credits counts 1, any other class 3', () => {
    const r = L.gpaOf([{ slug: 'a', code: 'MAT-250', g: 92.99 }, { slug: 'b', code: 'CHM-113L', g: 95 }]);
    expect(r.rows.map((x) => [x.letter, x.credits])).toEqual([['A-', 3], ['A', 1]]);
  });
  it('the student’s credits win; a what-if letter replaces the grade and says so', () => {
    const own = { 'bio-l': 2 };
    const tryL = { psy: 'B' };
    const ext = L.gpaOf(classes, own, tryL);
    const app = semesterGpa(
      classes.map((c) => (c.slug === 'bio-l' ? course(c, 2, 'student') : course(c, c.cr, c.cr !== undefined ? 'halo' : undefined))),
      { psy: 83 },
    );
    expect(ext.gpa).toBeCloseTo(app.gpa as number, 10);
    expect(ext.rows.find((r) => r.slug === 'psy')).toMatchObject({ letter: 'B', tried: true });
    expect(ext.rows.find((r) => r.slug === 'bio-l')!.credits).toBe(2);
  });
  it('the GPA so far: the same projected cumulative GPA, and nothing for a GPA over 4', () => {
    const sem = L.gpaOf(classes);
    for (const so of [{ gpa: 3.2, credits: 45 }, { gpa: 4, credits: 0 }, { gpa: 0, credits: 12 }])
      expect(L.gpaCumulative(so, { gpa: sem.gpa, credits: sem.credits })).toBeCloseTo(cumulativeGpa(so, { gpa: sem.gpa, credits: sem.credits }) as number, 10);
    expect(L.gpaCumulative({ gpa: 4.5, credits: 10 }, { gpa: 3, credits: 15 })).toBeNull();
    expect(L.gpaCumulative({ gpa: 3.5, credits: 30 }, { gpa: null, credits: 0 })).toBe(3.5);
  });
  it('no classes with a grade: no GPA, shown as a dash', () => {
    const r = L.gpaOf([{ slug: 'x', code: 'X-1', g: null }]);
    expect(r.gpa).toBeNull();
    expect(L.fmtGpa(r.gpa)).toBe('–');
  });
});

describe('whose credits: the newer of this computer’s and the account’s (0.12.18)', () => {
  const M = L as unknown as { gpaMine: (l: unknown, s: unknown) => { cr: Record<string, number>; so: unknown } };
  it('an edit on Halo after the account’s copy wins; a later change in the app wins over it', () => {
    const local = { cr: { a: 2 }, so: { gpa: 3.1, credits: 30 }, at: '2026-11-03T10:00:00Z' };
    expect(M.gpaMine(local, { at: '2026-11-03T09:00:00Z', gso: { gpa: 3.5, credits: 40 } })).toEqual({ cr: { a: 2 }, so: { gpa: 3.1, credits: 30 } });
    expect(M.gpaMine(local, { at: '2026-11-03T11:00:00Z', gso: { gpa: 3.5, credits: 40 } })).toEqual({ cr: {}, so: { gpa: 3.5, credits: 40 } });
    expect(M.gpaMine(null, { at: '2026-11-03T11:00:00Z' })).toEqual({ cr: {}, so: null });
    expect(M.gpaMine(local, null)).toEqual({ cr: { a: 2 }, so: { gpa: 3.1, credits: 30 } });
  });
});
