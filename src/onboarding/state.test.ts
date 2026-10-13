import { describe, expect, it } from 'vitest';
import type { Course } from '../domain/types';
import { connectReopen, DAY_MS, fresh, initialState, isOpen, normalStep, stepIndex, tourPending, visibleSteps } from './state';

const course = { id: 'c1' } as Course;
const NOW = '2026-10-13T20:00:00.000Z';
const ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();

describe('onboarding state', () => {
  it('a brand-new student is in setup; someone with classes already is marked done', () => {
    const s = initialState({ onboarding: undefined }, [], '2026-09-24T12:00:00.000Z');
    expect(isOpen(s!, false)).toBe(true);
    const old = initialState({ onboarding: undefined }, [course], '2026-09-24T12:00:00.000Z');
    expect(old?.doneAt).toBeTruthy();
    expect(isOpen(old!, false)).toBe(false);
    expect(tourPending(old!)).toBe(false);
    expect(initialState({ onboarding: fresh() }, [])).toBeNull();
  });
  it('the tour waits for the last step and runs once', () => {
    const done = { ...fresh(), step: 'done' as const, doneAt: 'x' };
    expect(tourPending(done)).toBe(true);
    expect(tourPending({ ...done, tourDoneAt: 'y' })).toBe(false);
    expect(tourPending({ ...fresh(), skippedAt: 'x' })).toBe(false);
  });
  it('setup is sign up, then connect Halo (George, 2026-10-13): the welcome and the plan story read as the step after them', () => {
    expect(visibleSteps(true)).toEqual(['account', 'halo']);
    expect(visibleSteps(false)).toEqual(['halo']);
    expect(stepIndex('halo')).toBeGreaterThan(stepIndex('account'));
    const out = { accounts: true, signedIn: false };
    const inn = { accounts: true, signedIn: true };
    expect(normalStep('welcome', out)).toBe('account');
    expect(normalStep('welcome', inn)).toBe('halo');
    expect(normalStep('account', inn)).toBe('halo');
    for (const s of ['compare', 'offer', 'syllabus', 'preferences'] as const) expect(normalStep(s, out)).toBe('halo');
    expect(normalStep('done', inn)).toBe('done');
  });
  it('"Finish on my laptop" closes setup on phones and tablets only', () => {
    const handed = { ...fresh(), step: 'halo' as const, laptopAt: NOW };
    expect(isOpen(handed, true)).toBe(false);
    expect(isOpen(handed, false)).toBe(true);
  });
  it('a laptop always reopens Connect Halo for an account that never synced', () => {
    const skipped = { ...fresh(), skippedAt: ago(3600_000) };
    expect(connectReopen(skipped, { touch: false, createdAt: ago(3600_000), now: NOW })).toMatchObject({ step: 'halo', skippedAt: null, doneAt: null, path: 'desktop' });
    const handed = { ...fresh(), laptopAt: NOW };
    // Already open on a laptop: nothing to change.
    expect(connectReopen(handed, { touch: false, createdAt: ago(60_000), now: NOW })).toBeNull();
  });
  it('a phone gets one nudge, a day after sign-up', () => {
    const handed = { ...fresh(), step: 'halo' as const, laptopAt: ago(3600_000) };
    expect(connectReopen(handed, { touch: true, createdAt: ago(DAY_MS - 60_000), now: NOW })).toBeNull();
    const patch = connectReopen(handed, { touch: true, createdAt: ago(DAY_MS + 60_000), now: NOW });
    expect(patch).toMatchObject({ step: 'halo', laptopAt: null, nudgedAt: NOW });
    expect(isOpen({ ...handed, ...patch }, true)).toBe(true);
    expect(connectReopen({ ...handed, nudgedAt: ago(1000) }, { touch: true, createdAt: ago(3 * DAY_MS), now: NOW })).toBeNull();
    // An old skip on a phone is nudged the same way, once.
    expect(connectReopen({ ...fresh(), skippedAt: ago(5 * DAY_MS) }, { touch: true, createdAt: ago(5 * DAY_MS), now: NOW })).toMatchObject({ nudgedAt: NOW });
  });
});
