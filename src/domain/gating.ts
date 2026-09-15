import { dateOf, fmtDate } from './dates';
import type { Item } from './types';

/** The open items this one unlocks, soonest first. */
export function unlocks(item: Item, items: Item[]): Item[] {
  if (!item.blocks?.length) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  return item.blocks
    .map((id) => byId.get(id))
    .filter((i): i is Item => !!i && i.status !== 'done')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Points that decide how big a task is: its own, or everything it gates, whichever is more. */
export function effectivePoints(item: Item, items: Item[]): number {
  const gated = unlocks(item, items);
  return Math.max(item.points, gated.reduce((n, i) => n + i.points, 0));
}

/** "Unlocks Chem Presentation (Sep 27) and Chem Essay (Oct 9)." or null. */
export function gatingLine(item: Item, items: Item[], tz: string): string | null {
  const gated = unlocks(item, items);
  if (gated.length === 0) return null;
  const names = gated.slice(0, 3).map((i) => `${i.label} (${fmtDate(dateOf(i.dueAt, tz), 'short')})`);
  const more = gated.length > 3 ? ` and ${gated.length - 3} more` : '';
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  return `Unlocks ${list}${more}.`;
}

/** Items that gate the given one. */
export const gatedBy = (item: Item, items: Item[]): Item[] => items.filter((i) => i.status !== 'done' && i.blocks?.includes(item.id));
