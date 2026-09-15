import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { amIOkay } from '../domain/okay';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';
import { ItemDetail } from './ItemDetail';

/**
 * One paragraph, as a person would say it, ending in "You're fine." or the one thing to handle first.
 * Reached from the top bar and from the status line on Now. No prompt, no options.
 */
export function OkayCard({ onClose }: { onClose: () => void }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const okay = useMemo(() => amIOkay(data, schedule, today, new Date().toISOString(), tz), [data, schedule, today, tz]);
  const [open, setOpen] = useState<Item | null>(null);
  return (
    <>
      <Modal title="Am I okay?" onClose={onClose}>
        <div className="modal-body okay" data-verdict={okay.verdict}>
          <p className="okay-text">{okay.text}</p>
          <div className="modal-actions">
            <span className="spacer" />
            {okay.first && (
              <button type="button" className="btn" onClick={() => setOpen(okay.first)}>
                Open {okay.first.label}
              </button>
            )}
            <button type="button" className="btn primary" onClick={onClose}>
              {okay.verdict === 'fine' ? 'Good' : 'OK'}
            </button>
          </div>
        </div>
      </Modal>
      {open && (
        <ItemDetail
          key={open.id}
          item={open}
          onClose={() => {
            setOpen(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** The handle the top bar and Now share, so either can open the card. */
export const okayPress: { current: (() => void) | null } = { current: null };
