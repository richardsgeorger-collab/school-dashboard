import { diffDays } from './dates';
import { isNoise } from './requirements';
import type { Schedule } from './schedule';
import type { DateStr, Item } from './types';

export const AWAY_DAYS = 5;
const KEY = 'school-dashboard:last-seen';

export function readLastSeen(): DateStr | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
export function stampLastSeen(today: DateStr): void {
  try {
    localStorage.setItem(KEY, today);
  } catch {
    /* storage unavailable */
  }
}

/** Days since the planner was last opened on this device; 0 when unknown, so a first visit never looks like a return. */
export const awayDays = (lastSeen: DateStr | null, today: DateStr): number => (lastSeen ? Math.max(0, diffDays(lastSeen, today)) : 0);

export interface WelcomeBack {
  days: number;
  /** Open items whose deadline day passed while away. */
  missed: Item[];
  /** Items a sync added or changed while away. */
  changed: Item[];
}

/** What happened while away: what slipped past its day and what the syncs brought in. */
export function welcomeBack(items: Item[], schedule: Schedule, lastSeen: DateStr, today: DateStr): WelcomeBack {
  const days = awayDays(lastSeen, today);
  const missed = items
    .filter((i) => i.status !== 'done' && !isNoise(i))
    .filter((i) => {
      const d = schedule.byItem[i.id]?.deadlineDay;
      return d !== undefined && d >= lastSeen && d < today;
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const since = `${lastSeen}T00:00:00`;
  const changed = items.filter((i) => (i.source === 'halo' || i.source === 'ics') && i.updatedAt >= since && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { days, missed, changed };
}
