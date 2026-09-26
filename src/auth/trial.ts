import { supabase } from './client';

export type StartTrial = { ok: true; endsAt: string } | { ok: false; why: 'used' | 'already_max' | 'offline' | 'signed_out' | 'error'; message: string };

/**
 * Starts the free five-day Max trial for the signed-in account. The server decides once per account; this only
 * asks and repeats the answer. Nothing here can charge anyone: there is no card anywhere in this path.
 */
export async function startTrial(): Promise<StartTrial> {
  const c = supabase();
  if (!c) return { ok: false, why: 'offline', message: 'Accounts are not set up on this build.' };
  const { data: s } = await c.auth.getSession();
  if (!s.session) return { ok: false, why: 'signed_out', message: 'Sign in first, then start the trial.' };
  const { data, error } = await c.rpc('start_trial');
  if (error) return { ok: false, why: 'error', message: error.message };
  const r = (data ?? {}) as { ok?: boolean; why?: string; ends_at?: string; ended_at?: string };
  if (r.ok && r.ends_at) return { ok: true, endsAt: r.ends_at };
  if (r.why === 'already_max') return { ok: false, why: 'already_max', message: 'You already have Max.' };
  return { ok: false, why: 'used', message: 'This account has had its trial.' };
}
