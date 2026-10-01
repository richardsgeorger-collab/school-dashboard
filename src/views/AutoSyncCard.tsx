import { useExtension } from '../config/extension';
import { useCan } from '../config/useCan';

/**
 * Auto-sync on You → Halo connection (2026-10-01, the extension is on the Web Store). Max: Enable auto-sync, or that
 * it is on. Plus: auto-sync is part of Max, and the extension still syncs with one click. Shown only where it can be
 * installed (desktop Chrome, Edge, Brave) and while Admin has a store address; Free sees nothing here.
 */
export function AutoSyncCard() {
  const ext = useExtension();
  const auto = useCan('haloAutoSync');
  const manual = useCan('haloManualSync');
  if (!ext.url || !ext.browser || !manual) return null;
  const b = ext.browser;
  return (
    <section className="card settings-card autosync-card" aria-label="Auto-sync">
      <h2 className="section-title">Auto-sync</h2>
      {auto && ext.installed ? (
        <p className="autosync-on">
          <span className="autosync-dot" aria-hidden /> <b>Auto-sync is on.</b> The Halo+ extension ({ext.installed}) syncs Halo every 3 hours while {b} is open, even with Halo+ closed.
        </p>
      ) : auto ? (
        <>
          <p>Add the Halo+ extension and Halo syncs on its own every 3 hours while {b} is open. No more clicking the bookmark.</p>
          <div className="settings-actions">
            <a className="btn primary" href={ext.url} target="_blank" rel="noopener">
              Enable auto-sync
            </a>
          </div>
          <p className="hint">It opens the Chrome Web Store; press Add to {b}, then come back. It never sees your GCU password.</p>
        </>
      ) : (
        <>
          <p>
            <b>Auto-sync is part of Max:</b> Halo syncs on its own every 3 hours. On Plus, the extension syncs with one click (Sync now).
          </p>
          <div className="settings-actions">
            <a className="btn primary" href="#/you?s=plan&to=max">
              Get Max
            </a>
            {!ext.installed && (
              <a className="btn" href={ext.url} target="_blank" rel="noopener">
                Add to {b}
              </a>
            )}
          </div>
        </>
      )}
    </section>
  );
}
