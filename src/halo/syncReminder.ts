/**
 * The sync reminder on Now (George, 2026-10-06): shown on every open while it is true, gone the moment a sync lands.
 * One at a time, never two:
 * - 'stale': the last sync is over a day old. "Last synced 2 days ago. Sync now so you don't miss anything." Red from
 *   three days.
 * - 'auto': the extension is on this computer, the plan has auto-sync, and nothing has landed in 6 hours (it runs every
 *   3 while Chrome is open, so two missed runs). "Auto-sync hasn't run since …. Open Halo once to wake it up."
 * Over a day old, 'stale' wins: its Sync now runs the extension straight away, which beats waiting for a wake-up.
 * Never synced at all is not here: that is the full-screen sheet before anything else. A plan without sync (Free)
 * gets none of this; its paused banner says it.
 */
export type SyncReminder = { kind: 'stale'; days: number; red: boolean } | { kind: 'auto'; since: string; red: boolean; paused: boolean };

const HOUR = 3_600_000;

export interface ReminderInput {
  /** The last sync that landed, by any means. Null: never (not this reminder's job). */
  lastAt: string | null;
  now: number;
  /** The plan includes Halo sync. */
  allowed: boolean;
  /** The extension is on this computer (its Halo+ script wrote its version). */
  extInstalled: boolean;
  /** The plan includes auto-sync. */
  autoPlan: boolean;
  /** The extension says its scheduled sync found Halo logged out. */
  paused: boolean;
}

export function syncReminder({ lastAt, now, allowed, extInstalled, autoPlan, paused }: ReminderInput): SyncReminder | null {
  if (!allowed || !lastAt) return null;
  const t = Date.parse(lastAt);
  if (!Number.isFinite(t)) return null;
  const age = now - t;
  const red = age >= 72 * HOUR;
  if (age > 24 * HOUR) return { kind: 'stale', days: Math.max(1, Math.floor(age / (24 * HOUR))), red };
  if (extInstalled && autoPlan && age >= 6 * HOUR) return { kind: 'auto', since: lastAt, red, paused };
  return null;
}

/** "Last synced 2 days ago." */
export const staleText = (days: number): string => `Last synced ${days === 1 ? 'a day' : `${days} days`} ago.`;
