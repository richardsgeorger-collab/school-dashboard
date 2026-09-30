import { describe, expect, it } from 'vitest';
import { mkCourse, mkData, mkItem } from '../halo/fixtures';
import { examMode, examPressure } from './exam';
import { computeSchedule } from './schedule';

const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const today = '2026-09-21'; // Monday
const settings = { ...mkData([chm], []).settings, weekdayMinutes: 180, weekendMinutes: 300 };
const term = { start: '2026-09-08', end: '2026-12-20' };
const plan = (items: ReturnType<typeof mkItem>[]) => examMode(items, computeSchedule(items, settings, today, term, `${today}T15:00:00Z`), settings, today);

describe('exam mode', () => {
  const exam = mkItem({ id: 'ex', courseId: 'c1', title: 'Exam 1', label: 'Chem Exam 1', type: 'exam', points: 100, estimatedMinutes: 420, dueAt: '2026-09-25T07:00:00-07:00' });
  it('switches on for an exam within seven days and off otherwise', () => {
    expect(plan([exam])?.exam.id).toBe('ex');
    expect(plan([{ ...exam, dueAt: '2026-09-30T07:00:00-07:00' }])).toBeNull();
    expect(plan([{ ...exam, status: 'done' }])).toBeNull();
    expect(plan([{ ...exam, dueAt: '2026-09-20T07:00:00-07:00' }])).toBeNull();
    expect(plan([exam])?.daysLeft).toBe(4);
  });
  it('spreads the study across the days before a morning exam, inside capacity, and sums to what is needed', () => {
    const p = plan([exam])!;
    expect(p.sessions.map((s) => s.day)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    expect(p.sessions.reduce((n, s) => n + s.minutes, 0)).toBe(420);
    for (const s of p.sessions) expect(s.minutes).toBeLessThanOrEqual(180);
    expect(p.sessions[0].label).toBe('Today · 1.8h');
    expect(p.shortfall).toBe(0);
    expect(examPressure(p)).toBeNull();
  });
  it('keeps what is due before the exam, suppresses the rest, and reports a shortfall honestly', () => {
    const before = mkItem({ id: 'hw', courseId: 'c1', title: 'Topic 3 Homework', label: 'Chem HW 3', estimatedMinutes: 120, dueAt: '2026-09-23T23:59:00-07:00' });
    const after = mkItem({ id: 'later', courseId: 'c1', title: 'Topic 4 Homework', label: 'Chem HW 4', estimatedMinutes: 60, dueAt: '2026-09-28T23:59:00-07:00' });
    const part = mkItem({ id: 'part', courseId: 'c1', title: 'Participation', type: 'participation', dueAt: '2026-09-22T23:59:00-07:00' });
    const p = plan([exam, before, after, part])!;
    expect(p.mustDoBefore.map((i) => i.id)).toEqual(['hw']);
    expect(p.suppressed.map((i) => i.id)).toEqual(['later']);
    expect(examPressure(p)).toMatch(/1 other thing is due before the exam/);
    const big = plan([{ ...exam, estimatedMinutes: 1500 }])!;
    expect(big.shortfall).toBeGreaterThan(0);
    expect(examPressure(big)).toMatch(/will not fit before the exam/);
  });
  it('uses the exam day too when the exam is in the evening', () => {
    const p = plan([{ ...exam, dueAt: '2026-09-25T19:00:00-07:00' }])!;
    expect(p.sessions.at(-1)?.day).toBe('2026-09-25');
  });
});

describe('the first-day plan', () => {
  it('adds up to exactly the study the quiz needs (a 40-minute quiz is 40 minutes, not 45)', async () => {
    const { nextTestPlan } = await import('./exam');
    const quiz = mkItem({ id: 'q', courseId: 'c1', title: 'Quiz', label: 'UNV Quiz', type: 'quiz', points: 10, estimatedMinutes: 40, dueAt: '2026-09-24T23:59:00-07:00' });
    const items = [quiz];
    const p = nextTestPlan(items, computeSchedule(items, settings, today, term, `${today}T15:00:00Z`), settings, today)!;
    expect(p.sessions.reduce((n, s) => n + s.minutes, 0)).toBe(40);
    expect(p.sessions).toHaveLength(1);
    expect(p.sessions[0].label).toMatch(/· 40m$/);
    // The day before the quiz, not front-loaded to today.
    expect(p.sessions[0].day).toBe('2026-09-23');
    for (const m of [25, 70, 100, 135]) {
      const q = { ...quiz, estimatedMinutes: m };
      const r = nextTestPlan([q], computeSchedule([q], settings, today, term, `${today}T15:00:00Z`), settings, today)!;
      expect(r.sessions.reduce((n, s) => n + s.minutes, 0)).toBe(m);
      for (const s of r.sessions) expect(s.minutes).toBeGreaterThanOrEqual(15);
    }
  });
});
