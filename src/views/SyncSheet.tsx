import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { bookmarkletHref } from '../halo/bookmarklet';
import { loadLastSync } from '../halo/handoff';
import { useStore } from '../storage/store';
import { HaloImport } from './HaloImport';
import { SyncAssignments } from './SyncAssignments';

/** Where the bookmark sends its export: Now, with the flag that tells the shell to wait for it. */
export const HANDOFF_PATH = '#/now?halo=1';

export function useBookmarkHref(): string {
  return useMemo(() => bookmarkletHref({ dashOrigin: window.location.origin, dashPath: `${import.meta.env.BASE_URL}${HANDOFF_PATH}` }), []);
}

/** The draggable Sync Halo button. React refuses javascript: hrefs as props, so the address is set on the element. */
export function BookmarkButton({ onClickNote }: { onClickNote: (note: string) => void }) {
  const href = useBookmarkHref();
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    link.current?.setAttribute('href', href);
  }, [href]);
  return (
    <a
      ref={link}
      className="btn primary halo-drag"
      draggable
      onClick={(e) => {
        e.preventDefault();
        onClickNote('Drag this button to your bookmarks bar. Clicking it here does nothing; clicking it on Halo does everything.');
      }}
    >
      Sync Halo
    </a>
  );
}

const isPhone = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent));

/**
 * The Sync button. One bookmark is the whole connection to Halo: this sheet gets it installed on this device, says
 * when Halo was last synced, and keeps the two fallbacks (paste the export, import a calendar file) a tap away
 * without leading with them.
 */
export function SyncSheet({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const href = useBookmarkHref();
  const [mode, setMode] = useState<'halo' | 'paste' | 'ics'>('halo');
  const [note, setNote] = useState<string | null>(null);
  const [phone, setPhone] = useState(isPhone);
  const last = data.settings.lastPull?.at ?? loadLastSync()?.at ?? null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setNote('Copied. Now make a bookmark and paste this as its address.');
    } catch {
      setNote('Could not copy. On a computer, drag the button to your bookmarks bar instead.');
    }
  };

  if (mode === 'ics') return <SyncAssignments onClose={onClose} />;
  if (mode === 'paste') return <HaloImport onClose={onClose} />;

  return (
    <Modal title="Sync from Halo" onClose={onClose}>
      <div className="modal-body sync-sheet">
        <p className="hint mono">{last ? `Last synced ${fmtDate(dateOf(last, tz), 'short')} ${fmtTime(last, tz)}.` : 'Not synced yet.'}</p>
        <p className="hint">
          The <b>Sync Halo</b> bookmark runs on Halo&apos;s own page while you are logged in there and sends your classes, assignments, grades and announcements here. It never sees your password. You approve every change before it applies.
        </p>

        <div className="sync-tabs" role="tablist" aria-label="Device">
          <button type="button" role="tab" className="btn small" aria-selected={!phone} onClick={() => setPhone(false)}>
            Computer
          </button>
          <button type="button" role="tab" className="btn small" aria-selected={phone} onClick={() => setPhone(true)}>
            Phone
          </button>
        </div>

        {!phone ? (
          <ol className="halo-steps">
            <li>
              Drag <BookmarkButton onClickNote={setNote} /> to your bookmarks bar. (If the bar is hidden: ⌘⇧B on Mac, Ctrl+Shift+B on Windows.)
            </li>
            <li>Open halo.gcu.edu and log in as usual.</li>
            <li>Click the bookmark. This tab fills in with the changes for you to approve.</li>
          </ol>
        ) : (
          <ol className="halo-steps">
            <li>
              <button type="button" className="btn small primary" onClick={() => void copy()}>
                Copy bookmark address
              </button>
            </li>
            <li>Bookmark this page: Share, then Add Bookmark.</li>
            <li>Open your bookmarks, edit the one you just made, and replace its address with what you copied. Name it Sync Halo.</li>
            <li>Go to halo.gcu.edu, log in, open your bookmarks and tap Sync Halo. Come back here to approve the changes.</li>
          </ol>
        )}
        {note && (
          <p className="hint" role="status">
            {note}
          </p>
        )}

        <details className="sync-trouble">
          <summary className="diff-toggle">Having trouble?</summary>
          <p className="hint">If the bookmark ran but nothing arrived here, it left the export on your clipboard.</p>
          <div className="settings-actions">
            <button type="button" className="btn small" onClick={() => setMode('paste')}>
              Paste the export
            </button>
            <button type="button" className="btn small" onClick={() => void copy()}>
              Copy bookmark address
            </button>
            <button type="button" className="btn small" onClick={() => setMode('ics')}>
              Import a calendar file (.ics) instead
            </button>
          </div>
        </details>
      </div>
    </Modal>
  );
}
