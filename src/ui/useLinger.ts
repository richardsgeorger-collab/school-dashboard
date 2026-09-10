import { useEffect, useRef, useState } from 'react';
import type { Item } from '../domain/types';

const LINGER_MS = 1600;

/**
 * Keep items that just left a filtered list (because they were completed) visible a little
 * longer, in their original spot, so the check-off feedback has somewhere to play.
 * Computed synchronously during render so the row never unmounts.
 */
export function useLinger(list: Item[], all: Item[]): Item[] {
  const positions = useRef(new Map<string, number>());
  const linger = useRef(new Map<string, number>());
  const [, tick] = useState(0);
  const listIds = new Set(list.map((i) => i.id));
  const byId = new Map(all.map((i) => [i.id, i]));
  const now = Date.now();

  for (const [id, t] of linger.current) {
    if (now - t > LINGER_MS || listIds.has(id) || byId.get(id)?.status !== 'done') {
      linger.current.delete(id);
      // Forget its slot too, or it would be re-added on the next line and linger forever.
      if (!listIds.has(id)) positions.current.delete(id);
    }
  }
  for (const id of positions.current.keys()) {
    if (!listIds.has(id) && byId.get(id)?.status === 'done' && !linger.current.has(id)) linger.current.set(id, now);
  }
  list.forEach((i, idx) => positions.current.set(i.id, idx));
  for (const id of [...positions.current.keys()]) {
    if (!listIds.has(id) && !linger.current.has(id)) positions.current.delete(id);
  }

  const pending = linger.current.size;
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => tick((n) => n + 1), LINGER_MS + 20);
    return () => clearTimeout(t);
  }, [pending, now]);

  if (linger.current.size === 0) return list;
  const merged = [...list];
  for (const id of linger.current.keys()) {
    const it = byId.get(id);
    if (!it) continue;
    const at = positions.current.get(id) ?? merged.length;
    merged.splice(Math.min(at, merged.length), 0, it);
  }
  return merged;
}
