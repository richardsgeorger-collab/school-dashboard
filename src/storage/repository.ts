import type { AppData, Course, HaloPull, Item, Settings } from '../domain/types';

/** What a remote store hands back on load. Tombstones let deletions win over stale local rows. */
export interface RemoteData extends Partial<AppData> {
  deletedItemIds?: Record<string, string>;
  deletedCourseIds?: Record<string, string>;
}

/** Remote persistence (Supabase). Every call may reject; the store queues and retries. */
export interface Repository {
  /** The signed-in account this repository reads and writes, when there is one. */
  readonly accountId?: string;
  load(): Promise<RemoteData>;
  saveCourses(courses: Course[]): Promise<void>;
  saveItems(items: Item[]): Promise<void>;
  deleteItem(id: string, deletedAt: string): Promise<void>;
  deleteCourse(id: string, deletedAt: string): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /** The account settings' last-written stamp, one small read (2026-10-12). */
  settingsStamp?(): Promise<string | null>;
}

export interface MergeResult {
  merged: AppData;
  pushCourses: Course[];
  pushItems: Item[];
  pushSettings: boolean;
}

function mergeRows<T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[] | undefined,
  tombstones: Record<string, string> | undefined,
): { merged: T[]; push: T[] } {
  const remoteById = new Map((remote ?? []).map((r) => [r.id, r]));
  const merged: T[] = [];
  const push: T[] = [];
  const seen = new Set<string>();

  for (const row of local) {
    seen.add(row.id);
    const deletedAt = tombstones?.[row.id];
    if (deletedAt && deletedAt > row.updatedAt) continue;
    const other = remoteById.get(row.id);
    if (other && other.updatedAt >= row.updatedAt) {
      merged.push(other);
    } else {
      merged.push(row);
      push.push(row);
    }
  }
  for (const row of remoteById.values()) {
    if (!seen.has(row.id)) merged.push(row);
  }
  return { merged, push };
}

/**
 * Last-write-wins merge of the local cache with a remote snapshot. On a device's first load of an account with nothing
 * of its own yet (`preferRemoteSettings`), the account's settings win whatever their stamp: the device stamped its
 * defaults a moment earlier (onboarding starting on the first render), and newer-wins then replaced a student's saved
 * settings with a fresh device's defaults, onboarding and sync history included (2026-09-30).
 */
export function mergeData(local: AppData, remote: RemoteData, opts: { preferRemoteSettings?: boolean } = {}): MergeResult {
  const courses = mergeRows(local.courses, remote.courses, remote.deletedCourseIds);
  const items = mergeRows(local.items, remote.items, remote.deletedItemIds);
  const remoteSettings = remote.settings;
  if (!remoteSettings) return { merged: { courses: courses.merged, items: items.merged, settings: local.settings }, pushCourses: courses.push, pushItems: items.push, pushSettings: true };
  const settings = opts.preferRemoteSettings ? remoteSettings : mergeSettings(local.settings, remoteSettings);
  return {
    merged: { courses: courses.merged, items: items.merged, settings },
    pushCourses: courses.push,
    pushItems: items.push,
    pushSettings: settings.updatedAt > remoteSettings.updatedAt || JSON.stringify({ ...settings, updatedAt: '' }) !== JSON.stringify({ ...remoteSettings, updatedAt: '' }),
  };
}

const later = (a: string | null | undefined, b: string | null | undefined): string | null | undefined => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Settings, merged key by key (George, 2026-10-12). They used to travel as one blob, newest-written wins: a phone holding
 * a ten-day-old copy changed one small setting on open, so its whole old copy won and went to the account, "last synced
 * Oct 1" and all, and every other device took it from there; keys the old copy never had (reminders, the extension
 * setup) were lost. Now: the newer copy wins per key, a key one copy lacks is kept from the other, and what Halo said
 * (the last sync, each class's pull stamps) only ever moves forward, whichever device wrote last.
 */
export function mergeSettings(local: Settings, remote: Settings): Settings {
  const localNewer = local.updatedAt > remote.updatedAt;
  const [winner, loser] = localNewer ? [local, remote] : [remote, local];
  const out: Settings = { ...loser, ...winner };
  const lp = [local.lastPull, remote.lastPull].filter(Boolean).sort((a, b) => (a!.at < b!.at ? 1 : -1))[0];
  if (lp) out.lastPull = lp;
  else delete out.lastPull;
  const pulls: Record<string, HaloPull> = {};
  for (const src of [remote.haloPulls ?? {}, local.haloPulls ?? {}])
    for (const [course, p] of Object.entries(src)) {
      const had = pulls[course] ?? {};
      const next: HaloPull = { ...had };
      for (const k of Object.keys(p) as (keyof HaloPull)[]) next[k] = later(had[k], p[k]) ?? null;
      pulls[course] = next;
    }
  if (Object.keys(pulls).length) out.haloPulls = pulls;
  out.updatedAt = later(local.updatedAt, remote.updatedAt) ?? winner.updatedAt;
  return out;
}
