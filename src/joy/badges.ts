import { addDays, dateOf, weekStart } from '../domain/dates';
import { isNoise } from '../domain/requirements';
import type { DateStr, Item } from '../domain/types';
import { isWorkDone } from './joy';

/**
 * Badges (2026-10-02), from real work: Halo's own submission time when there is one, else the check-off. Derived
 * each time, so a badge that unchecking takes back is gone.
 *   Early bird: something turned in 2+ days before it was due.
 *   No late work this week: a finished week with work due and nothing late or missed.
 *   Survived a heavy week: a finished week as heavy as Heads up warns about (5+ things or 300+ points due), all done.
 *   Clean sweep: five days where everything due that day was done on time.
 */
export type BadgeId = 'early_bird' | 'no_late_week' | 'heavy_week' | 'clean_sweep';
export const BADGES: BadgeId[] = ['early_bird', 'no_late_week', 'heavy_week', 'clean_sweep'];
export const CLEAN_SWEEP_DAYS = 5;
const HEAVY_ITEMS = 5;
const HEAVY_POINTS = 300;

export const BADGE_INFO: Record<BadgeId, { name: string; how: string }> = {
  early_bird: { name: 'Early bird', how: 'Turn something in 2 or more days before it is due' },
  no_late_week: { name: 'No late work this week', how: 'Finish a week with nothing late or missed' },
  heavy_week: { name: 'Survived a heavy week', how: `Finish every thing in a week with ${HEAVY_ITEMS}+ things or ${HEAVY_POINTS}+ points due` },
  clean_sweep: { name: 'Clean sweep', how: `Clear everything due in a day, on time, ${CLEAN_SWEEP_DAYS} times` },
};

export interface BadgeState {
  earnedAt: string | null;
  /** How many times (weeks, days, items); the progress toward Clean sweep before it is earned. */
  count: number;
}

const finishedAt = (i: Item): string | null => (isWorkDone(i) ? (i.halo?.submittedAt ?? (i.status === 'done' ? i.completedAt : null)) : null);
const onTime = (i: Item): boolean => {
  const at = finishedAt(i);
  return !!at && Date.parse(at) <= Date.parse(i.dueAt) && !i.haloLate;
};

export function computeBadges(items: Item[], today: DateStr, tz: string, weekStartsOn: 0 | 1): Record<BadgeId, BadgeState> {
  const work = items.filter((i) => i.type !== 'participation' && !isNoise(i) && i.dueAt && !Number.isNaN(Date.parse(i.dueAt)));

  const early = work
    .map((i) => ({ i, at: finishedAt(i) }))
    .filter((x) => x.at && Date.parse(x.i.dueAt) - Date.parse(x.at) >= 2 * 86_400_000)
    .sort((a, b) => a.at!.localeCompare(b.at!));

  const thisWeek = weekStart(today, weekStartsOn);
  const byWeek = new Map<DateStr, Item[]>();
  const byDay = new Map<DateStr, Item[]>();
  for (const i of work) {
    const d = dateOf(i.dueAt, tz);
    const wk = weekStart(d, weekStartsOn);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), i]);
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }
  const pastWeeks = [...byWeek.keys()].filter((wk) => wk < thisWeek).sort();
  const cleanWeeks = pastWeeks.filter((wk) => byWeek.get(wk)!.every(onTime));
  const heavyWeeks = pastWeeks.filter((wk) => {
    const w = byWeek.get(wk)!;
    return (w.length >= HEAVY_ITEMS || w.reduce((n, i) => n + i.points, 0) >= HEAVY_POINTS) && w.every(isWorkDone);
  });
  const sweptDays = [...byDay.keys()].filter((d) => d <= today && byDay.get(d)!.every(onTime)).sort();

  return {
    early_bird: { earnedAt: early[0]?.at ?? null, count: early.length },
    no_late_week: { earnedAt: cleanWeeks[0] ? addDays(cleanWeeks[0], 6) : null, count: cleanWeeks.length },
    heavy_week: { earnedAt: heavyWeeks[0] ? addDays(heavyWeeks[0], 6) : null, count: heavyWeeks.length },
    clean_sweep: { earnedAt: sweptDays.length >= CLEAN_SWEEP_DAYS ? sweptDays[CLEAN_SWEEP_DAYS - 1] : null, count: sweptDays.length },
  };
}
