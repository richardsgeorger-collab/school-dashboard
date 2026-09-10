import { addDays, dateOf, weekStart } from './dates';
import { dayCapacity } from './schedule';
import type { Award, DateStr, Item, Settings } from './types';

export type BadgeId = 'early_bird' | 'survived_week' | 'clean_sweep';
export const EARLY_BIRD_TARGET = 5;
const XP_PER_LEVEL_UNIT = 60;

export const BADGE_INFO: Record<BadgeId, { name: string; how: string; glyph: string }> = {
  early_bird: { name: 'Early Bird', how: `Finish ${EARLY_BIRD_TARGET} items on or before their start-by date`, glyph: '🌅' },
  survived_week: { name: 'Survived the Week', how: 'Clear a week whose estimated work met your full capacity, all on time', glyph: '🏔️' },
  clean_sweep: { name: 'Clean Sweep', how: 'Finish everything one class had due in a week, on time', glyph: '🧹' },
};

export interface Recap {
  weekStart: DateStr;
  weekEnd: DateStr;
  points: number;
  completed: number;
  early: number;
  late: number;
  missed: Item[];
  clean: boolean;
  dueCount: number;
}

export interface Progress {
  xp: number;
  level: number;
  levelFloor: number;
  levelCeil: number;
  dailyStreak: number;
  weeklyCleanStreak: number;
  currentWeekClean: boolean;
  earlyCount: number;
  badges: Record<BadgeId, string | null>;
  lastWeek: Recap;
}

const ms = (iso: string) => new Date(iso).getTime();

/** 1.5 on or before the start-by day, 1 by the due time, 0.5 after. */
export function timingMultiplier(completedAt: string, dueAt: string, startBy: DateStr, tz: string): 1.5 | 1 | 0.5 {
  if (dateOf(completedAt, tz) <= startBy) return 1.5;
  if (ms(completedAt) <= ms(dueAt)) return 1;
  return 0.5;
}

export function scoreFactorFor(score: number | null, points: number): number | null {
  return score !== null && points > 0 ? Math.max(0, score / points) : null;
}

export function awardValue(a: Award): number {
  return Math.round(a.base * a.multiplier * (a.scoreFactor ?? 1));
}

/** Mark done. The award is created once and never recomputed, so undo/redo cannot farm points. */
export function completeItem(item: Item, startBy: DateStr, now: string, tz: string): Item {
  const award: Award = item.award ?? {
    base: item.points,
    multiplier: timingMultiplier(now, item.dueAt, startBy, tz),
    earnedAt: now,
    scoreFactor: scoreFactorFor(item.score, item.points),
  };
  return { ...item, status: 'done', completedAt: now, award };
}

export function reopenItem(item: Item): Item {
  return { ...item, status: 'todo', completedAt: null };
}

/** Entering a score scales the locked award by score over points. */
export function withScore(item: Item, score: number | null): Item {
  return { ...item, score, award: item.award ? { ...item.award, scoreFactor: scoreFactorFor(score, item.points) } : item.award };
}

/** Value an item would earn (or has earned): used for the check-off animation. */
export function previewAward(item: Item, startBy: DateStr, now: string, tz: string): number {
  return awardValue(item.award ?? completeItem(item, startBy, now, tz).award!);
}

export function levelFor(xp: number): { level: number; floor: number; ceil: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / XP_PER_LEVEL_UNIT)) + 1;
  return { level, floor: XP_PER_LEVEL_UNIT * (level - 1) ** 2, ceil: XP_PER_LEVEL_UNIT * level ** 2 };
}

const onTime = (i: Item) => i.status === 'done' && i.completedAt !== null && ms(i.completedAt) <= ms(i.dueAt);
const isLate = (i: Item) => i.status === 'done' && i.completedAt !== null && ms(i.completedAt) > ms(i.dueAt);

export function computeProgress(items: Item[], settings: Settings, today: DateStr, now: string = new Date().toISOString()): Progress {
  const tz = settings.timezone;
  const ws = settings.weekStartsOn;
  const done = items.filter((i) => i.status === 'done' && i.award);

  const xp = done.reduce((a, i) => a + awardValue(i.award!), 0);
  const lvl = levelFor(xp);

  // Daily streak
  const days = new Set(done.filter((i) => i.completedAt).map((i) => dateOf(i.completedAt!, tz)));
  const yesterday = addDays(today, -1);
  let dailyStreak = 0;
  for (let d = days.has(today) ? today : days.has(yesterday) ? yesterday : null; d && days.has(d); d = addDays(d, -1)) dailyStreak += 1;

  // Items by the week they are due
  const thisWeekStart = weekStart(today, ws);
  const byWeek = new Map<DateStr, Item[]>();
  for (const i of items) {
    const wk = weekStart(dateOf(i.dueAt, tz), ws);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), i]);
  }
  const completedWeeks = [...byWeek.keys()].filter((wk) => wk < thisWeekStart).sort();

  let weeklyCleanStreak = 0;
  for (const wk of [...completedWeeks].reverse()) {
    if (byWeek.get(wk)!.every(onTime)) weeklyCleanStreak += 1;
    else break;
  }
  const thisWeek = byWeek.get(thisWeekStart) ?? [];
  const nowMs = ms(now);
  const currentWeekClean = !thisWeek.some((i) => isLate(i) || (i.status !== 'done' && ms(i.dueAt) < nowMs));

  // Badges
  const early = done.filter((i) => i.award!.multiplier === 1.5).sort((a, b) => a.award!.earnedAt.localeCompare(b.award!.earnedAt));
  const badges: Record<BadgeId, string | null> = { early_bird: null, survived_week: null, clean_sweep: null };
  if (early.length >= EARLY_BIRD_TARGET) badges.early_bird = early[EARLY_BIRD_TARGET - 1].award!.earnedAt;
  for (const wk of completedWeeks) {
    const weekItems = byWeek.get(wk)!;
    const weekEnd = addDays(wk, 6);
    if (!badges.survived_week) {
      const cap = Array.from({ length: 7 }, (_, k) => dayCapacity(settings, addDays(wk, k))).reduce((a, b) => a + b, 0);
      const est = weekItems.reduce((a, i) => a + i.estimatedMinutes, 0);
      if (est >= cap && weekItems.every(onTime)) badges.survived_week = weekEnd;
    }
    if (!badges.clean_sweep) {
      const byCourse = new Map<string, Item[]>();
      for (const i of weekItems) byCourse.set(i.courseId, [...(byCourse.get(i.courseId) ?? []), i]);
      if ([...byCourse.values()].some((g) => g.length >= 2 && g.every(onTime))) badges.clean_sweep = weekEnd;
    }
  }

  // Last week's recap
  const lastStart = addDays(thisWeekStart, -7);
  const lastEnd = addDays(thisWeekStart, -1);
  const due = byWeek.get(lastStart) ?? [];
  const earnedLastWeek = done.filter((i) => {
    const d = dateOf(i.award!.earnedAt, tz);
    return d >= lastStart && d <= lastEnd;
  });
  const lateCount = due.filter(isLate).length;
  const missed = due.filter((i) => i.status !== 'done');
  const lastWeek: Recap = {
    weekStart: lastStart,
    weekEnd: lastEnd,
    points: earnedLastWeek.reduce((a, i) => a + awardValue(i.award!), 0),
    completed: earnedLastWeek.length,
    early: earnedLastWeek.filter((i) => i.award!.multiplier === 1.5).length,
    late: lateCount,
    missed,
    clean: lateCount === 0 && missed.length === 0,
    dueCount: due.length,
  };

  return {
    xp,
    level: lvl.level,
    levelFloor: lvl.floor,
    levelCeil: lvl.ceil,
    dailyStreak,
    weeklyCleanStreak,
    currentWeekClean,
    earlyCount: early.length,
    badges,
    lastWeek,
  };
}
