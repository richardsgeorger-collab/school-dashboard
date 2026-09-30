import type { AppData, Course, Item, Settings } from '../domain/types';

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
  const useRemoteSettings = !!remoteSettings && (!!opts.preferRemoteSettings || remoteSettings.updatedAt > local.settings.updatedAt);
  return {
    merged: {
      courses: courses.merged,
      items: items.merged,
      settings: useRemoteSettings ? remoteSettings : local.settings,
    },
    pushCourses: courses.push,
    pushItems: items.push,
    pushSettings: !useRemoteSettings,
  };
}
