import { supabase } from './client';

/**
 * Where a sign-up came from (2026-10-08): the QR code on the market table opens haloplus.app/market, which lands on
 * #/start?src=market. The source is remembered here until there is an account to write it on, then set once on the
 * profile (profiles.signup_source) so Admin can count the market's sign-ups. Only sources we know are kept.
 */
const SLOT = 'school-dashboard:src';
export const SOURCES = ['market'] as const;
export type Source = (typeof SOURCES)[number];

export function captureSource(hash: string = window.location.hash): void {
  const m = /[?&]src=([a-z]+)/i.exec(hash);
  const v = m?.[1].toLowerCase();
  if (!v || !(SOURCES as readonly string[]).includes(v)) return;
  try {
    localStorage.setItem(SLOT, v);
  } catch {
    /* storage unavailable */
  }
}

export function pendingSource(): Source | null {
  try {
    const v = localStorage.getItem(SLOT);
    return v && (SOURCES as readonly string[]).includes(v) ? (v as Source) : null;
  } catch {
    return null;
  }
}

/**
 * Writes the remembered source on the signed-in profile (once: the server keeps the first). The slot stays until
 * onboarding is over (forgetSource), because onboarding reads it too, on its own schedule, to skip the story and
 * show the laptop hand-off.
 */
export async function claimPendingSource(): Promise<boolean> {
  const src = pendingSource();
  const c = supabase();
  if (!src || !c) return false;
  const { data, error } = await c.rpc('set_signup_source', { p_source: src });
  return !error && data === true;
}

export function forgetSource(): void {
  try {
    localStorage.removeItem(SLOT);
  } catch {
    /* storage unavailable */
  }
}

/** Asks the server to send the "finish on your laptop" email, once per account. */
export async function queueMarketEmail(): Promise<boolean> {
  const c = supabase();
  if (!c) return false;
  const { data, error } = await c.rpc('queue_email', { p_kind: 'market_setup' });
  return !error && data === true;
}
