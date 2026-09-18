import { addDays, diffDays, fmtDate } from './dates';
import { isNoise } from './requirements';
import { effectivePoints } from './gating';
import type { Schedule } from './schedule';
import type { DateStr, Item } from './types';

export interface Pileup {
  from: DateStr;
  to: DateStr;
  points: number;
  items: Item[];
  /** The biggest thing in the window and when to start it. */
  lead: Item;
  startBy: DateStr;
  line: string;
}

const WINDOW = 6;
const HORIZON = 28;
const MIN_POINTS = 300;
const MIN_ITEMS = 5;
const BIG = 100;

const kindWord = (i: Item) => (i.type === 'paper' ? 'paper' : i.type === 'exam' ? 'exam' : i.type === 'project' ? 'project' : null);

/**
 * The heaviest six-day stretch in the next three weeks, when it is heavy: 300+ points or five items, said
 * two weeks out with the start date of its biggest item. Null when nothing ahead deserves the word.
 */
export function pileupAhead(items: Item[], schedule: Schedule, today: DateStr): Pileup | null {
  const open = items.filter((i) => i.status !== 'done' && !isNoise(i));
  const day = (i: Item) => schedule.byItem[i.id]?.deadlineDay ?? i.dueAt.slice(0, 10);
  let best: Pileup | null = null;
  for (let k = 1; k <= HORIZON - WINDOW + 1; k++) {
    const from = addDays(today, k);
    const to = addDays(from, WINDOW - 1);
    const inside = open.filter((i) => day(i) >= from && day(i) <= to);
    const points = inside.reduce((n, i) => n + effectivePoints(i, items), 0);
    if (points < MIN_POINTS && inside.length < MIN_ITEMS) continue;
    if (best && (points < best.points || (points === best.points && inside.length <= best.items.length))) continue;
    const lead = [...inside].sort((a, b) => effectivePoints(b, items) - effectivePoints(a, items) || b.estimatedMinutes - a.estimatedMinutes)[0];
    const startBy = schedule.byItem[lead.id]?.startBy ?? addDays(day(lead), -3);
    const bigs = inside.filter((i) => effectivePoints(i, items) >= BIG && kindWord(i));
    const kinds = new Map<string, number>();
    for (const b of bigs) kinds.set(kindWord(b)!, (kinds.get(kindWord(b)!) ?? 0) + 1);
    const including = kinds.size ? ` including ${[...kinds.entries()].map(([w, n]) => `${n === 1 ? 'a' : n === 2 ? 'two' : n} ${w}${n === 1 ? '' : 's'}`).join(' and ')}` : '';
    const range = `${fmtDate(from, 'short')}–${fmtDate(to, 'short').replace(/^\w+ /, (m) => (from.slice(5, 7) === to.slice(5, 7) ? '' : m))}`;
    const start = diffDays(today, startBy) <= 0 ? 'now' : `by ${fmtDate(startBy, 'short')}`;
    best = { from, to, points, items: inside, lead, startBy, line: `${range} has ${points} pts across ${inside.length} items${including}. Start ${lead.label} ${start}.` };
  }
  return best;
}
