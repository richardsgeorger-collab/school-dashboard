import { useEffect, useMemo, useRef, useState } from 'react';
import { dateOf, diffDays, fmtDate, fmtTime } from '../domain/dates';
import { bookmarkletHref } from '../halo/bookmarklet';
import { COUNT_WORDS, countsLine, type PullCounts } from '../halo/counts';
import { cleanAll, rulesFor } from '../domain/reqClean';
import { loadLastSync } from '../halo/handoff';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';

/** The connection to Halo as one line, and the one button that sets it up. Everything else is in Advanced. */
export function HaloPanel({ onPaste }: { onPaste: () => void }) {
  const { data, today, undo, actions } = useStore();
  const tz = data.settings.timezone;
  const link = useRef<HTMLAnchorElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [install, setInstall] = useState(false);
  const href = useMemo(() => bookmarkletHref({ dashOrigin: window.location.origin, dashPath: `${import.meta.env.BASE_URL}#/now?halo=1` }), []);
  // React refuses javascript: hrefs as props; the bookmark link is set on the element directly.
  useEffect(() => {
    link.current?.setAttribute('href', href);
  }, [href, install]);
  const at = data.settings.lastPull?.at ?? loadLastSync()?.at ?? null;
  const when = at ? (diffDays(dateOf(at, tz), today) === 0 ? `today ${fmtTime(at, tz)}` : `${fmtDate(dateOf(at, tz), 'short')} ${fmtTime(at, tz)}`) : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setNote('Copied. Make a new bookmark and paste this as its address.');
    } catch {
      setNote('Could not copy. Drag the button to your bookmarks bar instead.');
    }
  };
  return (
    <section className="card settings-card" aria-label="Halo">
      <h2 className="section-title">Halo</h2>
      <p className="halo-status">{when ? `Connected. Last synced ${when}.` : 'Not connected yet.'}</p>
      {/* The last sync's changes can be put back whole until the next sync replaces them. */}
      {undo && (
        <p className="hint">
          The last sync made {undo.count} change{undo.count === 1 ? '' : 's'}.{' '}
          <button type="button" className="hero-inline" onClick={() => actions.undoLast()}>
            Undo {undo.count === 1 ? 'it' : 'them'}
          </button>
        </p>
      )}
      <div className="settings-actions">
        {when ? (
          <button type="button" className="btn small primary" onClick={() => syncPress.current?.()}>
            Sync now
          </button>
        ) : (
          <button type="button" className="btn small primary" onClick={() => setInstall(true)}>
            Install the bookmark
          </button>
        )}
        {when && (
          <button type="button" className="btn small" onClick={() => setInstall((v) => !v)}>
            {install ? 'Hide the bookmark' : 'Reinstall the bookmark'}
          </button>
        )}
        <button type="button" className="btn small" onClick={onPaste}>
          Paste an export
        </button>
      </div>
      {install && (
        <>
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
            <li>Tap or click the bookmark. This site opens with the changes for you to approve.</li>
          </ol>
          <p className="hint">
            The bookmark runs on Halo&apos;s own page while you are logged in there and sends only your classes, assignments, grades and announcements here. It never sees your password.{' '}
            <button type="button" className="hero-inline" onClick={() => void copy()}>
              Copy the address instead
            </button>
          </p>
        </>
      )}
      {note && <p className="hint">{note}</p>}
    </section>
  );
}

/** What the last sync carried and what the announcement cleanup did. Diagnostics: only under Advanced. */
export function HaloDiagnostics() {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const last = loadLastSync();
  const pull = data.settings.lastPull;
  const before = data.items.reduce((n, i) => n + (i.requirements?.length ?? 0), 0);
  const cleaned = cleanAll(data.items);
  const after = cleaned.items.reduce((n, i) => n + (i.requirements?.length ?? 0), 0);
  const rules = data.courses.reduce((n, c) => n + rulesFor(cleaned.items, c.id).length, 0);
  const onAgenda = after - cleaned.items.reduce((n, i) => n + (i.requirements ?? []).filter((r) => r.scope === 'rule').length, 0);
  if (!pull && !last && before === 0) return null;
  return (
    <div className="halo-diagnostics">
      <h3 className="section-title">Sync diagnostics</h3>
      {pull && (
        <p className="hint">
          <b>Last sync</b> {fmtDate(dateOf(pull.at, tz), 'short')} {fmtTime(pull.at, tz)}
          {pull.build ? ` · bookmark ${pull.build}` : ''}
          <br />
          {countsLine(pull.counts as unknown as PullCounts)}
          {COUNT_WORDS.some((w) => (pull.counts[w.key] ?? 0) === 0) ? ' A zero means that query answered with nothing, which is different from failing; anything that failed is named on the review screen when you sync.' : ''}
        </p>
      )}
      {last && (
        <p className="hint">
          Last Halo sync {fmtDate(dateOf(last.at, tz), 'short')} {fmtTime(last.at, tz)} · {last.added} added · {last.changed} changed · {last.completed} done · {last.removed} removed
        </p>
      )}
      {before > 0 && (
        <p className="hint">
          <b>Announcement cleanup</b> {before} parts extracted; {cleaned.merged} merged as the same instruction from several posts; {cleaned.dropped} dropped for only repeating the assignment; {after} remain, {rules} of them standing class rules off the calendar; <b>{onAgenda}</b> real things to do on the agenda.
        </p>
      )}
    </div>
  );
}
