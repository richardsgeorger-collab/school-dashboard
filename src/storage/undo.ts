import type { Item } from '../domain/types';

/** One sync's worth of changes, kept until the next sync so the whole batch can be put back. */
export interface UndoBatch {
  at: string;
  label: string;
  /** Items as they were before the batch touched them (changed or removed). */
  before: Item[];
  /** Ids the batch created. */
  added: string[];
  /** How many changes the batch made, for the button. */
  count: number;
}

const KEY = 'school-dashboard:undo';

export function loadUndo(): UndoBatch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as UndoBatch;
    return v && typeof v.at === 'string' && Array.isArray(v.before) && Array.isArray(v.added) ? v : null;
  } catch {
    return null;
  }
}
export function saveUndo(batch: UndoBatch | null): void {
  try {
    if (batch) localStorage.setItem(KEY, JSON.stringify(batch));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Build the batch from the items before and after a sync. */
export function diffBatch(label: string, beforeItems: Item[], afterItems: Item[], at = new Date().toISOString()): UndoBatch {
  const beforeById = new Map(beforeItems.map((i) => [i.id, i]));
  const afterById = new Map(afterItems.map((i) => [i.id, i]));
  const before: Item[] = [];
  const added: string[] = [];
  for (const i of afterItems) {
    const prev = beforeById.get(i.id);
    if (!prev) added.push(i.id);
    else if (prev !== i && JSON.stringify(prev) !== JSON.stringify(i)) before.push(prev);
  }
  for (const i of beforeItems) if (!afterById.has(i.id)) before.push(i);
  return { at, label, before, added, count: before.length + added.length };
}

/** The items with the batch put back: created ones dropped, changed and removed ones restored. */
export function revert(items: Item[], batch: UndoBatch): Item[] {
  const restore = new Map(batch.before.map((i) => [i.id, i]));
  const kept = items.filter((i) => !batch.added.includes(i.id)).map((i) => restore.get(i.id) ?? i);
  const present = new Set(kept.map((i) => i.id));
  return [...kept, ...batch.before.filter((i) => !present.has(i.id))];
}
