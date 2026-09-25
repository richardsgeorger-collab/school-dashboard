import { dateOf, diffDays, fmtDate, fmtTime } from '../domain/dates';
import { loadLastSync } from '../halo/handoff';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';

/**
 * The trust line: when what is on screen last matched Halo, or that it never has. Always present, always one line,
 * with the one button that fixes it when it is out of date.
 */
export function SyncedLine({ stale, courseId }: { stale?: string | null; courseId?: string }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const at = (courseId ? data.settings.haloPulls?.[courseId]?.assessments : data.settings.lastPull?.at) ?? loadLastSync()?.at ?? null;
  const sync = (
    <button type="button" className="verify-nudge" onClick={() => syncPress.current?.()}>
      Sync now
    </button>
  );
  if (!at) {
    return (
      <p className="synced mono" data-level="amber">
        <span>Not synced from Halo yet.</span> {sync}
      </p>
    );
  }
  const day = dateOf(at, tz);
  const k = diffDays(day, today);
  const when = k === 0 ? `today ${fmtTime(at, tz)}` : k === 1 ? `yesterday ${fmtTime(at, tz)}` : `${fmtDate(day, 'short')} ${fmtTime(at, tz)}`;
  if (stale) {
    return (
      <p className="synced mono" data-level="amber">
        <span>{stale}</span> {sync}
      </p>
    );
  }
  return (
    <p className="synced mono" data-level="ok">
      Synced from Halo {when}.
    </p>
  );
}
