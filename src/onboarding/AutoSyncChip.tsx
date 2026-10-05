import { useEffect, useState } from 'react';
import { installedVersion, useExtension } from '../config/extension';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { isTouchDevice } from '../ui/device';
import { extConnected } from './extSetup';

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
  // The extension can arrive while Halo+ is open (its script writes its version here): the chip goes by itself.
  useEffect(() => {
    if (version) return;
    const iv = window.setInterval(() => setVersion(installedVersion()), 3000);
    return () => window.clearInterval(iv);
  }, [version]);
  if (!ext.url || !ext.browser || isTouchDevice() || extConnected(data.settings, version)) return null;
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
      {callout && (
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
