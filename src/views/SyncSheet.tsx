import { useState } from 'react';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { loadLastSync } from '../halo/handoff';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { useStore } from '../storage/store';
import { PlanWall, useSyncAccess } from './PlanWall';
import { HaloImport } from './HaloImport';
import { SyncAssignments } from './SyncAssignments';
import { BookmarkButton, useBookmarkHref } from './BookmarkButton';
import { HowYouSync } from './HowYouSync';
import { isChromeIOS, isIPad } from '../ui/device';

export { HANDOFF_PATH } from '../halo/handoff';
export { BookmarkButton, useBookmarkHref } from './BookmarkButton';

const isPhone = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent));

/**
 * How to get the bookmark onto this device and run it, for a computer or a phone, with the two fallbacks (paste the
 * export, import a calendar file) behind "Having trouble?". Used by the Sync sheet and by onboarding.
 */
export function SyncSteps({ onNote }: { onNote: (note: string) => void }) {
  const [phone, setPhone] = useState(isPhone);
  // A phone pastes the address by hand, so it gets the short loader; a computer drags the full one.
  const href = useBookmarkHref(phone ? 'short' : 'full');
  const [modal, setModal] = useState<'paste' | 'ics' | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      onNote('Copied. Now make a bookmark and paste this as its address.');
    } catch {
      onNote('Could not copy. On a computer, drag the button to your bookmarks bar instead.');
    }
  };

  return (
    <>
      <div className="sync-tabs" role="tablist" aria-label="Device">
        <button type="button" role="tab" className="btn small" aria-selected={!phone} onClick={() => setPhone(false)}>
          Computer
        </button>
        <button type="button" role="tab" className="btn small" aria-selected={phone} onClick={() => setPhone(true)}>
          {isIPad() ? 'iPad' : 'Phone'}
        </button>
      </div>

      {!phone ? (
        <ol className="halo-steps">
          <li>
            Drag <BookmarkButton onClickNote={onNote} /> to your bookmarks bar. (If the bar is hidden: ⌘⇧B on Mac, Ctrl+Shift+B on Windows.)
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
          {isIPad() && !isChromeIOS() ? (
            <>
              <li>Settings app, Apps, Safari: turn on Show Favorites Bar.</li>
              <li>Here in Safari: Share, then Add to Favorites, then Save.</li>
              <li>Sidebar, Bookmarks, Favorites, Edit: tap it, name it {BOOKMARK_NAME}, clear the address, paste, Done.</li>
              <li>On Halo, tap {BOOKMARK_NAME} in the Favorites Bar.</li>
            </>
          ) : isIPad() ? (
            <>
              <li>Here in Chrome: ⋯, then Add to Bookmarks.</li>
              <li>⋯, Bookmarks, press and hold it, Edit Bookmark: name it {BOOKMARK_NAME}, clear the URL, paste, Done.</li>
              <li>On Halo, tap the address bar, type Sync Halo, and tap the bookmark.</li>
            </>
          ) : (
            <>
              <li>Bookmark this page: Share, then Add Bookmark.</li>
              <li>Open your bookmarks, edit the one you just made, and replace its address with what you copied (it is short). Name it {BOOKMARK_NAME}.</li>
              <li>Go to halo.gcu.edu, log in, open your bookmarks and tap {BOOKMARK_NAME}. Come back here to approve the changes.</li>
            </>
          )}
        </ol>
      )}

      <details className="sync-trouble">
        <summary className="diff-toggle">Having trouble?</summary>
        <p className="hint">If the bookmark ran but nothing arrived here, it left the export on your clipboard.</p>
        <div className="settings-actions">
          <button type="button" className="btn small" onClick={() => setModal('paste')}>
            Paste the export
          </button>
          <button type="button" className="btn small" onClick={() => void copy()}>
            Copy bookmark address
          </button>
          <button type="button" className="btn small" onClick={() => setModal('ics')}>
            Import a calendar file (.ics) instead
          </button>
        </div>
      </details>
      {modal === 'paste' && <HaloImport onClose={() => setModal(null)} />}
      {modal === 'ics' && <SyncAssignments onClose={() => setModal(null)} />}
    </>
  );
}

/**
 * The Sync button. One bookmark is the whole connection to Halo: this sheet gets it installed on this device, says
 * when Halo was last synced, and keeps the fallbacks a tap away without leading with them.
 */
export function SyncSheet({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const [note, setNote] = useState<string | null>(null);
  const last = data.settings.lastPull?.at ?? loadLastSync()?.at ?? null;
  const walled = !useSyncAccess().allowed;
  if (walled) {
    // Free (2026-09-29): Sync still works as a peek. Run the bookmark and Halo+ counts what changed, adding nothing.
    return (
      <Modal title="See what's changed in Halo" onClose={onClose}>
        <div className="modal-body sync-sheet">
          <p className="trial-lead">{last ? `Your planner is as of ${fmtDate(dateOf(last, tz), 'short')}.` : 'Your planner has no Halo data yet.'} Run {BOOKMARK_NAME} on Halo as usual: on Free, Halo+ shows what changed there without adding it.</p>
          <HowYouSync />
          <SyncSteps onNote={setNote} />
          {note && (
            <p className="hint" role="status">
              {note}
            </p>
          )}
          <PlanWall context="sync" />
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Sync Halo" onClose={onClose}>
      <div className="modal-body sync-sheet">
        <p className="hint">{last ? `Last synced ${fmtDate(dateOf(last, tz), 'short')} ${fmtTime(last, tz)}.` : 'Not synced yet.'}</p>
        <HowYouSync />
        <p className="hint">
          The <b>{BOOKMARK_NAME}</b> bookmark runs on Halo&apos;s own page while you are logged in there and sends your classes, assignments, grades and announcements here. It never sees your password. You approve every change before it applies.
        </p>
        <SyncSteps onNote={setNote} />
        {note && (
          <p className="hint" role="status">
            {note}
          </p>
        )}
      </div>
    </Modal>
  );
}
