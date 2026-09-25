import { supabase } from './client';

const SLOT = 'school-dashboard:ref';
/** What the extension and the landing page read to know the plan on this device. */
export const TIER_SLOT = 'school-dashboard:tier';

/** An invite link is #/now?ref=CODE. Remember the code until the student has an account to claim it with. */
export function captureRef(hash: string = window.location.hash): void {
  const m = /[?&]ref=([a-z0-9]+)/i.exec(hash);
  if (!m) return;
  try {
    localStorage.setItem(SLOT, m[1].toLowerCase());
  } catch {
    /* storage unavailable */
  }
}

export function pendingRef(): string | null {
  try {
    return localStorage.getItem(SLOT);
  } catch {
    return null;
  }
}

/** Once, after sign-in: both sides get their month of Plus. The code is forgotten whatever the answer. */
export async function claimPendingRef(): Promise<{ ok: boolean; why?: string } | null> {
  const code = pendingRef();
  const c = supabase();
  if (!code || !c) return null;
  const { data, error } = await c.rpc('claim_referral', { p_code: code });
  try {
    localStorage.removeItem(SLOT);
  } catch {
    /* storage unavailable */
  }
  if (error) return { ok: false, why: error.message };
  return (data as { ok: boolean; why?: string }) ?? { ok: false };
}

export function rememberTier(tier: string): void {
  try {
    localStorage.setItem(TIER_SLOT, tier);
  } catch {
    /* storage unavailable */
  }
}
