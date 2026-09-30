import { describe, expect, it } from 'vitest';
import { mkItem } from '../halo/fixtures';
import { barAppeared, nextBig } from './Onboarding';
import { upgradeDue } from './Upgrade';

describe('the bookmarks bar', () => {
  it('appearing shrinks the page by 18 to 60px while the window keeps its size', () => {
    expect(barAppeared({ outer: 900, inner: 815 }, { outer: 900, inner: 787 })).toBe(true);
    expect(barAppeared({ outer: 900, inner: 815 }, { outer: 860, inner: 775 })).toBe(false);
    expect(barAppeared({ outer: 900, inner: 815 }, { outer: 900, inner: 600 })).toBe(false);
  });
});

describe('the payoff', () => {
  it("names the next big deadline: the most points in the next two weeks, soonest on a tie, never participation", () => {
    const tz = 'America/Phoenix';
    const items = [
      mkItem({ id: 'a', courseId: 'c', title: 'Topic 3 DQ', points: 5, dueAt: '2026-09-30T06:59:00.000Z' }),
      mkItem({ id: 'b', courseId: 'c', title: 'Lab 3 report', points: 50, dueAt: '2026-10-10T06:59:00.000Z' }),
      mkItem({ id: 'c', courseId: 'c', title: 'Week 2 Participation', type: 'participation', points: 100, dueAt: '2026-10-01T06:59:00.000Z' }),
      mkItem({ id: 'd', courseId: 'c', title: 'Final paper', points: 300, dueAt: '2026-12-10T06:59:00.000Z' }),
    ];
    expect(nextBig(items, '2026-09-28', tz)?.id).toBe('b');
  });
});

describe('the upgrade welcome', () => {
  it('Max for a Max account (paid, trial or friend), Plus for Plus, once each; Plus to Max shows only Max', () => {
    expect(upgradeDue('max', undefined)).toBe('max');
    expect(upgradeDue('max', { max: 'x' })).toBeNull();
    expect(upgradeDue('plus', undefined)).toBe('plus');
    expect(upgradeDue('plus', { plus: 'x' })).toBeNull();
    // Someone who saw Plus and then upgrades: only the Max part.
    expect(upgradeDue('max', { plus: 'x' })).toBe('max');
    // Someone who saw Max never gets Plus after (Max included it).
    expect(upgradeDue('plus', { max: 'x' })).toBeNull();
    expect(upgradeDue('free', undefined)).toBeNull();
    // The old four-screen Max welcome, finished, counts as seen.
    expect(upgradeDue('max', undefined, { startedAt: 'x', step: 'done', doneAt: 'x' })).toBeNull();
  });
});

describe('the first-day study plan', () => {
  it('is a few real sessions just before the quiz, never fifteen minutes a day for a week', async () => {
    const { nextTestPlan } = await import('../domain/exam');
    const { computeSchedule } = await import('../domain/schedule');
    const { DEFAULT_SETTINGS } = await import('../domain/types');
    const quiz = mkItem({ id: 'q', courseId: 'c', title: 'Quiz 2', type: 'quiz', points: 50, estimatedMinutes: 120, dueAt: '2026-10-08T06:59:00.000Z' });
    const settings = { ...DEFAULT_SETTINGS, timezone: 'America/Phoenix' };
    const plan = nextTestPlan([quiz], computeSchedule([quiz], settings, '2026-09-28', { start: '2026-09-01', end: '2026-12-20' }, '2026-09-28T19:00:00.000Z'), settings, '2026-09-28');
    expect(plan?.exam.id).toBe('q');
    expect(plan!.sessions.length).toBeLessThanOrEqual(4);
    for (const x of plan!.sessions) expect(x.minutes).toBeGreaterThanOrEqual(30);
    expect(plan!.sessions.reduce((n, x) => n + x.minutes, 0)).toBe(120);
  });
});
