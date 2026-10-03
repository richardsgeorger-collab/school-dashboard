import { useEffect, useState } from 'react';
import { useCan } from '../config/useCan';
import { EXT_STATUS_SLOT, readAutoPaused, type AutoPaused } from './autoSyncStatus';

const read = (): AutoPaused | null => {
  try {
    return readAutoPaused(localStorage.getItem(EXT_STATUS_SLOT));
  } catch {
    return null;
  }
};

/**
 * "Auto-sync paused: log in to Halo." under the synced line, while the extension's scheduled sync is finding Halo
 * logged out (its sign-in times out). Before 0.5.1 that failed silently and the planner just aged (2026-10-02: 22
 * hours with no sync and nothing said). Opening Halo logged in starts a sync by itself, and the note goes.
 */
export function AutoSyncPaused() {
  const max = useCan('haloAutoSync');
  const [paused, setPaused] = useState<AutoPaused | null>(read);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.kind !== 'halo-ext-status') return;
      setPaused(e.data.autoPaused ? readAutoPaused(JSON.stringify({ autoPaused: e.data.autoPaused })) : null);
    };
    const onStorage = (e: StorageEvent) => e.key === EXT_STATUS_SLOT && setPaused(read());
    const onShow = () => document.visibilityState === 'visible' && setPaused(read());
    window.addEventListener('message', onMsg);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);
  if (!max || !paused) return null;
  return (
    <p className="autosync-paused" role="status">
      <b>Auto-sync paused: log in to Halo.</b> It syncs again on its own once you do.{' '}
      <a className="hero-inline" href="https://halo.gcu.edu/" target="_blank" rel="noreferrer">
        Open Halo ↗
      </a>
    </p>
  );
}
