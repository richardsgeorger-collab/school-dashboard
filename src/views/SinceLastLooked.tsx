import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { isDemo } from '../demo/demo';
import { changesLine, changesSince, snapshotOf, type Change, type Snapshot } from '../domain/changes';
import { fmtDate } from '../domain/dates';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';

const KEY = (who: string) => `school-dashboard:now-snapshot:${who}`;
const read = (who: string): Snapshot | null => {
  try {
    const raw = localStorage.getItem(KEY(who));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
};

const VERB: Record<Change['kind'], string> = { new: 'New', moved: 'Moved', graded: 'Graded', asks: 'Asks' };

/**
 * "Since you last looked: 1 new assignment, 2 new grades" on Now (George, 2026-10-05). The picture from the last visit
 * on this device, compared with the planner now; a tap opens the list, and each line opens its assignment. Saved
 * again when Now is left, so the next visit starts from here.
 */
/**
 * What changed since the picture from the last visit on this device (new work, moved dates, grades, asks from
 * announcements), and that picture saved again when Now is left. Shared by the line below and the welcome-back card.
 */
export function useSinceLastLooked(): Change[] {
  const { data } = useStore();
  const { auth } = useAccount();
  const who = isDemo() ? 'demo' : (auth.session?.user.id ?? auth.knownUserId ?? 'local');
  const tz = data.settings.timezone;
  const [before] = useState(() => read(who));
  const latest = useRef(data.items);
  latest.current = data.items;
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(KEY(who), JSON.stringify(snapshotOf(latest.current, tz, new Date().toISOString())));
      } catch {
        /* storage unavailable */
      }
    };
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [who, tz]);
  return useMemo(() => changesSince(before, data.items, tz, (d) => fmtDate(d, 'short')), [before, data.items, tz]);
}

export function SinceLastLooked({ onOpen, hidden = false }: { onOpen: (i: Item) => void; hidden?: boolean }) {
  const changes = useSinceLastLooked();
  const [open, setOpen] = useState(false);
  const line = hidden ? null : changesLine(changes);
  if (!line) return null;
  return (
    <div className="since-looked">
      <button type="button" className="since-looked-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="since-looked-dot" aria-hidden />
        <span>
          <b>Since you last looked:</b> {line}
        </span>
        <span className="since-looked-caret" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul className="since-looked-list">
          {changes.slice(0, 12).map((c) => (
            <li key={`${c.kind}-${c.item.id}`}>
              <button type="button" className="since-looked-item" onClick={() => onOpen(c.item)}>
                <span className="since-looked-kind" data-kind={c.kind}>
                  {VERB[c.kind]}
                </span>
                <span className="since-looked-label">{c.item.label}</span>
                <span className="since-looked-detail">{c.detail}</span>
              </button>
            </li>
          ))}
          {changes.length > 12 && <li className="hint">and {changes.length - 12} more</li>}
        </ul>
      )}
    </div>
  );
}
