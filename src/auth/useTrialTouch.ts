import { useEffect } from 'react';
import { trialState } from '../config/flags';
import { TRIAL_DAY_TZ } from '../config/trialUse';
import { isDemo } from '../demo/demo';
import { dateOf } from '../domain/dates';
import { useStore } from '../storage/store';
import { useNow } from '../ui/useNow';
import { supabase } from './client';
import { useAccount } from './AccountContext';


/**
 * A day of use (2026-10-22): the free trial counts the days Halo+ is opened, on any device, from the first sync. When
 * Halo+ opens, and when the day turns while it is open, it tells the server today counts, once a day on this device.
 * The extension syncing in the background never does: only this app does.
 */
export function useTrialTouch(): void {
  const { profile, auth, reloadProfile } = useAccount();
  const { sync } = useStore();
  const now = useNow(10 * 60_000);
  const day = dateOf(new Date(now).toISOString(), TRIAL_DAY_TZ);
  const uid = auth.session?.user.id ?? null;
  const due = !!uid && !!profile && trialState(profile) === 'active' && !!profile.trialSyncedAt && !profile.friendFrom && sync.checked && !isDemo();
  const used = profile?.trialDaysUsed ?? 0;
  useEffect(() => {
    if (!due || !uid) return;
    const key = `school-dashboard:trial-day:${uid}`;
    try {
      if (localStorage.getItem(key) === day) return;
    } catch {
      /* storage unavailable: ask anyway */
    }
    const c = supabase();
    if (!c) return;
    let live = true;
    void c.rpc('trial_touch').then(
      ({ data }) => {
        const r = (data ?? {}) as { ok?: boolean; used?: number };
        if (!live || !r.ok) return;
        try {
          localStorage.setItem(key, day);
        } catch {
          /* storage unavailable */
        }
        if (typeof r.used === 'number' && r.used !== used) reloadProfile();
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, uid, day]);
}
