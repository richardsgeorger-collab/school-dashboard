import { useEffect } from 'react';
import { bump } from '../analytics/usage';
import type { Item } from '../domain/types';
import { lockedLine } from '../halo/peek';

const SEEN_SLOT = 'school-dashboard:locked-seen';

/** Counted once per item per device, so Admin can see who upgrades after seeing one (Loop 268). */
function countSeen(item: Item) {
  try {
    const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_SLOT) ?? '[]') as string[]);
    if (seen.has(item.id)) return;
    seen.add(item.id);
    localStorage.setItem(SEEN_SLOT, JSON.stringify([...seen].slice(-300)));
  } catch {
    /* storage blocked: the count is a nicety */
  }
  bump('locked:seen');
  for (const k of item.lockedChange?.kinds ?? []) bump(`locked:seen:${k}`);
}

/**
 * Free (George, 2026-10-25): an announcement changed this assignment. Said honestly, in the assignment's own note, and
 * only the kind: "An announcement changed the due date · See it with Plus". No popup, no countdown, no red.
 */
export function LockedChange({ item, onOpen }: { item: Item; onOpen?: () => void }) {
  const kinds = item.lockedChange?.kinds ?? [];
  useEffect(() => {
    if (kinds.length) countSeen(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, kinds.join()]);
  if (!kinds.length) return null;
  return (
    <p className="hint locked-change" data-kinds={kinds.join(' ')}>
      {lockedLine(kinds)} ·{' '}
      <a
        href="#/you?s=plan&to=plus"
        onClick={() => {
          bump('locked:click');
          onOpen?.();
        }}
      >
        See it with Plus
      </a>
    </p>
  );
}
