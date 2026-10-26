import { useExtension } from '../config/extension';
import { useCan } from '../config/useCan';

/**
 * Auto-sync on You → Halo connection (2026-10-01, the extension is on the Web Store; Plus and Max since 2026-10-04):
 * Enable auto-sync, or that it is on. Shown only where it can be installed (desktop Chrome, Edge, Brave) and while
 * Admin has a store address. Free (since 2026-10-25, Loop 268) gets the same card worded for what Free has: the
 * extension syncs whenever the student is on Halo.
 */
export function AutoSyncCard() {
  const ext = useExtension();
  const auto = useCan('haloAutoSync');
  const manual = useCan('haloManualSync');
  if (!ext.url || !ext.browser || !manual) return null;
  const b = ext.browser;
  return (
    <section className="card settings-card autosync-card" aria-label={auto ? 'Auto-sync' : 'The Halo+ extension'}>
      <h2 className="section-title">{auto ? 'Auto-sync' : 'The Halo+ extension'}</h2>
      {ext.installed ? (
        <p className="autosync-on">
          <span className="autosync-dot" aria-hidden /> <b>{auto ? 'Auto-sync is on.' : 'The extension is on.'}</b> The Halo+ extension ({ext.installed}) {auto ? `syncs Halo every 3 hours while ${b} is open, even with Halo+ closed.` : "syncs Halo whenever you're on Halo, and puts This week on Halo's home page."}
          {!auto && <span className="hint"> Plus also syncs in the background every 3 hours.</span>}
        </p>
      ) : (
        <>
          <p>{auto ? `Add the Halo+ extension and Halo syncs on its own every 3 hours while ${b} is open. No more clicking the bookmark.` : `Add the Halo+ extension and Halo syncs whenever you're on Halo, with This week right on Halo's home page. No more clicking the bookmark.`}</p>
          <div className="settings-actions">
            <a className="btn primary" href={ext.url} target="_blank" rel="noopener">
              {auto ? 'Enable auto-sync' : `Add it to ${b}`}
            </a>
          </div>
          <p className="hint">It opens the Chrome Web Store; press Add to {b}, then come back. It never sees your GCU password.</p>
        </>
      )}
    </section>
  );
}
