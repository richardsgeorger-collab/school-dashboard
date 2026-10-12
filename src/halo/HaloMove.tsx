import { useState } from 'react';
import { supabase } from '../auth/client';
import { Modal } from '../components/Modal';
import type { HaloExport } from './types';

/**
 * "This Halo account is linked to ge***@gmail.com. Move it to this account?" (George, 2026-10-11). Two ways in: a move
 * offer the server kept when this account's sync key sent a Halo that another Halo+ account holds, or a sync handed
 * straight to this tab whose Halo belongs elsewhere. Moving needs this sign-in and that fresh sync from a live Halo
 * session; the old account's Halo data is cleared and it stops syncing this Halo (the server does both).
 */
export type MoveAsk =
  | { from: 'offer'; offerId: string; masked: string; canMove: true }
  | { from: 'tab'; payload: HaloExport; masked: string; canMove: boolean };

export function HaloMovePrompt({ ask, onMoved, onClose }: { ask: MoveAsk; onMoved: (payload: HaloExport | null) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const move = async () => {
    const c = supabase();
    if (!c) return;
    setBusy(true);
    setErr(null);
    const r =
      ask.from === 'offer'
        ? await c.rpc('halo_claim', { p_offer: ask.offerId })
        : await c.rpc('halo_claim_direct', { p_halo_user: ask.payload.haloUser, p_class_ids: ask.payload.classes.map((k) => k.id), p_exported_at: ask.payload.exportedAt });
    setBusy(false);
    const d = r.data as { ok?: boolean; why?: string } | null;
    if (r.error || !d?.ok) return setErr(d?.why ?? r.error?.message ?? 'Could not move it. Sync from Halo again, then try.');
    onMoved(ask.from === 'tab' ? ask.payload : null);
  };
  const cancel = async () => {
    if (ask.from === 'offer') await supabase()?.from('halo_move_offers').delete().eq('id', ask.offerId);
    onClose();
  };
  if (!ask.canMove)
    return (
      <Modal title="This Halo account belongs to another account" onClose={onClose}>
        <div className="halo-move">
          <p>
            This Halo account is linked to <b>{ask.masked}</b>. A test account can't take a student's Halo account, so nothing was synced here.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  return (
    <Modal title="Move your Halo account here?" onClose={() => void cancel()}>
      <div className="halo-move">
        <p className="halo-move-q">
          This Halo account is linked to <b>{ask.masked}</b>. Move it to this account?
        </p>
        <p className="hint">Its synced classes and assignments leave that account, and that account stops syncing this Halo. This account gets the sync you just ran. You can move it back the same way.</p>
        {err && (
          <p className="hint checkout-error" role="alert">
            {err}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void cancel()}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void move()}>
            {busy ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
