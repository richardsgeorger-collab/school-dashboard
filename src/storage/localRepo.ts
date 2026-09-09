import type { AppData } from '../domain/types';

const DATA_KEY = 'school-dashboard:v1';
const PENDING_KEY = 'school-dashboard:pending';

export type PendingOp =
  | { kind: 'items'; ids: string[] }
  | { kind: 'courses'; ids: string[] }
  | { kind: 'deleteItem'; id: string; deletedAt: string }
  | { kind: 'deleteCourse'; id: string; deletedAt: string }
  | { kind: 'settings' };

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, quota); the in-memory state still works */
  }
}

/** Whole-state cache in localStorage. Always written; the source of truth when offline. */
export const localCache = {
  load(): AppData | null {
    const raw = safeGet(DATA_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AppData;
      if (!Array.isArray(parsed.courses) || !Array.isArray(parsed.items) || !parsed.settings) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  save(data: AppData): void {
    safeSet(DATA_KEY, JSON.stringify(data));
  },
  clear(): void {
    try {
      localStorage.removeItem(DATA_KEY);
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  },
  loadPending(): PendingOp[] {
    const raw = safeGet(PENDING_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as PendingOp[];
    } catch {
      return [];
    }
  },
  savePending(ops: PendingOp[]): void {
    safeSet(PENDING_KEY, JSON.stringify(ops));
  },
};
