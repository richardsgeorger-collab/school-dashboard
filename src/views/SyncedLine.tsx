import { relTime } from '../halo/syncWords';
import { useNow } from '../ui/useNow';
import { loadLastSync } from '../halo/handoff';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';
import { HowYouSync } from './HowYouSync';
import { AutoSyncPaused } from '../halo/AutoSyncPaused';

/**
 * The trust line: when what is on screen last matched Halo, or that it never has. Always present, always one line,
 * with the one button that fixes it when it is out of date.
 */
export function SyncedLine({ stale, courseId }: { stale?: string | null; courseId?: string }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const now = useNow(30_000);
  // A class synced before per-class pull stamps existed falls back to the account's last sync (it is Halo-linked).
  const linked = !!courseId && !!data.courses.find((c) => c.id === courseId)?.haloClassId;
  const at = (courseId ? (data.settings.haloPulls?.[courseId]?.assessments ?? (linked ? data.settings.lastPull?.at : null)) : data.settings.lastPull?.at) ?? loadLastSync()?.at ?? null;
  const sync = (
    <button type="button" className="verify-nudge" onClick={() => syncPress.current?.()}>
      Sync now
    </button>
  );
  if (!at) {
    return (
      <p className="synced mono" data-level="amber">
        <span>Not synced from Halo yet.</span> {sync} <HowYouSync bare />
      </p>
    );
  }
  // Always the time, live ("5 min ago", "yesterday 12:48 PM"), even while a sync banner shows (George, 2026-10-11); an
  // out-of-date note goes beside it, never instead of it.
  const when = relTime(at, now, tz, today);
  // Where the last sync came from when it was the extension, so a student can tell the three-hourly sync is landing.
  const via = !courseId && data.settings.lastPull?.via === 'extension' && data.settings.lastPull.at === at ? ' via extension' : '';
  return (
    <>
      <p className="synced mono" data-level={stale ? 'amber' : 'ok'}>
        <span className="synced-when">
          Synced from Halo {when}
          {via}.
        </span>
        {stale && (
          <>
            {' '}
            <span>{stale}</span> {sync} <HowYouSync bare />
          </>
        )}
      </p>
      {!courseId && <AutoSyncPaused />}
    </>
  );
}
