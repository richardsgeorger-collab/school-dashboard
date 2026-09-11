import { useState } from 'react';
import { Modal } from '../components/Modal';
import { parseHaloExport, saveLastSync } from '../halo/handoff';
import type { HaloExport } from '../halo/types';
import { DiffReview } from './DiffReview';

/** Fallback path: the Halo bookmark's export, pasted or handed off. The .ics import is the normal path. */
export function HaloImport({ payload: initial = null, onClose }: { payload?: HaloExport | null; onClose: () => void }) {
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

  return (
    <Modal title="Sync from the Halo bookmark" onClose={onClose}>
      <div className="modal-body">
        {!payload ? (
          <>
            <p className="hint">Click the Sync Halo bookmark while you are on halo.gcu.edu. If this tab did not pick it up on its own, paste the export here. It contains assignment data only, never your login.</p>
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
            onApplied={(s) => saveLastSync({ at: new Date().toISOString(), added: s.added, changed: s.changed, removed: s.removed, completed: s.completed })}
            onClose={onClose}
          />
        )}
      </div>
    </Modal>
  );
}
