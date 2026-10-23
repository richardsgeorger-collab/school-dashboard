import { useEffect, useMemo } from 'react';
import { bump } from '../analytics/usage';
import { useSettled } from '../joy/JoyHost';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { useNow } from '../ui/useNow';
import { useSyncAccess } from '../views/PlanWall';
import { HALO_SNAP_SLOT, haloSnap } from './haloSnap';

/** Places a link from Halo can come from (extension/halo-ui.js). */
const VIAS = ['card', 'next', 'pill', 'class', 'box', 'popup'];

/**
 * Keeps the snapshot the extension shows on Halo's pages current (2026-10-22), once the account's own data is here,
 * and counts an open of Halo+ that came from Halo (Admin › "Opens from Halo").
 */
export function HaloSnapHost() {
  const { data, schedule } = useStore();
  const settled = useSettled();
  const access = useSyncAccess();
  const minute = useNow(15 * 60_000);
  const { params } = useRoute();
  const snap = useMemo(
    () => haloSnap({ courses: data.courses, items: data.items, settings: data.settings, schedule, canSync: access.allowed, now: new Date(minute).toISOString() }),
    [data.courses, data.items, data.settings, schedule, access.allowed, minute],
  );
  // Written only when something other than the time it was written changed.
  const body = useMemo(() => JSON.stringify({ ...snap, at: undefined }), [snap]);
  useEffect(() => {
    if (!settled) return;
    try {
      localStorage.setItem(HALO_SNAP_SLOT, JSON.stringify(snap));
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, settled]);
  const from = params.get('from');
  const via = params.get('via');
  useEffect(() => {
    if (from !== 'halo') return;
    bump(`halo:open-${via && VIAS.includes(via) ? via : 'other'}`);
  }, [from, via]);
  return null;
}
