import { useCallback, useEffect, useState } from 'react';
import { effectiveTier, type TierSource } from '../config/flags';
import { TIERS, type Tier } from '../config/tiers';
import { readPlan, writePlan } from './planCache';
import { AI_DIRECT_ALLOWED } from '../ai/gateway';
import { isConfigured, supabase } from './client';

/** The row behind a signed-in student: what they are on, how long the trial has, whether onboarding is done. */
export interface Profile extends TierSource {
  userId: string | null;
  referralCode: string | null;
  referredBy: string | null;
  onboardingStep: string | null;
  onboardingDoneAt: string | null;
  isAdmin: boolean;
  timezone: string;
  /** Set when the account came in through one of George's friend links: whose gift it is, and when. */
  friendFrom?: string | null;
  friendJoinedAt?: string | null;
  /** When the one-time "sync is now part of Plus" notice was seen. */
  legacyNoticeSeenAt?: string | null;
}

/**
 * A build with no backend has no account to check, so it fails closed: Free, with nothing paid unlocked. A missing
 * or broken config must never hand out a paid plan.
 */
export const LOCAL_PROFILE: Profile = { userId: null, tier: 'free', trialEndsAt: null, trialStartedAt: null, trialSyncedAt: null, graceUntil: null, rewardTier: null, rewardUntil: null, legacySyncUntil: null, legacyNoticeSeenAt: null, friendFrom: null, friendJoinedAt: null, referralCode: null, referredBy: null, onboardingStep: null, onboardingDoneAt: null, isAdmin: false, timezone: 'America/Phoenix' };

interface Row {
  user_id: string;
  tier: Tier;
  trial_ends_at: string | null;
  trial_started_at?: string | null;
  trial_synced_at?: string | null;
  legacy_sync_until?: string | null;
  legacy_notice_seen_at?: string | null;
  friend_from?: string | null;
  friend_joined_at?: string | null;
  grace_until: string | null;
  referral_code: string | null;
  referred_by: string | null;
  reward_tier: Tier | null;
  reward_until: string | null;
  onboarding_step: string | null;
  onboarding_done_at: string | null;
  is_admin: boolean;
  timezone: string;
}

export const profileFromRow = (r: Row): Profile => ({ userId: r.user_id, tier: r.tier, trialEndsAt: r.trial_ends_at, trialStartedAt: r.trial_started_at ?? null, trialSyncedAt: r.trial_synced_at ?? null, graceUntil: r.grace_until, rewardTier: r.reward_tier, rewardUntil: r.reward_until, legacySyncUntil: r.legacy_sync_until ?? null, legacyNoticeSeenAt: r.legacy_notice_seen_at ?? null, friendFrom: r.friend_from ?? null, friendJoinedAt: r.friend_joined_at ?? null, referralCode: r.referral_code, referredBy: r.referred_by, onboardingStep: r.onboarding_step, onboardingDoneAt: r.onboarding_done_at, isAdmin: r.is_admin, timezone: r.timezone });

export interface ProfileState {
  profile: Profile | null;
  tier: Tier;
  loading: boolean;
  reload: () => void;
  /** The plan is the server's or this device's memory of it, not the Free placeholder of a profile still loading. */
  planKnown: boolean;
  /** The client may change only these: onboarding progress and zone. Tier and trial are server-only. */
  update: (patch: Partial<Pick<Row, 'onboarding_step' | 'onboarding_done_at' | 'timezone'>>) => Promise<void>;
}

export function useProfile(userId: string | null): ProfileState {
  const configured = isConfigured();
  // What this device knew last time, shown at once; the server's answer replaces it within a second.
  const cached = readPlan(userId);
  const [profile, setProfile] = useState<Profile | null>(configured ? (cached?.profile ?? null) : LOCAL_PROFILE);
  const [loading, setLoading] = useState(configured && !!userId && !cached);
  const [tick, setTick] = useState(0);
  // The plan exactly as the server enforces it (public.plan_of: paid, trial, friend link, referral, admin).
  const [serverPlan, setServerPlan] = useState<Tier | null>(cached?.tier ?? null);
  const [confirmed, setConfirmed] = useState(false);
  // A different account signing in on this device starts from its own memory, never the last one's.
  const [forUser, setForUser] = useState(userId);
  if (forUser !== userId) {
    setForUser(userId);
    setProfile(configured ? (cached?.profile ?? null) : LOCAL_PROFILE);
    setServerPlan(cached?.tier ?? null);
    setLoading(configured && !!userId && !cached);
    setConfirmed(false);
  }

  useEffect(() => {
    const c = supabase();
    if (!c || !userId) {
      setServerPlan(null);
      return;
    }
    let live = true;
    void c.rpc('my_plan').then(({ data, error }) => {
      if (!live) return;
      if (!error && typeof data === 'string' && (TIERS as readonly string[]).includes(data)) setServerPlan(data as Tier);
      setConfirmed(true);
      performance.mark?.('halo:plan-confirmed');
    });
    return () => {
      live = false;
    };
  }, [userId, tick]);

  useEffect(() => {
    const c = supabase();
    if (!c || !userId) {
      setProfile(configured ? null : LOCAL_PROFILE);
      setLoading(false);
      return;
    }
    let live = true;
    if (!readPlan(userId)) setLoading(true);
    void c
      .from('profiles')
      .select('user_id, tier, trial_ends_at, trial_started_at, trial_synced_at, legacy_sync_until, legacy_notice_seen_at, friend_from, friend_joined_at, grace_until, referral_code, referred_by, reward_tier, reward_until, onboarding_step, onboarding_done_at, is_admin, timezone')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        setProfile(data ? profileFromRow(data as Row) : null);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [configured, userId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const update = useCallback(
    async (patch: Partial<Pick<Row, 'onboarding_step' | 'onboarding_done_at' | 'timezone'>>) => {
      const c = supabase();
      if (!c || !userId) return;
      await c.from('profiles').update(patch).eq('user_id', userId);
      setTick((t) => t + 1);
    },
    [userId],
  );

  const tier = devTier() ?? serverPlan ?? effectiveTier(profile);
  // Remember what the server confirmed, for the next time this device opens the app.
  useEffect(() => {
    if (userId && confirmed && profile && !loading) writePlan(userId, tier, profile);
  }, [userId, confirmed, profile, loading, tier]);
  // The server's answer when it has one; the same rules worked out here until it arrives (they agree: see flags.ts).
  // The plan is known once the server answered or this device remembered it; until then nothing locks or upsells.
  return { profile, tier, loading, reload, update, planKnown: !configured || !userId || confirmed || !!serverPlan };
}

/**
 * Development and the e2e scripts only: a tier pinned in localStorage so a build with no accounts can exercise
 * Pro and Max paths. Never read on a production build (AI_DIRECT_ALLOWED is false there), so it cannot unlock
 * anything for a real user; a build without Supabase config still runs as Free.
 */
export const DEV_TIER_SLOT = 'school-dashboard:dev-tier';
function devTier(): Tier | null {
  if (!AI_DIRECT_ALLOWED) return null;
  try {
    const t = localStorage.getItem(DEV_TIER_SLOT);
    return t === 'plus' || t === 'pro' || t === 'max' ? t : null;
  } catch {
    return null;
  }
}
