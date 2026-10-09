import type { DateStr, Item } from './types';

/**
 * "Not now" on the hero (George, 2026-10-08): a quick skip, not a snooze. The next thing takes the card at once and the
 * skipped one waits in a small row under it, one tap from coming back. It comes back on its own when something gets
 * finished (the student cleared a thing; the skipped one is the next candidate again) or when nothing else is left.
 * Skipping the same thing three times in a day says more than "later": it goes to the end of Then for the day, out of
 * the hero and out of the row, with no wording. Something due within six hours, or overdue, still comes back after
 * the next finished thing whatever its count. Everything resets with the day.
 */
export interface SkipState {
  day: DateStr;
  /** Out of the hero right now, in the order skipped. */
  ids: string[];
  /** Times each was skipped today. */
  counts: Record<string, number>;
}

export const BENCH_AT = 3;
export const URGENT_MS = 6 * 3_600_000;

export const emptySkips = (day: DateStr): SkipState => ({ day, ids: [], counts: {} });

/** Yesterday's skips are nobody's business today. */
export const forDay = (s: SkipState | null | undefined, day: DateStr): SkipState => (s && s.day === day ? s : emptySkips(day));

export function skip(s: SkipState, id: string): SkipState {
  return { ...s, ids: s.ids.includes(id) ? s.ids : [...s.ids, id], counts: { ...s.counts, [id]: (s.counts[id] ?? 0) + 1 } };
}

/** Brought back by hand: it is the hero again. Today's count stays, so skip, back, skip, back, skip is three. */
export function unskip(s: SkipState, id: string): SkipState {
  return { ...s, ids: s.ids.filter((x) => x !== id) };
}

export const benched = (s: SkipState, id: string): boolean => (s.counts[id] ?? 0) >= BENCH_AT;

/** Due within six hours, or already past due. */
export const urgent = (item: Pick<Item, 'dueAt'>, nowMs: number): boolean => Date.parse(item.dueAt) - nowMs < URGENT_MS;

/**
 * Something was finished: the skipped come back, except the benched ones, which stay down for the day unless they
 * are urgent. Their counts are kept, so a thing skipped twice and brought back by a check-off is one skip from the
 * bench.
 */
export function afterDone(s: SkipState, items: Item[], nowMs: number): SkipState {
  const byId = new Map(items.map((i) => [i.id, i]));
  return { ...s, ids: s.ids.filter((id) => benched(s, id) && !urgent(byId.get(id) ?? { dueAt: '' }, nowMs)) };
}

export interface Arranged {
  /** The hero and Then, in rank order, with the skipped ones taken out. */
  ahead: Item[];
  /** The small row under the hero: skipped, not benched, in the order skipped. */
  row: Item[];
  /** Skipped three times today: the end of Then, in rank order. */
  bench: Item[];
}

/** Lays out the ranked list around today's skips. When nothing else is left, the skipped come back in rank order. */
export function arrange(ranked: Item[], s: SkipState): Arranged {
  const skipped = new Set(s.ids);
  const rest = ranked.filter((i) => !skipped.has(i.id));
  const bench = ranked.filter((i) => skipped.has(i.id) && benched(s, i.id));
  const row = s.ids.map((id) => ranked.find((i) => i.id === id)).filter((i): i is Item => !!i && !benched(s, i.id));
  if (rest.length === 0 && row.length > 0) return { ahead: ranked.filter((i) => skipped.has(i.id) && !benched(s, i.id)), row: [], bench };
  if (rest.length === 0) return { ahead: bench, row: [], bench: [] };
  return { ahead: rest, row, bench };
}
