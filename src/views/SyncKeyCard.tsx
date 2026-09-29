import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { useState } from 'react';
import { resetSyncKey, useSyncKey } from '../halo/serverSync';

/**
 * Shown only while syncing from iPad and phones (the server path) is on for this account: what the key in their
 * bookmark is, and one button to reset it, after which the old bookmark stops working and they save it again.
 */
export function SyncKeyCard() {
  const sk = useSyncKey();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!sk?.enabled) return null;
  const reset = async () => {
    setBusy(true);
    const r = await resetSyncKey();
    setBusy(false);
    setNote(r ? `Reset. Your old bookmark no longer sends anything here. Save the ${BOOKMARK_NAME} bookmark again from Connect Halo.` : 'Could not reset it. Check your connection and try again.');
  };
  return (
    <section className="card settings-card" aria-label="Sync key">
      <h2 className="section-title">Syncing from iPad and phones</h2>
      <p className="hint">Your {BOOKMARK_NAME} bookmark carries a private key that lets it send your Halo data straight to your account, so it works on an iPad or a phone. The key can only drop off a sync for you to review. It can't read anything.</p>
      <p className="hint">If you shared your bookmark with someone by mistake, reset the key and save the bookmark again.</p>
      <div className="settings-actions">
        <button type="button" className="btn small" disabled={busy} onClick={() => void reset()}>
          {busy ? 'Resetting…' : 'Reset sync key'}
        </button>
      </div>
      {note && <p className="hint" role="status">{note}</p>}
    </section>
  );
}
