import { normTitle } from '../halo/normalize';
import { titleSimilarity } from '../record/match';
import { dateOf, diffDays } from './dates';
import type { Item } from './types';

export interface DuplicatePair {
  keep: Item;
  drop: Item;
  /** Why these look like the same thing. */
  reason: string;
}

const NEAR = 0.6;
const DAYS = 3;

/** Which of two look-alikes survives: the one Halo or the calendar links to, else the older record. */
function pick(a: Item, b: Item): [Item, Item] {
  const linked = (i: Item) => (i.haloId ? 2 : 0) + (i.icsUid ? 1 : 0);
  if (linked(a) !== linked(b)) return linked(a) > linked(b) ? [a, b] : [b, a];
  if (a.status === 'done' && b.status !== 'done') return [a, b];
  if (b.status === 'done' && a.status !== 'done') return [b, a];
  return a.updatedAt <= b.updatedAt ? [a, b] : [b, a];
}

/** Open pairs in the same class with near-identical titles due within a few days of each other. */
export function findDuplicates(items: Item[], tz: string): DuplicatePair[] {
  const out: DuplicatePair[] = [];
  const seen = new Set<string>();
  const live = items.filter((i) => i.type !== 'participation');
  for (let x = 0; x < live.length; x++) {
    for (let y = x + 1; y < live.length; y++) {
      const a = live[x];
      const b = live[y];
      if (a.courseId !== b.courseId || seen.has(a.id) || seen.has(b.id)) continue;
      if (a.status === 'done' && b.status === 'done') continue;
      if (/not a duplicate of/i.test(a.notes) || /not a duplicate of/i.test(b.notes)) continue;
      const days = Math.abs(diffDays(dateOf(a.dueAt, tz), dateOf(b.dueAt, tz)));
      if (days > DAYS) continue;
      const same = normTitle(a.title) === normTitle(b.title);
      const sim = titleSimilarity(a.title, b.title);
      if (!same && sim < NEAR) continue;
      const [keep, drop] = pick(a, b);
      out.push({ keep, drop, reason: same ? `Same title, due ${days === 0 ? 'the same day' : `${days} day${days === 1 ? '' : 's'} apart`}.` : `Titles nearly match, due ${days === 0 ? 'the same day' : `${days} day${days === 1 ? '' : 's'} apart`}.` });
      seen.add(a.id);
      seen.add(b.id);
    }
  }
  return out;
}

/** One item from two: the kept record plus anything only the other had. */
export function merged(pair: DuplicatePair): Item {
  const { keep, drop } = pair;
  return {
    ...keep,
    notes: [keep.notes, drop.notes].filter(Boolean).join('\n'),
    status: keep.status === 'done' || drop.status === 'done' ? 'done' : keep.status === 'in_progress' || drop.status === 'in_progress' ? 'in_progress' : keep.status,
    completedAt: keep.completedAt ?? drop.completedAt,
    score: keep.score ?? drop.score,
    scoreSource: keep.score !== null ? keep.scoreSource : drop.scoreSource,
    haloId: keep.haloId ?? drop.haloId,
    icsUid: keep.icsUid ?? drop.icsUid,
    url: keep.url ?? drop.url,
    blocks: [...new Set([...(keep.blocks ?? []), ...(drop.blocks ?? [])])].filter((id) => id !== keep.id && id !== drop.id),
    haloLate: keep.haloLate ?? drop.haloLate,
    actualMinutes: keep.actualMinutes ?? drop.actualMinutes,
    updatedAt: new Date().toISOString(),
  };
}
