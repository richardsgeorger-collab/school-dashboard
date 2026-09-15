import { useState } from 'react';
import { ItemRow } from '../components/ItemRow';
import { Modal } from '../components/Modal';
import { addDays, dateOf, fmtDate } from '../domain/dates';
import { weekReview } from '../domain/sunday';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * Five minutes on a Sunday: what got done, what slipped, what is coming, and one sentence about it.
 * Slipped items can be finished or pushed a day from here; nothing else changes.
 */
export function SundayReview({ onClose, onDone, onOpen }: { onClose: () => void; onDone: () => void; onOpen?: (item: Item) => void }) {
  const { data, schedule, today, actions } = useStore();
  const tz = data.settings.timezone;
  const r = weekReview(data.items, schedule, today, tz);
  const [showDone, setShowDone] = useState(false);
  const tomorrow = addDays(today, 1);
  const push = (i: Item) => actions.upsertItem({ ...i, snoozedUntil: tomorrow, startByOverride: tomorrow });

  return (
    <Modal title="Sunday review" onClose={onClose}>
      <div className="modal-body sunday">
        <p className="sunday-sentence">{r.sentence}</p>

        <section>
          <h3 className="section-title">
            done{' '}
            <span className="count">{r.done.length}</span>
            {r.done.length > 0 && (
              <button type="button" className="then-all" onClick={() => setShowDone((s) => !s)}>
                {showDone ? 'hide' : 'show'}
              </button>
            )}
          </h3>
          {showDone && (
            <ul className="sunday-list mono">
              {r.done.map((i) => (
                <li key={i.id}>
                  {i.label} <span className="muted">· {i.completedAt ? fmtDate(dateOf(i.completedAt, tz), 'short') : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="section-title">
            slipped <span className="count">{r.slipped.length}</span>
          </h3>
          {r.slipped.length === 0 ? (
            <p className="hint">Nothing slipped.</p>
          ) : (
            <ul className="item-list sunday-slipped">
              {r.slipped.map((i) => (
                <li key={i.id} className="sunday-row">
                  <ItemRow item={i} onOpen={onOpen ?? (() => undefined)} />
                  <span className="sunday-actions">
                    <button type="button" className="btn small" onClick={() => actions.setStatus(i.id, 'done')}>
                      Done
                    </button>
                    <button type="button" className="btn small" disabled={i.snoozedUntil === tomorrow} onClick={() => push(i)}>
                      {i.snoozedUntil === tomorrow ? 'Pushed to tomorrow' : 'Push to tomorrow'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="section-title">
            coming this week <span className="count">{r.coming.length}</span>
          </h3>
          {r.coming.length === 0 ? (
            <p className="hint">Nothing due in the next seven days.</p>
          ) : (
            <ul className="item-list">
              {r.coming.slice(0, 12).map((i) => (
                <ItemRow key={i.id} item={i} onOpen={onOpen ?? (() => undefined)} showStart />
              ))}
              {r.coming.length > 12 && <li className="hint">+ {r.coming.length - 12} more</li>}
            </ul>
          )}
        </section>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Not now
          </button>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onDone}>
            That&apos;s my week
          </button>
        </div>
      </div>
    </Modal>
  );
}
