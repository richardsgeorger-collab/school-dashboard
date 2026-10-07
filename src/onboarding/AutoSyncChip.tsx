import { useEffect, useRef, useState } from 'react';
import { installedVersion, useExtension } from '../config/extension';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { isTouchDevice } from '../ui/device';
import { useSyncReminder } from '../views/SyncReminder';
import { extConnected } from './extSetup';
import { useNeverSynced } from './Setup';

const CALLOUT = 'school-dashboard:autosync-callout';
const readDay = (): string | null => {
  try {
    return localStorage.getItem(CALLOUT);
  } catch {
    return null;
  }
};

/**
 * "Turn on auto-sync" in the top bar, beside the streak, on every screen until the extension is connected (George,
 * 2026-10-05: "no one should be missing this"). Desktop Chrome, Edge or Brave only: anywhere else there is nothing to
 * install. The first time it shows each day a small pop-up points at it; it closes with ×. Either opens the setup.
 */
export function AutoSyncChip() {
  const { data, today } = useStore();
  const ext = useExtension();
  const { route } = useRoute();
  const [version, setVersion] = useState(installedVersion);
  const [callout, setCallout] = useState(() => readDay() !== today);
  // Never two sync prompts at once (2026-10-06): before the first sync the "Not synced yet" pill leads (its setup is the
  // extension's on this browser), and while Now's sync reminder is up the pop-up waits.
  const never = useNeverSynced();
  const reminding = !!useSyncReminder() && route === 'now';
  const shown = !!ext.url && !!ext.browser && !isTouchDevice() && !extConnected(data.settings, version) && !never;
  const popup = callout && !reminding;
  // A pop-up for the screen it appeared on: moving to another screen lets it go (the chip stays).
  const firstRoute = useRef(route);
  useEffect(() => {
    if (route !== firstRoute.current) setCallout(false);
  }, [route]);
  // Seen once is seen for the day: the pop-up shows on the first screen today, not on every screen after it.
  useEffect(() => {
    if (!shown || !popup) return;
    try {
      localStorage.setItem(CALLOUT, today);
    } catch {
      /* storage unavailable */
    }
  }, [shown, popup, today]);
  // The extension can arrive while Halo+ is open (its script writes its version here): the chip goes by itself.
  useEffect(() => {
    if (version) return;
    const iv = window.setInterval(() => setVersion(installedVersion()), 3000);
    return () => window.clearInterval(iv);
  }, [version]);
  if (!shown) return null;
  const open = () => {
    try {
      localStorage.setItem(CALLOUT, today);
    } catch {
      /* storage unavailable */
    }
    setCallout(false);
    window.location.hash = `#/${route}?ext=1`;
  };
  const close = () => {
    try {
      localStorage.setItem(CALLOUT, today);
    } catch {
      /* storage unavailable */
    }
    setCallout(false);
  };
  return (
    <span className="autosync-chip-wrap">
      <button type="button" className="autosync-chip" onClick={open} title="Halo syncs itself every 3 hours with the Halo+ extension">
        <span className="autosync-chip-dot" aria-hidden />
        <span className="chip-long">Turn on auto-sync</span>
        <span className="chip-short" aria-hidden>
          Auto-sync
        </span>
      </button>
      {popup && (
        <span className="autosync-callout" role="status">
          <b>Halo can sync itself.</b> Add the Halo+ extension and your classes stay current every 3 hours, no clicking.
          <span className="autosync-callout-actions">
            <button type="button" className="btn small primary" onClick={open}>
              Turn it on
            </button>
            <button type="button" className="autosync-callout-x" aria-label="Close" onClick={close}>
              ×
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
