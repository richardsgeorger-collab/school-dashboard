import { FEATURES, LIMITS, TIERS, TRIAL, type Feature, type Tier } from './tiers';

/**
 * What a user may do, from their tier. The client uses this to show or lock things; the Edge Functions import the
 * same table and refuse what the tier does not allow. The client check is for the experience, the server check is
 * the enforcement.
 */

export const rank = (t: Tier): number => TIERS.indexOf(t);

/** The tier a profile is effectively on right now: a live trial counts as the trial tier. */
export interface TierSource {
  tier: Tier;
  trialEndsAt?: string | null;
  /** Set by the Stripe webhook when a payment fails; the paid tier is kept until it passes. */
  graceUntil?: string | null;
  /** A referral reward: this tier until this time, on top of whatever is paid for. */
  rewardTier?: Tier | null;
  rewardUntil?: string | null;
}

/** The best of what is paid for, a live trial, and a live reward. */
export function effectiveTier(p: TierSource | null | undefined, now = new Date().toISOString()): Tier {
  if (!p) return 'free';
  let best: Tier = p.tier;
  if (p.trialEndsAt && p.trialEndsAt > now && rank(TRIAL.tier) > rank(best)) best = TRIAL.tier;
  if (p.rewardTier && p.rewardUntil && p.rewardUntil > now && rank(p.rewardTier) > rank(best)) best = p.rewardTier;
  return best;
}

/** Days of referral reward left, or null. */
export function rewardDaysLeft(p: TierSource | null | undefined, now = new Date().toISOString()): number | null {
  if (!p?.rewardUntil || p.rewardUntil <= now) return null;
  return Math.ceil((new Date(p.rewardUntil).getTime() - new Date(now).getTime()) / 86_400_000);
}

export const can = (feature: Feature, tier: Tier): boolean => rank(tier) >= rank(FEATURES[feature]);

/** The tier that unlocks a feature, for the upgrade sheet. */
export const tierFor = (feature: Feature): Tier => FEATURES[feature];

/** Days of trial left, or null when there is no live trial. */
export function trialDaysLeft(p: TierSource | null | undefined, now = new Date().toISOString()): number | null {
  if (!p?.trialEndsAt || p.trialEndsAt <= now) return null;
  return Math.ceil((new Date(p.trialEndsAt).getTime() - new Date(now).getTime()) / 86_400_000);
}

/** How far ahead Now may suggest work, in days, or null for the whole term. */
export const suggestionWindow = (tier: Tier): number | null => LIMITS.smartSuggestionDays[tier];
