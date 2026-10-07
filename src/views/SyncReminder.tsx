import { useEffect, useRef, useState } from 'react';
import { useCan } from '../config/useCan';
import { installedVersion } from '../config/extension';
import { dateOf, diffDays, fmtDate, fmtTime } from '../domain/dates';
import { EXT_STATUS_SLOT, readAutoPaused } from '../halo/autoSyncStatus';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { loadLastSync } from '../halo/handoff';
import { mergedClasses } from '../halo/repairMerged';
import { staleText, syncReminder, type SyncReminder as Reminder } from '../halo/syncReminder';
import { useStore } from '../storage/store';
import { useSyncAccess } from './PlanWall';

const HALO = 'https://halo.gcu.edu/';

const pausedNow = (): boolean => {
  try {
    return !!readAutoPaused(localStorage.getItem(EXT_STATUS_SLOT));
  } catch {
    return false;
  }
};

/** The reminder that is true right now, re-read whenever the tab comes back to the front. */
export function useSyncReminder(): Reminder | null {
  const { data } = useStore();
  const allowed = useSyncAccess().allowed;
  const autoPlan = useCan('haloAutoSync');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onShow);
    const iv = window.setInterval(() => setNow(Date.now()), 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.clearInterval(iv);
    };
  }, []);
  const lastAt = data.settings.lastPull?.at ?? loadLastSync()?.at ?? null;
  // A sync the merged-classes banner already asks for: one sync prompt at a time.
  if (mergedClasses(data.courses).length > 0) return null;
  return syncReminder({ lastAt, now, allowed, extInstalled: !!installedVersion(), autoPlan, paused: pausedNow() });
}

/**
 * The bold line pinned at the top of Now while the planner is out of date (see halo/syncReminder.ts). Sync now asks the
 * extension on this computer to sync through the same relay its setup uses; without it, Halo opens in a new tab for
 * the bookmark. When the sync lands it says "Synced" for a moment and goes.
 */
export function SyncReminder() {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const r = useSyncReminder();
  const last = data.settings.lastPull?.at ?? null;
  const [asked, setAsked] = useState<'ext' | 'halo' | null>(null);
  const [synced, setSynced] = useState(false);
  // The last sync as it was while the reminder was on screen; a different one is a sync that landed.
  const shownFor = useRef<string | null>(null);
  // A sync landed while the reminder was up: the check, then nothing.
  useEffect(() => {
    if (shownFor.current === null || last === shownFor.current) return;
    shownFor.current = null;
    setAsked(null);
    setSynced(true);
    const t = window.setTimeout(() => setSynced(false), 2500);
    return () => window.clearTimeout(t);
  }, [last]);
  useEffect(() => {
    if (r && shownFor.current === null) shownFor.current = last;
  }, [r, last]);
  // The extension's quiet sync did not land in time (Halo logged out, Chrome offline): say what to do.
  useEffect(() => {
    if (asked !== 'ext') return;
    const t = window.setTimeout(() => setAsked('halo'), 150_000);
    return () => window.clearTimeout(t);
  }, [asked]);
  if (synced)
    return (
      <div className="sync-reminder" data-level="ok" role="status">
        <p>
          <b>✓ Synced.</b> You're up to date.
        </p>
      </div>
    );
  if (!r) return null;
  const syncNow = () => {
    if (installedVersion()) {
      window.postMessage({ kind: 'halo-ext-first-sync' }, location.origin);
      setAsked('ext');
    } else {
      window.open(HALO, '_blank', 'noopener');
      setAsked('halo');
    }
  };
  const when = (at: string) => {
    const k = diffDays(dateOf(at, tz), today);
    return k === 0 ? `${fmtTime(at, tz)} today` : k === 1 ? `yesterday ${fmtTime(at, tz)}` : `${fmtDate(dateOf(at, tz), 'short')} ${fmtTime(at, tz)}`;
  };
  return (
    <div className="sync-reminder" data-level={r.red ? 'red' : 'amber'} role="status">
      {r.kind === 'stale' ? (
        <p>
          <b>{staleText(r.days)}</b> Sync now so you don't miss anything.
          {asked === 'ext' && <span className="sync-reminder-note"> Syncing in the background…</span>}
          {asked === 'halo' && <span className="sync-reminder-note"> On Halo, log in and click {BOOKMARK_NAME}.</span>}
        </p>
      ) : (
        <p>
          <b>{r.paused ? 'Auto-sync paused: log in to Halo.' : `Auto-sync hasn't run since ${when(r.since)}.`}</b> Open Halo once to wake it up.
        </p>
      )}
      {r.kind === 'stale' ? (
        <button type="button" className="btn small primary" onClick={syncNow} disabled={asked === 'ext'}>
          {asked === 'ext' ? 'Syncing…' : 'Sync now'}
        </button>
      ) : (
        <a className="btn small primary" href={HALO} target="_blank" rel="noreferrer">
          Open Halo ↗
        </a>
      )}
    </div>
  );
}
