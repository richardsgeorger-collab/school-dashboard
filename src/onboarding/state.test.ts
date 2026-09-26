import { describe, expect, it } from 'vitest';
import type { Course } from '../domain/types';
import { fresh, initialState, isOpen, stepIndex, tourPending, visibleSteps } from './state';

const course = { id: 'c1' } as Course;

describe('onboarding state', () => {
  it('a brand-new student starts at welcome; someone with classes already is marked done', () => {
    const s = initialState({ onboarding: undefined }, [], '2026-09-24T12:00:00.000Z');
    expect(s?.step).toBe('welcome');
    expect(isOpen(s!)).toBe(true);
    const old = initialState({ onboarding: undefined }, [course], '2026-09-24T12:00:00.000Z');
    expect(old?.doneAt).toBeTruthy();
    expect(isOpen(old!)).toBe(false);
    expect(tourPending(old!)).toBe(false);
    expect(initialState({ onboarding: fresh() }, [])).toBeNull();
  });
  it('the tour waits for the last step and runs once', () => {
    const done = { ...fresh(), step: 'done' as const, doneAt: 'x' };
    expect(tourPending(done)).toBe(true);
    expect(tourPending({ ...done, tourDoneAt: 'y' })).toBe(false);
    expect(tourPending({ ...fresh(), skippedAt: 'x' })).toBe(false);
  });
  it('numbers the steps by what the build can show', () => {
    // Study hours are asked later, from You; the first run is sign up, connect, payoff.
    expect(visibleSteps(true)).toHaveLength(3);
    expect(visibleSteps(false)).toHaveLength(2);
    expect(stepIndex('halo')).toBeGreaterThan(stepIndex('account'));
  });
});
