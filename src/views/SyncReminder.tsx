import { useEffect, useRef, useState } from 'react';
import { useCan } from '../config/useCan';
import { installedVersion } from '../config/extension';
import { todayStr as todayOf } from '../domain/dates';
import { failWords, relTime, SYNC_TIMEOUT_MS } from '../halo/syncWords';
import { useNow } from '../ui/useNow';
import { EXT_STATUS_SLOT, readAutoPaused } from '../halo/autoSyncStatus';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { loadLastSync } from '../halo/handoff';
import { mergedClasses } from '../halo/repairMerged';
import { staleText, syncReminder, type SyncReminder as Reminder } from '../halo/syncReminder';
import { useAccountChecked, useStore } from '../storage/store';
import { syncPress } from '../ui/presses';
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
  const now = useNow(30_000);
  const checked = useAccountChecked();
  const lastAt = data.settings.lastPull?.at ?? loadLastSync()?.at ?? null;
  // Never from an unchecked device copy (2026-10-12): the account's own last sync first.
  if (!checked) return null;
  // A sync the merged-classes banner already asks for: one sync prompt at a time.
  if (mergedClasses(data.courses).length > 0) return null;
  return syncReminder({ lastAt, now, allowed, extInstalled: !!installedVersion(), autoPlan, paused: pausedNow() });
}

/** An extension is on this computer (its Halo+ script wrote its version); without one, Halo opens for the bookmark. */
const askExtension = (): boolean => !!installedVersion();

type Phase = { k: 'idle' } | { k: 'running'; since: number } | { k: 'halo' } | { k: 'phone' } | { k: 'done' } | { k: 'failed'; text: string; halo: boolean } | { k: 'timeout' };

/** A phone or an iPad (an iPad says Macintosh, with touch): no extension there, and Sync now must not pretend. */
const onPhone = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

/**
 * The bold line pinned at the top of Now while the planner is out of date (see halo/syncReminder.ts). Sync now asks the
 * extension on this computer to sync; without it, Halo opens in a new tab for the bookmark. It never says "Syncing…"
 * forever (George, 2026-10-11): a sync that lands turns it into "✓ Synced just now" and it goes; one the extension says
 * failed or was refused says why with a next step; nothing heard in two minutes says so, with Try again.
 */
export function SyncReminder() {
  const { data } = useStore();
  const r = useSyncReminder();
  const last = data.settings.lastPull?.at ?? null;
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  // The last sync as it was when the reminder showed or Sync now was pressed; a different one is a sync that landed.
  const seen = useRef<string | null>(last);
  useEffect(() => {
    if (last === seen.current) return;
    seen.current = last;
    setPhase((p) => (p.k === 'idle' && !r ? p : { k: 'done' }));
  }, [last, r]);
  useEffect(() => {
    if (phase.k !== 'done') return;
    const t = window.setTimeout(() => setPhase({ k: 'idle' }), 4000);
    return () => window.clearTimeout(t);
  }, [phase.k]);
  // Nothing heard in two minutes: say so, with Try again.
  useEffect(() => {
    if (phase.k !== 'running') return;
    const t = window.setTimeout(() => setPhase({ k: 'timeout' }), Math.max(0, phase.since + SYNC_TIMEOUT_MS - Date.now()));
    return () => window.clearTimeout(t);
  }, [phase]);
  // How the extension's run ended (0.6.5). Landed: the planner takes it from the account and the check above shows.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { kind?: string } | null)?.kind !== 'halo-ext-sync-result') return;
      const d = e.data as { ok: boolean; errorKind: string | null; why: string | null; auto?: boolean };
      if (d.ok) return;
      setPhase((p) => (p.k === 'running' || (!d.auto && p.k !== 'done') ? { k: 'failed', ...failWords(d.errorKind, d.why) } : p));
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);

  if (phase.k === 'done')
    return (
      <div className="sync-reminder" data-level="ok" data-phase={phase.k} role="status">
        <p>
          <b>✓ Synced just now.</b> You're up to date.
        </p>
      </div>
    );
  if (!r && phase.k !== 'failed' && phase.k !== 'timeout') return null;
  const syncNow = () => {
    seen.current = last;
    const how = askExtension();
    if (how) {
      // Asked by what the extension answers, not by its version number (a store build can carry any number, 2026-10-12):
      // the page Sync now (0.6.5+) acknowledges at once; no word in 1.5 s, and the older handshake is used instead.
      let acked = false;
      const onAck = (e: MessageEvent) => {
        if (e.origin === window.location.origin && (e.data as { kind?: string } | null)?.kind === 'halo-ext-sync-started') acked = true;
      };
      window.addEventListener('message', onAck);
      window.postMessage({ kind: 'halo-ext-sync-now' }, location.origin);
      window.setTimeout(() => {
        window.removeEventListener('message', onAck);
        if (!acked) window.postMessage({ kind: 'halo-ext-first-sync' }, location.origin);
      }, 1500);
      setPhase({ k: 'running', since: Date.now() });
    } else if (onPhone()) {
      // Never pretend (2026-10-12): syncs run on the laptop; this phone can sync itself through the phone flow.
      setPhase({ k: 'phone' });
    } else {
      window.open(HALO, '_blank', 'noopener');
      setPhase({ k: 'halo' });
    }
  };
  const tryAgain = (
    <button type="button" className="btn small primary" onClick={syncNow}>
      Try again
    </button>
  );
  if (phase.k === 'phone')
    return (
      <div className="sync-reminder" data-level="amber" data-phase="phone" role="status">
        <p>
          <b>Syncs happen on your laptop.</b> {last ? `Last synced ${relTime(last, Date.now(), data.settings.timezone, todayOf(data.settings.timezone))}.` : 'Not synced yet.'} Open Halo+ on your laptop with the extension, or sync from this phone.
        </p>
        <span className="sync-reminder-actions">
          <button type="button" className="btn small primary" onClick={() => syncPress.current?.()}>
            Sync on this phone
          </button>
        </span>
      </div>
    );
  if (phase.k === 'failed')
    return (
      <div className="sync-reminder" data-level="red" data-phase={phase.k} role="alert">
        <p>
          <b>Sync didn't finish.</b> {phase.text}
        </p>
        <span className="sync-reminder-actions">
          {phase.halo && (
            <a className="btn small" href={HALO} target="_blank" rel="noreferrer">
              Open Halo ↗
            </a>
          )}
          {tryAgain}
        </span>
      </div>
    );
  if (phase.k === 'timeout')
    return (
      <div className="sync-reminder" data-level="red" data-phase={phase.k} role="alert">
        <p>
          <b>Sync didn't finish in 2 minutes.</b> Check that you're logged in to Halo in this browser, then try again.
        </p>
        <span className="sync-reminder-actions">
          <a className="btn small" href={HALO} target="_blank" rel="noreferrer">
            Open Halo ↗
          </a>
          {tryAgain}
        </span>
      </div>
    );
  if (!r) return null;
  return (
    <div className="sync-reminder" data-level={r.red ? 'red' : 'amber'} data-phase={phase.k} role="status">
      {r.kind === 'stale' ? (
        <p>
          <b>{staleText(r.days)}</b> Sync now so you don't miss anything.
          {phase.k === 'running' && <span className="sync-reminder-note"> Syncing: reading Halo in the background. This takes up to a minute.</span>}
          {phase.k === 'halo' && <span className="sync-reminder-note"> On Halo, log in and click {BOOKMARK_NAME}.</span>}
        </p>
      ) : (
        <p>
          <b>{r.paused ? 'Auto-sync paused: log in to Halo.' : `Auto-sync hasn't run since ${relTime(r.since, Date.now(), data.settings.timezone, todayOf(data.settings.timezone))}.`}</b> Open Halo once to wake it up.
        </p>
      )}
      {r.kind === 'stale' ? (
        <button type="button" className="btn small primary" onClick={syncNow} disabled={phase.k === 'running'}>
          {phase.k === 'running' ? 'Syncing…' : 'Sync now'}
        </button>
      ) : (
        <a className="btn small primary" href={HALO} target="_blank" rel="noreferrer">
          Open Halo ↗
        </a>
      )}
    </div>
  );
}
