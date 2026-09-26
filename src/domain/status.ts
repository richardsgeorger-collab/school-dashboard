import { dateOf } from './dates';
import type { DateStr, Item } from './types';

/**
 * One meaning per colour. Red is late or broken. Amber is due within a day and not started. Everything else is
 * grey, whatever the planner thinks about risk: a start window opening or a deadline in three days is information
 * for the meta line, never a colour. Every pill, chip and row reads its tone from here.
 */
export type Tone = 'late' | 'soon' | null;

const DAY_MS = 24 * 60 * 60 * 1000;

export function itemTone(item: Pick<Item, 'dueAt' | 'status' | 'haloLate'>, now: string): Tone {
  if (item.status === 'done') return null;
  const due = new Date(item.dueAt).getTime();
  const at = new Date(now).getTime();
  if (item.haloLate || due < at) return 'late';
  if (due - at <= DAY_MS && item.status === 'todo') return 'soon';
  return null;
}

/** The word on the pill. Only for a tone: nothing else earns a pill. */
export function toneLabel(tone: Tone, item: Pick<Item, 'dueAt'>, today: DateStr, tz: string): string | null {
  if (tone === 'late') return 'Late';
  if (tone === 'soon') return dateOf(item.dueAt, tz) === today ? 'Due today' : 'Due tomorrow';
  return null;
}
