import type { Course, OnboardingState, Settings } from '../domain/types';

export type { OnboardingState };

/**
 * Where a new student is in the first five minutes. Kept in settings so it follows the account, and so a build
 * without accounts still remembers. The tour is the set of tooltips on Now after the last step.
 */
export const STEPS = ['welcome', 'account', 'halo', 'preferences', 'done'] as const;
export type Step = (typeof STEPS)[number];

export const stepIndex = (s: Step): number => STEPS.indexOf(s);

/** The steps a student sees as numbered progress; the account step only exists on a build with accounts. */
export const visibleSteps = (accounts: boolean): Step[] => (accounts ? ['welcome', 'account', 'halo', 'preferences'] : ['welcome', 'halo', 'preferences']);

export const fresh = (now = new Date().toISOString()): OnboardingState => ({ startedAt: now, step: 'welcome', doneAt: null, skippedAt: null, tourDoneAt: null });

/** Someone who already has classes never sees the welcome: they were here before onboarding existed. */
export const alreadyDone = (now = new Date().toISOString()): OnboardingState => ({ startedAt: now, step: 'done', doneAt: now, skippedAt: null, tourDoneAt: now });

/** What to store on first load, or null when nothing needs storing. */
export function initialState(settings: Pick<Settings, 'onboarding'>, courses: Course[], now = new Date().toISOString()): OnboardingState | null {
  if (settings.onboarding) return null;
  return courses.length > 0 ? alreadyDone(now) : fresh(now);
}

export const isOpen = (s: OnboardingState | undefined): boolean => !!s && !s.doneAt && !s.skippedAt;
export const tourPending = (s: OnboardingState | undefined): boolean => !!s && !!s.doneAt && !s.tourDoneAt;
