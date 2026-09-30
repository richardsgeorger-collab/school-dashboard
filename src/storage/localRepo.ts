import type { AppData } from '../domain/types';

const DATA_KEY = 'school-dashboard:v1';
const PENDING_KEY = 'school-dashboard:pending';
/** Accounts this device has loaded from the server at least once. */
const SEEN_KEY = 'school-dashboard:accounts-seen';

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

function parse(raw: string | null): AppData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!Array.isArray(parsed.courses) || !Array.isArray(parsed.items) || !parsed.settings) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The string this tab last wrote, so its own writes are never mistaken for another tab's. */
let lastSaved: string | null = null;

/** Whole-state cache in localStorage. Always written; the source of truth when offline. */
export const localCache = {
  load(): AppData | null {
    return parse(safeGet(DATA_KEY));
  },
  save(data: AppData): void {
    const raw = JSON.stringify(data);
    if (raw === lastSaved) return;
    lastSaved = raw;
    safeSet(DATA_KEY, raw);
  },
  /**
   * Another tab wrote the cache. The Halo bookmark opens the app in a second tab, so this is the ordinary case, not
   * an edge: without it the first tab kept its stale copy and wrote it back over the sync on its next tick.
   */
  onChange(cb: (other: AppData) => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const handler = (e: StorageEvent) => {
      if (e.key !== DATA_KEY || e.newValue === null || e.newValue === lastSaved) return;
      const other = parse(e.newValue);
      if (other) cb(other);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
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
  seenAccount(id: string): boolean {
    try {
      return (JSON.parse(safeGet(SEEN_KEY) ?? '[]') as string[]).includes(id);
    } catch {
      return false;
    }
  },
  markAccountSeen(id: string): void {
    let seen: string[] = [];
    try {
      seen = JSON.parse(safeGet(SEEN_KEY) ?? '[]') as string[];
    } catch {
      seen = [];
    }
    if (!seen.includes(id)) safeSet(SEEN_KEY, JSON.stringify([...seen, id].slice(-20)));
  },
};
