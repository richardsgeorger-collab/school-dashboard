import { trialState, type TierSource } from '../../config/flags';
import type { Tier } from '../../config/tiers';

/**
 * Whether the trial-end screen is owed right now: the trial was used, nothing is paid, no friend's gift, and the
 * screen has not been seen. One rule for App (which shows it) and Now (whose Sunday review must not open over it:
 * 2026-10-25, the review's sheet sat on the trial-end screen on a Sunday night).
 */
export function trialEndDue(profile: TierSource | null | undefined, tier: Tier, trialEndSeen: string | null | undefined): boolean {
  return trialState(profile) === 'used' && tier === 'free' && !!profile?.trialEndsAt && !profile.friendFrom && !trialEndSeen;
}
