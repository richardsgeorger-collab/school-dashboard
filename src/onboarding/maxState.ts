import type { MaxOnboardingState } from '../domain/types';

export type { MaxOnboardingState };

/**
 * The Max welcome: shown once, the moment Max comes on (the trial starts), after the ordinary onboarding if that is
 * still open. Kept in settings so it follows the account and never repeats on another device.
 */
export const MAX_STEPS = ['welcome', 'colour', 'receipts', 'tour'] as const;
export type MaxStep = (typeof MAX_STEPS)[number];

export const freshMax = (now = new Date().toISOString()): MaxOnboardingState => ({ startedAt: now, step: 'welcome', doneAt: null });

export const maxOpen = (s: MaxOnboardingState | undefined): boolean => !!s && !s.doneAt && s.step !== 'done';

export const maxStepIndex = (s: MaxOnboardingState['step']): number => Math.max(0, (MAX_STEPS as readonly string[]).indexOf(s));
