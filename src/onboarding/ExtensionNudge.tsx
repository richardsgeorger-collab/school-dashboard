import { installedVersion, useExtension } from '../config/extension';
import { useStore } from '../storage/store';
import { extNudgeDue } from './extSetup';

/** After "Skip for now" on the extension setup: one small line on Now for 7 days, then never again (2026-10-04). */
export function ExtensionNudge() {
  const { data } = useStore();
  const ext = useExtension();
  if (!ext.url || !extNudgeDue(data.settings, ext.browser, installedVersion())) return null;
  return (
    <p className="ext-nudge">
      <a className="hero-inline" href="#/now?ext=1">
        Get the extension
      </a>{' '}
      <span>and Halo syncs on its own every 3 hours.</span>
    </p>
  );
}
