import type { AppData, Course, Item, Settings } from '../domain/types';

/** What a remote store hands back on load. Tombstones let deletions win over stale local rows. */
export interface RemoteData extends Partial<AppData> {
  deletedItemIds?: Record<string, string>;
  deletedCourseIds?: Record<string, string>;
}

/** Remote persistence (Supabase). Every call may reject; the store queues and retries. */
export interface Repository {
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

/** Last-write-wins merge of the local cache with a remote snapshot. */
export function mergeData(local: AppData, remote: RemoteData): MergeResult {
  const courses = mergeRows(local.courses, remote.courses, remote.deletedCourseIds);
  const items = mergeRows(local.items, remote.items, remote.deletedItemIds);
  const remoteSettings = remote.settings;
  const useRemoteSettings = !!remoteSettings && remoteSettings.updatedAt > local.settings.updatedAt;
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
