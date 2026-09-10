import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import seed from '../data/seed.json';
import { addDays, todayStr } from '../domain/dates';
import { deriveDeadlines, type DerivedDeadline } from '../domain/deadlines';
import { DERIVED_DEADLINES } from '../domain/flags';
import { shortLabel } from '../domain/labels';
import { completeItem, computeProgress, previewAward, reopenItem, withScore, type Progress } from '../domain/points';
import { computeSchedule, type Schedule } from '../domain/schedule';
import { DEFAULT_SETTINGS, type AppData, type Course, type DateStr, type Item, type ItemStatus, type Settings } from '../domain/types';
import { localCache, type PendingOp } from './localRepo';
import { mergeData, type Repository } from './repository';

export type SyncStatus = 'off' | 'signed_out' | 'syncing' | 'synced' | 'error';
export interface SyncState {
  status: SyncStatus;
  lastSync: string | null;
  error: string | null;
  email: string | null;
  pending: number;
}

export interface StoreActions {
  upsertItem(item: Item): void;
  deleteItem(id: string): void;
  setStatus(id: string, status: ItemStatus, score?: number | null): void;
  upsertCourse(course: Course): void;
  deleteCourse(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  importParsed(course: Course, items: Item[], mode: 'replace' | 'merge'): void;
  resetToSeed(): void;
  exportJson(): string;
  importJson(json: string): { courses: number; items: number };
  /** Wire a remote repository (Supabase). Pass null to disconnect. */
  connectRemote(repo: Repository | null, email: string | null): Promise<void>;
  syncNow(): Promise<void>;
}

export interface Store {
  data: AppData;
  schedule: Schedule;
  /** Real-deadline inferences by item id (empty when the layer is off). */
  derived: Record<string, DerivedDeadline>;
  progress: Progress;
  /** Points the item would earn now, or has locked in. */
  previewAward(item: Item): number;
  today: DateStr;
  term: { start: DateStr; end: DateStr };
  courseById: Map<string, Course>;
  isDark: boolean;
  sync: SyncState;
  actions: StoreActions;
}

const StoreContext = createContext<Store | null>(null);

const nowIso = () => new Date().toISOString();

function env(key: string): string | null {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.length > 0 ? v : null;
}

export function seedData(): AppData {
  const now = nowIso();
  return {
    courses: (seed.courses as Course[]).map((c) => ({ ...c, updatedAt: now })),
    items: (seed.items as Item[]).map((i) => ({ ...i, updatedAt: now })),
    settings: {
      ...DEFAULT_SETTINGS,
      supabaseUrl: env('VITE_SUPABASE_URL'),
      supabaseAnonKey: env('VITE_SUPABASE_ANON_KEY'),
      updatedAt: now,
    },
  };
}

/** Fill fields added after a row was written (older caches, other devices, imports). */
export function normalizeData(data: AppData): AppData {
  const codeById = new Map(data.courses.map((c) => [c.id, c.code]));
  return {
    ...data,
    items: data.items.map((i) => {
      const raw = i as Partial<Item> & Item;
      const needsLabel = !raw.label;
      return {
        ...i,
        label: needsLabel ? shortLabel({ title: i.title, courseCode: codeById.get(i.courseId) ?? '', type: i.type }) : raw.label,
        labelOverridden: raw.labelOverridden ?? false,
        award: raw.award ?? null,
      };
    }),
  };
}

function initialData(): AppData {
  const cached = localCache.load();
  if (cached) {
    const settings = { ...DEFAULT_SETTINGS, ...cached.settings };
    if (!settings.supabaseUrl && env('VITE_SUPABASE_URL')) {
      settings.supabaseUrl = env('VITE_SUPABASE_URL');
      settings.supabaseAnonKey = env('VITE_SUPABASE_ANON_KEY');
    }
    return normalizeData({ ...cached, settings });
  }
  return seedData();
}

function termOf(courses: Course[], today: DateStr): { start: DateStr; end: DateStr } {
  if (courses.length === 0) return { start: today, end: addDays(today, 120) };
  let start = courses[0].termStart;
  let end = courses[0].termEnd;
  for (const c of courses) {
    if (c.termStart < start) start = c.termStart;
    if (c.termEnd > end) end = c.termEnd;
  }
  return { start, end };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const [today, setToday] = useState<DateStr>(() => todayStr(data.settings.timezone));
  const [sync, setSync] = useState<SyncState>({ status: 'off', lastSync: null, error: null, email: null, pending: localCache.loadPending().length });
  const [isDark, setIsDark] = useState(false);
  const remoteRef = useRef<Repository | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    localCache.save(data);
  }, [data]);

  useEffect(() => {
    const tick = () => setToday(todayStr(dataRef.current.settings.timezone));
    tick();
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [data.settings.timezone]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const pref = data.settings.theme;
      const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      setIsDark(dark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [data.settings.theme]);

  const term = useMemo(() => termOf(data.courses, today), [data.courses, today]);
  const derived = useMemo<Record<string, DerivedDeadline>>(
    () => (DERIVED_DEADLINES ? deriveDeadlines(data.items, data.courses, data.settings) : {}),
    [data.items, data.courses, data.settings],
  );
  const schedule = useMemo(
    () => computeSchedule(data.items.map((i) => (derived[i.id] ? { ...i, deadlineAt: derived[i.id].deadlineAt } : i)), data.settings, today, term),
    [data.items, derived, data.settings, today, term],
  );
  const courseById = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const progress = useMemo(() => computeProgress(data.items, data.settings, today), [data.items, data.settings, today]);
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const previewFor = useCallback(
    (item: Item) => previewAward(item, scheduleRef.current.byItem[item.id]?.startBy ?? today, nowIso(), data.settings.timezone),
    [today, data.settings.timezone],
  );

  // ---- remote mirroring -------------------------------------------------
  const flushPending = useCallback(async () => {
    const repo = remoteRef.current;
    if (!repo) return;
    const ops = localCache.loadPending();
    if (ops.length === 0) return;
    const remaining: PendingOp[] = [];
    for (const op of ops) {
      try {
        const d = dataRef.current;
        if (op.kind === 'items') {
          const rows = d.items.filter((i) => op.ids.includes(i.id));
          if (rows.length) await repo.saveItems(rows);
        } else if (op.kind === 'courses') {
          const rows = d.courses.filter((c) => op.ids.includes(c.id));
          if (rows.length) await repo.saveCourses(rows);
        } else if (op.kind === 'deleteItem') await repo.deleteItem(op.id, op.deletedAt);
        else if (op.kind === 'deleteCourse') await repo.deleteCourse(op.id, op.deletedAt);
        else if (op.kind === 'settings') await repo.saveSettings(d.settings);
      } catch {
        remaining.push(op);
      }
    }
    localCache.savePending(remaining);
    setSync((s) => ({ ...s, pending: remaining.length }));
  }, []);

  const mirror = useCallback(
    (op: PendingOp) => {
      const queue = localCache.loadPending();
      queue.push(op);
      localCache.savePending(queue);
      setSync((s) => ({ ...s, pending: queue.length }));
      if (remoteRef.current) void flushPending();
    },
    [flushPending],
  );

  const syncNow = useCallback(async () => {
    const repo = remoteRef.current;
    if (!repo) return;
    setSync((s) => ({ ...s, status: 'syncing', error: null }));
    try {
      await flushPending();
      const remote = await repo.load();
      const local = dataRef.current;
      const result = mergeData(local, remote);
      result.merged = normalizeData(result.merged);
      // Connection details never come from the server.
      result.merged.settings = {
        ...result.merged.settings,
        supabaseUrl: local.settings.supabaseUrl,
        supabaseAnonKey: local.settings.supabaseAnonKey,
      };
      setData(result.merged);
      dataRef.current = result.merged;
      if (result.pushCourses.length) await repo.saveCourses(result.pushCourses);
      if (result.pushItems.length) await repo.saveItems(result.pushItems);
      if (result.pushSettings) await repo.saveSettings(result.merged.settings);
      setSync((s) => ({ ...s, status: 'synced', lastSync: nowIso(), error: null }));
    } catch (e) {
      setSync((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  }, [flushPending]);

  const connectRemote = useCallback(
    async (repo: Repository | null, email: string | null) => {
      remoteRef.current = repo;
      if (!repo) {
        setSync((s) => ({ ...s, status: dataRef.current.settings.supabaseUrl ? 'signed_out' : 'off', email: null }));
        return;
      }
      setSync((s) => ({ ...s, email }));
      await syncNow();
    },
    [syncNow],
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && remoteRef.current) void syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncNow]);

  // ---- actions ----------------------------------------------------------
  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => {
      const next = fn(d);
      dataRef.current = next;
      return next;
    });
  }, []);

  const actions = useMemo<StoreActions>(
    () => ({
      upsertItem(item) {
        const stamped = { ...withScore(item, item.score), updatedAt: nowIso() };
        update((d) => ({
          ...d,
          items: d.items.some((i) => i.id === item.id)
            ? d.items.map((i) => (i.id === item.id ? stamped : i))
            : [...d.items, stamped],
        }));
        mirror({ kind: 'items', ids: [item.id] });
      },
      deleteItem(id) {
        update((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
        mirror({ kind: 'deleteItem', id, deletedAt: nowIso() });
      },
      setStatus(id, status, score) {
        const now = nowIso();
        const tz = dataRef.current.settings.timezone;
        update((d) => ({
          ...d,
          items: d.items.map((i) => {
            if (i.id !== id) return i;
            let next: Item =
              status === 'done'
                ? completeItem(i, scheduleRef.current.byItem[id]?.startBy ?? todayStr(tz), now, tz)
                : { ...reopenItem(i), status };
            if (score !== undefined) next = withScore(next, score);
            return { ...next, updatedAt: now };
          }),
        }));
        mirror({ kind: 'items', ids: [id] });
      },
      upsertCourse(course) {
        const stamped = { ...course, updatedAt: nowIso() };
        update((d) => ({
          ...d,
          courses: d.courses.some((c) => c.id === course.id)
            ? d.courses.map((c) => (c.id === course.id ? stamped : c))
            : [...d.courses, stamped],
        }));
        mirror({ kind: 'courses', ids: [course.id] });
      },
      deleteCourse(id) {
        const now = nowIso();
        const doomed = dataRef.current.items.filter((i) => i.courseId === id).map((i) => i.id);
        update((d) => ({ ...d, courses: d.courses.filter((c) => c.id !== id), items: d.items.filter((i) => i.courseId !== id) }));
        for (const itemId of doomed) mirror({ kind: 'deleteItem', id: itemId, deletedAt: now });
        mirror({ kind: 'deleteCourse', id, deletedAt: now });
      },
      updateSettings(patch) {
        update((d) => ({ ...d, settings: { ...d.settings, ...patch, updatedAt: nowIso() } }));
        mirror({ kind: 'settings' });
      },
      importParsed(course, items, mode) {
        const now = nowIso();
        const existing = dataRef.current.items.filter((i) => i.courseId === course.id);
        let merged: Item[];
        if (mode === 'merge') {
          const byTitle = new Map(existing.map((i) => [i.title, i]));
          merged = items.map((i) => {
            const prev = byTitle.get(i.title);
            return prev
              ? {
                  ...i,
                  status: prev.status,
                  completedAt: prev.completedAt,
                  score: prev.score,
                  award: prev.award,
                  estimatedMinutes: prev.estimateOverridden ? prev.estimatedMinutes : i.estimatedMinutes,
                  estimateOverridden: prev.estimateOverridden,
                  startByOverride: prev.startByOverride,
                  label: prev.labelOverridden ? prev.label : i.label,
                  labelOverridden: prev.labelOverridden,
                  updatedAt: now,
                }
              : { ...i, updatedAt: now };
          });
        } else {
          merged = items.map((i) => ({ ...i, updatedAt: now }));
        }
        const removed = existing.filter((e) => !merged.some((m) => m.id === e.id)).map((e) => e.id);
        update((d) => ({
          ...d,
          courses: d.courses.some((c) => c.id === course.id)
            ? d.courses.map((c) => (c.id === course.id ? { ...course, updatedAt: now } : c))
            : [...d.courses, { ...course, updatedAt: now }],
          items: [...d.items.filter((i) => i.courseId !== course.id), ...merged],
        }));
        mirror({ kind: 'courses', ids: [course.id] });
        mirror({ kind: 'items', ids: merged.map((m) => m.id) });
        for (const id of removed) mirror({ kind: 'deleteItem', id, deletedAt: now });
      },
      resetToSeed() {
        const fresh = seedData();
        const keepSettings = { ...dataRef.current.settings, updatedAt: nowIso() };
        const removedItems = dataRef.current.items.map((i) => i.id);
        const removedCourses = dataRef.current.courses.map((c) => c.id);
        const next = { ...fresh, settings: keepSettings };
        update(() => next);
        const now = nowIso();
        for (const id of removedItems) if (!next.items.some((i) => i.id === id)) mirror({ kind: 'deleteItem', id, deletedAt: now });
        for (const id of removedCourses) if (!next.courses.some((c) => c.id === id)) mirror({ kind: 'deleteCourse', id, deletedAt: now });
        mirror({ kind: 'courses', ids: next.courses.map((c) => c.id) });
        mirror({ kind: 'items', ids: next.items.map((i) => i.id) });
      },
      exportJson() {
        const { supabaseAnonKey: _k, supabaseUrl: _u, ...settings } = dataRef.current.settings;
        return JSON.stringify({ exportedAt: nowIso(), courses: dataRef.current.courses, items: dataRef.current.items, settings }, null, 2);
      },
      importJson(json) {
        const parsed = JSON.parse(json) as Partial<AppData>;
        if (!Array.isArray(parsed.courses) || !Array.isArray(parsed.items)) throw new Error('File does not contain courses and items');
        const now = nowIso();
        const courses = parsed.courses.map((c) => ({ ...c, updatedAt: now }));
        const items = normalizeData({ courses, items: parsed.items, settings: dataRef.current.settings }).items.map((i) => ({ ...i, updatedAt: now }));
        update((d) => ({
          courses: [...d.courses.filter((c) => !courses.some((n) => n.id === c.id)), ...courses],
          items: [...d.items.filter((i) => !items.some((n) => n.id === i.id)), ...items],
          settings: parsed.settings ? { ...d.settings, ...parsed.settings, supabaseUrl: d.settings.supabaseUrl, supabaseAnonKey: d.settings.supabaseAnonKey, updatedAt: now } : d.settings,
        }));
        mirror({ kind: 'courses', ids: courses.map((c) => c.id) });
        mirror({ kind: 'items', ids: items.map((i) => i.id) });
        return { courses: courses.length, items: items.length };
      },
      connectRemote,
      syncNow,
    }),
    [update, mirror, connectRemote, syncNow],
  );

  const value = useMemo<Store>(
    () => ({ data, schedule, derived, progress, previewAward: previewFor, today, term, courseById, isDark, sync, actions }),
    [data, schedule, derived, progress, previewFor, today, term, courseById, isDark, sync, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
