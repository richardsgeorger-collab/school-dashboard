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
          Phone
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
          <li>Bookmark this page: Share, then Add Bookmark.</li>
          <li>Open your bookmarks, edit the one you just made, and replace its address with what you copied (it is short). Name it {BOOKMARK_NAME}.</li>
          <li>Go to halo.gcu.edu, log in, open your bookmarks and tap {BOOKMARK_NAME}. Come back here to approve the changes.</li>
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
    return (
      <Modal title="Sync Halo" onClose={onClose}>
        <div className="modal-body sync-sheet">
          <PlanWall context="sync" />
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Sync Halo" onClose={onClose}>
      <div className="modal-body sync-sheet">
        <p className="hint mono">{last ? `Last synced ${fmtDate(dateOf(last, tz), 'short')} ${fmtTime(last, tz)}.` : 'Not synced yet.'}</p>
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
