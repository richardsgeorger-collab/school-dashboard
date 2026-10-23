import { useEffect } from 'react';
import { trialState } from '../config/flags';
import { useStore } from '../storage/store';
import { supabase } from './client';
import { useAccount } from './AccountContext';

const TRIES_MS = [2_000, 6_000, 15_000, 30_000, 60_000];

/**
 * The free trial restarts at the first sync (2026-10-09). It used to be asked for once, the moment the first sync was
 * applied, and the server only agrees once that sync's "last synced" has reached the account: a fast first sync asked
 * before its own save arrived, was told "not synced", and was never asked again (2026-10-13: a real sign-up that synced a
 * minute after making the account kept the clock from sign-up). Now: while the free trial is on, a sync has landed and
 * the restart has not happened, it is asked for, and again a few times while the save is on its way. Only during a live
 * free trial, so an account whose week already ended is never given a new one.
 */
export function useTrialSyncStart(): void {
  const { data, sync } = useStore();
  const { profile, reloadProfile } = useAccount();
  const due = !!profile && trialState(profile) === 'active' && !!profile.trialStartedAt && !profile.trialSyncedAt && !!data.settings.lastPull && sync.checked;
  useEffect(() => {
    if (!due) return;
    const c = supabase();
    if (!c) return;
    let live = true;
    let i = 0;
    let t = 0;
    const ask = () => {
      void c.rpc('trial_sync_started').then(
        ({ data: r }) => {
          if (!live) return;
          const res = (r ?? {}) as { ok?: boolean; why?: string };
          if (res.ok || res.why === 'already') return void reloadProfile();
          if (res.why === 'not_synced' && i < TRIES_MS.length) t = window.setTimeout(ask, TRIES_MS[i++]);
        },
        () => undefined,
      );
    };
    t = window.setTimeout(ask, 1_000);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);
}
