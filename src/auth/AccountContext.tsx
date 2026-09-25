import { createContext, useContext, type ReactNode } from 'react';
import type { Tier } from '../config/tiers';
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
  const value: Account = { auth, profile: p.profile, tier: p.tier, loading: auth.loading || p.loading, reloadProfile: p.reload, updateProfile: p.update };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): Account {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
