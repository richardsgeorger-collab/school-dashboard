import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Tier } from '../config/tiers';
import { syncAccess } from '../config/flags';
import { pixelOnce } from '../analytics/pixel';
import { captureFriend, captureRef, claimPendingFriend, claimPendingRef, rememberTier } from './referral';
import { useAuth, type AuthState } from './useAuth';
import { useProfile, type ProfileState } from './useProfile';

/** Who is signed in and what they are on, once, for every screen. */
export interface Account {
  auth: AuthState;
  profile: ProfileState['profile'];
  tier: Tier;
  loading: boolean;
  reloadProfile: () => void;
  updateProfile: ProfileState['update'];
}

const Ctx = createContext<Account | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const p = useProfile(auth.userId);
  // The plan on this device, for the extension (auto-sync is Plus) and nothing else.
  // A free account kept on sync until its term ends counts as Plus for the extension, which only knows tiers.
  const syncTier = p.tier === 'free' && syncAccess(p.profile).allowed ? 'plus' : p.tier;
  // Not while the account is still loading: the placeholder plan is Free, and the extension read that and never
  // auto-synced a Max student (2026-09-30).
  useEffect(() => {
    if (!auth.loading && !p.loading) rememberTier(syncTier);
  }, [syncTier, auth.loading, p.loading]);
  // An invite link is remembered on arrival and claimed once there is an account to claim it with.
  useEffect(() => {
    captureRef();
    captureFriend();
  }, []);
  useEffect(() => {
    if (!auth.session) return;
    // A first sign-in is the lead, and the trial starts with it.
    pixelOnce('Lead');
    pixelOnce('StartTrial');
    void claimPendingRef().then((r) => r?.ok && p.reload());
    // A friend link: Max from George. Claimed before anything else reads the plan, then the profile is read again.
    void claimPendingFriend().then((r) => {
      if (r) p.reload();
      if (r && !r.ok && r.why) console.warn('friend link:', r.why);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session]);
  const value: Account = { auth, profile: p.profile, tier: p.tier, loading: auth.loading || p.loading, reloadProfile: p.reload, updateProfile: p.update };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): Account {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
