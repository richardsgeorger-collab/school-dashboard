import { useEffect, useState } from 'react';
import { useCan } from '../config/useCan';
import { installedVersion, useExtension } from '../config/extension';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { isTouchDevice } from '../ui/device';
import { extConnected } from './extSetup';
import { useNeverSynced } from './Setup';

/**
 * "Turn on auto-sync" in the top bar, beside the streak, on every screen until the extension is connected (George,
 * 2026-10-05: "no one should be missing this"). Desktop Chrome, Edge or Brave only: anywhere else there is nothing to
 * install. No pop-up any more (2026-10-25, Loop 268: "not a popup"); Now carries a gentle card, twice at most during
 * the trial (ExtensionNudge). Free has no auto-sync, so there it says "Get the extension".
 */
export function AutoSyncChip() {
  const { data } = useStore();
  const ext = useExtension();
  const { route } = useRoute();
  const [version, setVersion] = useState(installedVersion);
  const auto = useCan('haloAutoSync');
  // Before the first sync the "Not synced yet" pill leads (its setup is the extension's on this browser).
  const never = useNeverSynced();
  const shown = !!ext.url && !!ext.browser && !isTouchDevice() && !extConnected(data.settings, version) && !never;
  // The extension can arrive while Halo+ is open (its script writes its version here): the chip goes by itself.
  useEffect(() => {
    if (version) return;
    const iv = window.setInterval(() => setVersion(installedVersion()), 3000);
    return () => window.clearInterval(iv);
  }, [version]);
  if (!shown) return null;
  const open = () => {
    window.location.hash = `#/${route}?ext=1`;
  };
  return (
    <span className="autosync-chip-wrap">
      <button type="button" className="autosync-chip" onClick={open} title={auto ? 'Halo syncs itself every 3 hours with the Halo+ extension' : "Halo syncs whenever you're on Halo with the Halo+ extension"}>
        <span className="autosync-chip-dot" aria-hidden />
        <span className="chip-long">{auto ? 'Turn on auto-sync' : 'Get the extension'}</span>
        <span className="chip-short" aria-hidden>
          {auto ? 'Auto-sync' : 'Extension'}
        </span>
      </button>
    </span>
  );
}
