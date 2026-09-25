import { useEffect, useMemo, useRef, useState } from 'react';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { bookmarkletHref } from '../halo/bookmarklet';
import { COUNT_WORDS, countsLine, type PullCounts } from '../halo/counts';
import { cleanAll, rulesFor } from '../domain/reqClean';
import { loadLastSync } from '../halo/handoff';
import { useStore } from '../storage/store';

export function HaloPanel({ onPaste }: { onPaste: () => void }) {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const link = useRef<HTMLAnchorElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const href = useMemo(() => bookmarkletHref({ dashOrigin: window.location.origin, dashPath: `${import.meta.env.BASE_URL}#/now?halo=1` }), []);
  // React refuses javascript: hrefs as props; the bookmark link is set on the element directly.
  useEffect(() => {
    link.current?.setAttribute('href', href);
  }, [href]);
  const last = loadLastSync();
  const pull = data.settings.lastPull;
  // Before and after on the announcement cleanup, over whatever is actually in the planner right now.
  const before = data.items.reduce((n, i) => n + (i.requirements?.length ?? 0), 0);
  const cleaned = cleanAll(data.items);
  const after = cleaned.items.reduce((n, i) => n + (i.requirements?.length ?? 0), 0);
  const rules = data.courses.reduce((n, c) => n + rulesFor(cleaned.items, c.id).length, 0);
  const onAgenda = after - cleaned.items.reduce((n, i) => n + (i.requirements ?? []).filter((r) => r.scope === 'rule').length, 0);

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
      <h2 className="section-title">Halo</h2>
      {before > 0 && (
        <p className="hint pull-tally">
          <b>Announcement cleanup</b>
          <br />
          {before} parts were extracted from your announcements. {cleaned.merged} were the same instruction from more than one post and
          merged; {cleaned.dropped} only repeated the assignment's own title and were dropped. {after} remain, of which {rules} are
          standing class rules that moved off the calendar. That leaves <b>{onAgenda}</b> real things to do on your agenda.
        </p>
      )}
      {pull && (
        <p className="hint pull-tally">
          <b>Last sync</b> <span className="mono">{fmtDate(dateOf(pull.at, tz), 'short')} {fmtTime(pull.at, tz)}</span>
          {pull.build ? <span className="mono muted"> · bookmark {pull.build}</span> : null}
          <br />
          {countsLine(pull.counts as unknown as PullCounts)}
          {COUNT_WORDS.some((w) => (pull.counts[w.key] ?? 0) === 0) ? (
            <>
              {' '}
              A zero means that query answered with nothing, which is different from failing. Anything that failed is
              named on the review screen when you sync.
            </>
          ) : null}
        </p>
      )}
      <p className="hint">
        One bookmark is the whole connection. It runs on Halo&apos;s own page while you are logged in there, reads your classes, assignments, grades and
        announcements, and sends only that here. It never sees your password and nothing is stored anywhere but this app. You approve every change before it applies.
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
