import { useEffect, useMemo, useRef, useState } from 'react';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { bookmarkletHref } from '../halo/bookmarklet';
import { loadLastSync } from '../halo/handoff';
import { useStore } from '../storage/store';

export function HaloPanel({ onPaste }: { onPaste: () => void }) {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const link = useRef<HTMLAnchorElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const href = useMemo(() => bookmarkletHref({ dashOrigin: window.location.origin, dashPath: `${import.meta.env.BASE_URL}#/settings?halo=1` }), []);
  // React refuses javascript: hrefs as props; the bookmark link is set on the element directly.
  useEffect(() => {
    link.current?.setAttribute('href', href);
  }, [href]);
  const last = loadLastSync();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setNote('Copied. Make a new bookmark and paste this as its address.');
    } catch {
      setNote('Could not copy. Drag the button to your bookmarks bar instead.');
    }
  };

  return (
    <section className="card settings-card">
      <h2 className="section-title">Halo bookmark, fallback</h2>
      <p className="hint">
        The normal way to sync is the Sync button in the top bar with Better Halo&apos;s .ics export. Keep this bookmark for when that export is not available: it runs on
        Halo&apos;s own page, reads your session there, and sends only assignment data here. You approve every change before it applies.
      </p>
      <ol className="halo-steps">
        <li>
          Drag{' '}
          <a
            ref={link}
            className="btn primary halo-drag"
            draggable
            onClick={(e) => {
              e.preventDefault();
              setNote('Drag this button to your bookmarks bar. Clicking it here does nothing.');
            }}
          >
            Sync Halo
          </a>{' '}
          to your bookmarks bar.
        </li>
        <li>Open halo.gcu.edu and log in.</li>
        <li>Click the bookmark. This site opens with the changes for you to approve.</li>
      </ol>
      <div className="settings-actions">
        <button type="button" className="btn" onClick={() => void copy()}>
          Copy bookmark address
        </button>
        <button type="button" className="btn" onClick={onPaste}>
          Paste Halo export
        </button>
      </div>
      {note && (
        <p className="hint" style={{ marginTop: 8 }}>
          {note}
        </p>
      )}
      <p className="hint mono" style={{ marginTop: 8 }}>
        {last
          ? `Last Halo sync ${fmtDate(dateOf(last.at, tz), 'short')} ${fmtTime(last.at, tz)} · ${last.added} added · ${last.changed} changed · ${last.completed} done · ${last.removed} removed`
          : 'Never synced from Halo.'}
      </p>
    </section>
  );
}
