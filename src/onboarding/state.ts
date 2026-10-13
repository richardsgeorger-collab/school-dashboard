import type { Course, OnboardingState, Settings } from '../domain/types';
import { isTouchDevice } from '../ui/device';

export type { OnboardingState };

/**
 * Where a new student is in the first two minutes. Kept in settings so it follows the account, and so a build
 * without accounts still remembers. The tour is the set of tooltips on Now after the last step.
 *
 * Since 2026-10-13 (George: most sign-ups never synced) setup is three things: sign up, connect Halo, the payoff. The
 * welcome, the plan story (compare, offer) and the syllabus step are gone; a saved state still naming one of them is
 * read as the step that replaced it (normalStep). The names stay in the type so old saved states still parse.
 */
export const STEPS = ['welcome', 'account', 'compare', 'offer', 'syllabus', 'halo', 'preferences', 'done'] as const;
export type Step = (typeof STEPS)[number];

export const stepIndex = (s: Step): number => STEPS.indexOf(s);

/** The steps a student sees as numbered progress; the account step only exists on a build with accounts. */
export const visibleSteps = (accounts: boolean): Step[] => (accounts ? ['account', 'halo'] : ['halo']);

/** A step from an older build, read as today's: the story and the welcome lead to sign-up or Connect Halo. */
export function normalStep(step: Step, opts: { accounts: boolean; signedIn: boolean }): Step {
  if (step === 'done') return 'done';
  if (step === 'account') return opts.accounts && !opts.signedIn ? 'account' : 'halo';
  if (step === 'welcome') return opts.accounts && !opts.signedIn ? 'account' : 'halo';
  return 'halo';
}

export const fresh = (now = new Date().toISOString()): OnboardingState => ({ startedAt: now, step: 'welcome', doneAt: null, skippedAt: null, tourDoneAt: null });

/** Someone who already has classes never sees the welcome: they were here before onboarding existed. */
export const alreadyDone = (now = new Date().toISOString()): OnboardingState => ({ startedAt: now, step: 'done', doneAt: now, skippedAt: null, tourDoneAt: now });

/** What to store on first load, or null when nothing needs storing. */
export function initialState(settings: Pick<Settings, 'onboarding'>, courses: Course[], now = new Date().toISOString()): OnboardingState | null {
  if (settings.onboarding) return null;
  return courses.length > 0 ? alreadyDone(now) : fresh(now);
}

/**
 * Setup is on screen: not finished, not skipped, and not handed to a laptop while this is a phone or tablet (a laptop
 * opens it at Connect Halo).
 */
export const isOpen = (s: OnboardingState | undefined, touch: boolean = isTouchDevice()): boolean => !!s && !s.doneAt && !s.skippedAt && !(touch && !!s.laptopAt);
export const tourPending = (s: OnboardingState | undefined): boolean => !!s && !!s.doneAt && !s.tourDoneAt;

export const DAY_MS = 86_400_000;

/**
 * Connect Halo again for an account that has never synced (George, 2026-10-13), as a patch to the saved state, or null.
 * The caller has checked: signed in, never synced, and the plan can sync.
 * - On a laptop it always opens at Connect Halo: there is no skipping it there any more, and a student who chose
 *   "Finish on my laptop" on a phone lands on it straight away.
 * - On a phone or tablet, once: a day or more after sign-up, Connect Halo comes first on the next open.
 */
export function connectReopen(ob: OnboardingState | undefined, opts: { touch: boolean; createdAt: string | null; now?: string }): Partial<OnboardingState> | null {
  if (!ob || isOpen(ob, opts.touch)) return null;
  const reset: Partial<OnboardingState> = { step: 'halo', doneAt: null, skippedAt: null, focus: null, after: null, screen: null };
  if (!opts.touch) return { ...reset, path: 'desktop' };
  const now = opts.now ?? new Date().toISOString();
  if (ob.nudgedAt || !opts.createdAt || Date.parse(now) - Date.parse(opts.createdAt) < DAY_MS) return null;
  return { ...reset, laptopAt: null, nudgedAt: now };
}
