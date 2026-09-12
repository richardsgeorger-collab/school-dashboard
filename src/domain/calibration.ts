import { courseShortName } from './labels';
import { TYPE_LABELS, type Course, type Item, type ItemType, type TimingEntry } from './types';

/** How many finished items with a real time it takes before their average replaces the table estimate. */
export const MIN_SAMPLES = 3;

export interface ActualStat {
  n: number;
  mean: number;
}
export type Stats = Map<string, ActualStat>;

export const statKey = (courseId: string, type: ItemType): string => `${courseId}|${type}`;

/** Average real minutes per class and item type, from items the student timed, plus the ledger for items since deleted. */
export function actualStats(items: Item[], ledger: TimingEntry[] = []): Stats {
  const sums = new Map<string, { n: number; total: number }>();
  const seen = new Set<string>();
  const add = (courseId: string, type: ItemType, minutes: number) => {
    const k = statKey(courseId, type);
    const s = sums.get(k) ?? { n: 0, total: 0 };
    s.n++;
    s.total += minutes;
    sums.set(k, s);
  };
  for (const i of items) {
    if (i.status !== 'done' || !i.actualMinutes || i.actualMinutes <= 0) continue;
    seen.add(i.id);
    add(i.courseId, i.type, i.actualMinutes);
  }
  const live = new Set(items.map((i) => i.id));
  for (const t of ledger) {
    if (seen.has(t.itemId) || live.has(t.itemId) || !(t.minutes > 0)) continue;
    add(t.courseId, t.type, t.minutes);
  }
  const out: Stats = new Map();
  for (const [k, s] of sums) out.set(k, { n: s.n, mean: s.total / s.n });
  return out;
}

export interface Calibrated {
  minutes: number;
  basis: 'actual' | 'estimate' | 'override';
  /** "your average for chem homework", or "estimate" */
  label: string;
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const plural = (w: string) => (w === 'homework' || w === 'other' ? w : w === 'quiz' ? 'quizzes' : w.endsWith('s') ? w : `${w}s`);

/** The minutes the planner should use for an item, and how to say where the number came from. */
export function calibrate(item: Item, stats: Stats, course: Course | undefined): Calibrated {
  if (item.estimateOverridden) return { minutes: item.estimatedMinutes, basis: 'override', label: 'your estimate' };
  const s = stats.get(statKey(item.courseId, item.type));
  if (s && s.n >= MIN_SAMPLES) {
    const what = TYPE_LABELS[item.type].toLowerCase();
    const cls = course ? courseShortName(course.code).toLowerCase() : 'this class';
    return { minutes: round5(s.mean), basis: 'actual', label: `your average for ${cls} ${plural(what)}` };
  }
  return { minutes: item.estimatedMinutes, basis: 'estimate', label: 'estimate' };
}

/** Items with calibrated minutes in place, for the scheduler. Nothing is written back. */
export function withCalibration<T extends Item>(items: T[], stats: Stats): T[] {
  if (stats.size === 0) return items;
  return items.map((i) => {
    const s = i.estimateOverridden ? null : stats.get(statKey(i.courseId, i.type));
    return s && s.n >= MIN_SAMPLES ? { ...i, estimatedMinutes: round5(s.mean) } : i;
  });
}

/** Tap choices for "how long did that take?" */
export const TIME_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
];
