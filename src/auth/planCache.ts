import type { Tier } from '../config/tiers';
import { supabaseConfig } from './client';
import type { Profile } from './useProfile';

/**
 * The plan, remembered on this device (George, 2026-09-30: every reload showed a Max student Free for a while).
 * Shown the instant the app opens, then confirmed with the server in the background. Keyed by the account, so a
 * second account on the same browser never inherits the first one's plan.
 */
const KEY = (userId: string) => `school-dashboard:plan:${userId}`;

export interface CachedPlan {
  tier: Tier;
  profile: Profile;
  at: string;
}

export function readPlan(userId: string | null): CachedPlan | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as CachedPlan;
    return p && p.tier && p.profile && p.profile.userId === userId ? p : null;
  } catch {
    return null;
  }
}

export function writePlan(userId: string, tier: Tier, profile: Profile): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify({ tier, profile, at: new Date().toISOString() }));
  } catch {
    /* storage unavailable: the next load waits for the server, as before */
  }
}

/** The signed-in account id as the auth library left it in storage, readable before the library has started. */
export function storedUserId(): string | null {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const ref = new URL(cfg.url).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const s = JSON.parse(raw) as { user?: { id?: string } } | null;
    return s?.user?.id ?? null;
  } catch {
    return null;
  }
}
