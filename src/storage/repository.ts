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
    // Only when the content differs from the account's (key order and the connection details never count).
    pushSettings: settingsContent(settings) !== settingsContent(remoteSettings),
  };
}

const later = (a: string | null | undefined, b: string | null | undefined): string | null | undefined => (!a ? b : !b ? a : a > b ? a : b);

/** Keys merged by their own rules, never by stamp. */
const SPECIAL = new Set(['stamps', 'updatedAt', 'lastPull', 'haloPulls', 'syncCount', 'ratePromptAt', 'supabaseUrl', 'supabaseAnonKey']);

/** Settings as content: keys sorted at every level, the connection details and the stamp left out. */
export function settingsContent(s: Settings): string {
  const sort = (v: unknown): unknown => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v);
  const { updatedAt: _u, supabaseUrl: _s, supabaseAnonKey: _k, ...rest } = s as Settings & Record<string, unknown>;
  return JSON.stringify(sort(rest));
}

/**
 * Settings, merged key by key (George, 2026-10-12). They used to travel as one blob, newest-written wins: a phone holding
 * a ten-day-old copy changed one small setting on open, so its whole old copy won and went to the account, "last synced
 * Oct 1" and all. Now each key carries the time it was last changed (`stamps`, written by the store whenever a key
 * changes): the newer change wins per key; a key neither copy has stamped keeps the account's (remote) value; a key one
 * copy lacks is kept from the other. What Halo said (the last sync, each class's pull stamps) only moves forward.
 */
export function mergeSettings(local: Settings, remote: Settings): Settings {
  const ls = local.stamps ?? {};
  const rs = remote.stamps ?? {};
  const L = local as Settings & Record<string, unknown>;
  const R = remote as Settings & Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const stamps: Record<string, string> = {};
  for (const k of new Set([...Object.keys(L), ...Object.keys(R)])) {
    if (SPECIAL.has(k)) continue;
    const inL = L[k] !== undefined;
    const inR = R[k] !== undefined;
    const lt = ls[k] ?? '';
    const rt = rs[k] ?? '';
    out[k] = inL && !inR ? L[k] : !inL && inR ? R[k] : lt > rt ? L[k] : R[k];
    const t = lt > rt ? lt : rt;
    if (t) stamps[k] = t;
  }
  const merged = out as unknown as Settings;
  if (local.supabaseUrl !== undefined) merged.supabaseUrl = local.supabaseUrl;
  if (local.supabaseAnonKey !== undefined) merged.supabaseAnonKey = local.supabaseAnonKey;
  const lp = [local.lastPull, remote.lastPull].filter(Boolean).sort((a, b) => (a!.at < b!.at ? 1 : -1))[0];
  if (lp) merged.lastPull = lp;
  const pulls: Record<string, HaloPull> = {};
  for (const src of [remote.haloPulls ?? {}, local.haloPulls ?? {}])
    for (const [course, p] of Object.entries(src)) {
      const had = pulls[course] ?? {};
      const next: HaloPull = { ...had };
      for (const k of Object.keys(p) as (keyof HaloPull)[]) next[k] = later(had[k], p[k]) ?? null;
      pulls[course] = next;
    }
  if (Object.keys(pulls).length) merged.haloPulls = pulls;
  const count = Math.max(local.syncCount ?? 0, remote.syncCount ?? 0);
  if (count) merged.syncCount = count;
  // Answered on any device is answered.
  const rated = later(local.ratePromptAt ?? undefined, remote.ratePromptAt ?? undefined);
  if (rated) merged.ratePromptAt = rated;
  if (Object.keys(stamps).length) merged.stamps = stamps;
  merged.updatedAt = later(local.updatedAt, remote.updatedAt) ?? remote.updatedAt;
  return merged;
}
