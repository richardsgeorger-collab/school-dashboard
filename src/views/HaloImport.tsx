import { useEffect, useState } from 'react';
import { useStore } from '../storage/store';
import { Modal } from '../components/Modal';
import { parseHaloExport, saveLastSync } from '../halo/handoff';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import type { HaloExport } from '../halo/types';
import { pixelOnce } from '../analytics/pixel';
import { track } from '../onboarding/track';
import { DiffReview, type AppliedSummary } from './DiffReview';

/** Fallback path: the Halo bookmark's export, pasted or handed off. The .ics import is the normal path. */
export function HaloImport({ payload: initial = null, onClose, auto = false, background = false }: { payload?: HaloExport | null; onClose: () => void; auto?: boolean; /** The extension's scheduled sync: applied quietly, no removals, a note with Undo. */ background?: boolean }) {
  const [payload, setPayload] = useState<HaloExport | null>(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const read = (t: string) => {
    try {
      setPayload(parseHaloExport(t));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      read(t);
    } catch {
      setError('Could not read the clipboard. Paste into the box instead.');
    }
  };

  const [done, setDone] = useState<AppliedSummary | null>(null);
  const applied = (s: AppliedSummary) => {
    if (background) setDone(s);
    saveLastSync({ at: new Date().toISOString(), added: s.added, changed: s.changed, removed: s.removed, completed: s.completed + s.scored });
    // One row per sync, with the platform, for the admin screen; the pixel once, for the funnel.
    track('sync', 'complete');
    pixelOnce('HaloConnected');
  };
  // The extension's scheduled sync (George, 2026-09-30: "never interrupt what I'm doing"): no review sheet over the
  // screen. Everything but removals applies, and one small note says what changed, with Undo.
  if (background && initial)
    return <BackgroundApply payload={initial} onApplied={applied} onClose={onClose} done={done} />;
  // The first sync applies itself behind the onboarding's payoff: no review sheet for a planner that was empty.
  if (auto && initial)
    return (
      <div hidden>
        <DiffReview payload={initial} source="halo" autoApply onApplied={applied} onClose={onClose} />
      </div>
    );
  return (
    <Modal title="What Halo sent" onClose={onClose}>
      <div className="modal-body">
        {!payload ? (
          <>
            <p className="hint">Click the {BOOKMARK_NAME} bookmark while you are on halo.gcu.edu. If this tab did not pick it up on its own, paste the export here. It contains assignment data only, never your login.</p>
            <textarea className="halo-paste" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"kind":"halo-export", …}' rows={6} spellCheck={false} />
            {error && (
              <p className="hint" style={{ color: 'var(--overdue)' }}>
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => void fromClipboard()}>
                Paste from clipboard
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => read(text)}>
                Read export
              </button>
            </div>
          </>
        ) : (
          <DiffReview
            payload={payload}
            source="halo"
            onApplied={applied}
            onClose={onClose}
          />
        )}
      </div>
    </Modal>
  );
}

function BackgroundApply({ payload, onApplied, onClose, done }: { payload: HaloExport; onApplied: (s: AppliedSummary) => void; onClose: () => void; done: AppliedSummary | null }) {
  const { actions, undo } = useStore();
  const [applying, setApplying] = useState(true);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setHidden(true);
      onClose();
    }, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  const line = done ? backgroundLine(done) : null;
  return (
    <>
      {applying && (
        <div hidden>
          <DiffReview payload={payload} source="halo" autoApply keepRemovals onApplied={onApplied} onClose={() => setApplying(false)} />
        </div>
      )}
      {line && !hidden && (
        <div className="done-toast" role="status">
          <span className="done-toast-text">{line}</span>
          {undo && undo.count > 0 && (done!.added + done!.changed + done!.completed + done!.scored > 0) && (
            <button type="button" className="done-toast-undo" onClick={() => { actions.undoLast(); setHidden(true); onClose(); }}>
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** "Synced from Halo: 2 new, 1 changed." or null when nothing a student would notice changed. */
export function backgroundLine(s: AppliedSummary): string | null {
  const parts = [s.added ? `${s.added} new` : '', s.changed ? `${s.changed} changed` : '', s.completed + s.scored ? `${s.completed + s.scored} marked done` : ''].filter(Boolean);
  return parts.length ? `Synced from Halo: ${parts.join(', ')}.` : null;
}
