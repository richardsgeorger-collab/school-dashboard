import { dateOf } from './dates';
import { isNoise } from './requirements';
import type { Item } from './types';

/**
 * "Since you last looked" on Now (George, 2026-10-05): what really changed in the planner between two visits, whatever
 * brought it (a sync, the extension, the announcement reader). A compact picture of every item is kept on this device
 * when Now is left; the next visit compares against it. Only real changes, nothing when nothing changed, nothing on
 * the first visit (there is nothing to compare with).
 */
export interface Snapshot {
  v: 1;
  at: string;
  /** Item id → [due day, score, requirement ids]. */
  items: Record<string, [string, number | null, string[]]>;
}

export interface Change {
  kind: 'new' | 'moved' | 'graded' | 'asks';
  item: Item;
  /** "Oct 6 → Oct 9", "47/50", "2 things from an announcement". */
  detail: string;
}

export function snapshotOf(items: Item[], tz: string, at: string): Snapshot {
  const out: Snapshot = { v: 1, at, items: {} };
  for (const i of items) out.items[i.id] = [dateOf(i.dueAt, tz), i.score, (i.requirements ?? []).map((r) => r.id)];
  return out;
}

const live = (i: Item) => !isNoise(i);

export function changesSince(before: Snapshot | null, items: Item[], tz: string, fmtDay: (d: string) => string): Change[] {
  if (!before || before.v !== 1) return [];
  const out: Change[] = [];
  for (const i of items) {
    if (!live(i)) continue;
    const was = before.items[i.id];
    // New work arrives from Halo or an announcement; something the student added by hand is not news to them.
    if (!was) {
      if (i.source === 'halo' || i.origin?.kind === 'announcement') out.push({ kind: 'new', item: i, detail: `due ${fmtDay(dateOf(i.dueAt, tz))}` });
      continue;
    }
    const [day, score, reqs] = was;
    const now = dateOf(i.dueAt, tz);
    if (now !== day && (i.source === 'halo' || !!i.dateChange)) out.push({ kind: 'moved', item: i, detail: `${fmtDay(day)} → ${fmtDay(now)}` });
    // A grade from Halo (an override typed here is the student's own doing).
    if (i.score !== null && i.score !== score && i.scoreSource !== 'manual') out.push({ kind: 'graded', item: i, detail: `${+i.score.toFixed(1)}/${i.points}` });
    const added = (i.requirements ?? []).filter((r) => !reqs.includes(r.id) && r.source?.kind === 'announcement' && !r.done);
    if (added.length && i.status !== 'done') out.push({ kind: 'asks', item: i, detail: added.length === 1 ? added[0].text : `${added.length} things from announcements` });
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 new assignments, 1 due date moved, 1 grade posted, 3 asks from announcements". Null when nothing changed. */
export function changesLine(changes: Change[]): string | null {
  if (!changes.length) return null;
  const n = (k: Change['kind']) => changes.filter((c) => c.kind === k).length;
  const parts = [
    n('new') ? plural(n('new'), 'new assignment', 'new assignments') : '',
    n('moved') ? plural(n('moved'), 'due date moved', 'due dates moved') : '',
    n('graded') ? plural(n('graded'), 'new grade', 'new grades') : '',
    n('asks') ? plural(n('asks'), 'new ask from an announcement', 'new asks from announcements') : '',
  ].filter(Boolean);
  return parts.join(', ');
}
