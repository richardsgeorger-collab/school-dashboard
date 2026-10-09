import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import seed from '../data/seed.json';
import { addDays, dateOf, todayStr } from '../domain/dates';
import { derive, type DerivedDeadline, type Nudge } from '../domain/deadlines';
import { DERIVED_DEADLINES } from '../domain/flags';
import { estimateMinutes } from '../domain/estimate';
import { labelCarriesSection, shortLabel } from '../domain/labels';
import { dedupeRequirements } from '../domain/requirements';
import { pruneOrphanPosts } from '../halo/announce';
import { dedupeData } from '../halo/dedupe';
import { completeItem, computeProgress, previewAward, reopenItem, withScore, type Progress } from '../domain/points';
import { computeSchedule, type Schedule } from '../domain/schedule';
import { applyHaloPlan, type HaloPlan } from '../halo/apply';
import { gradedWell, gradeUps, turnedInSince } from '../joy/joy';
import { actualStats, calibrate as calibrateItem, withCalibration, type Calibrated } from '../domain/calibration';
import { applyOnline, bankedAsItems, ledgerWith, logTiming, resetCourseItems } from '../domain/classAdmin';
import { recordCheck } from '../halo/verification';
import { recordAnswer } from '../quiz/stats';
import { diffBatch, loadUndo, revert, saveUndo, type UndoBatch } from './undo';
import { DEFAULT_SETTINGS, type AppData, type Course, type DateStr, type HaloCheckRecord, type Item, type ItemStatus, type JoyState, type Settings } from '../domain/types';
import { isDemo } from '../demo/demo';
import { localCache, type PendingOp } from './localRepo';
import { mergeData, type Repository } from './repository';
import { ENV } from '../env';

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
  /** Merges into settings.joy as it is now, not as a render saw it: two moments in one tick must not undo each other. */
  updateJoy(patch: Partial<JoyState>): void;
  importParsed(course: Course, items: Item[], mode: 'replace' | 'merge'): void;
  resetToSeed(): void;
  /** Wipe every class and item, keep settings. The account mirror gets the deletions. */
  clearAll(): void;
  exportJson(): string;
  importJson(json: string): { courses: number; items: number };
  /** Wire a remote repository (Supabase). Pass null to disconnect. */
  connectRemote(repo: Repository | null, email: string | null): Promise<void>;
  syncNow(): Promise<void>;
  /** Apply an approved Halo diff. */
  applyHaloSync(plan: HaloPlan): void;
  dismissTimeAsk(): void;
  /** Write a posted or typed score; marks the item done if it is not. */
  applyScore(id: string, score: number, source: 'halo' | 'manual'): void;
  /** Append a Check Halo result. */
  recordHaloCheck(rec: HaloCheckRecord): void;
  /** Append several at once (one per audited class). */
  recordHaloChecks(recs: HaloCheckRecord[]): void;
  /** Remember one sync's changes so the whole batch can be put back until the next sync. */
  setUndo(batch: UndoBatch | null): void;
  /** Put the last sync's batch back. */
  undoLast(): void;
  /** Items right now, for building a batch. */
  snapshotItems(): Item[];
  /** One practice answer, right or missed, against its class and topic. */
  recordQuizAnswer(courseId: string, topic: string, missed: boolean): void;
  /** Record how long an item really took, on the item and in the ledger. */
  logActual(id: string, minutes: number | null): void;
  /** Delete every item of one class, keeping its earned awards and logged minutes. Returns how many went. */
  resetCourseItems(courseId: string): number;
  /** Write an approved AI plan: the whole item list it produced, the ids it touched, one undo batch. */
  applyIngest(items: Item[], touched: string[], label: string): void;
}

export interface Store {
  data: AppData;
  schedule: Schedule;
  /** Real-deadline inferences by item id (empty when the layer is off). */
  derived: Record<string, DerivedDeadline>;
  /** Small reminders tied to items, like pre-lab prep. */
  nudges: Nudge[];
  progress: Progress;
  /** Points the item would earn now, or has locked in. */
  previewAward(item: Item): number;
  /** Minutes the planner uses for an item and where that number comes from. */
  calibrate(item: Item): Calibrated;
  /** The item just marked done, so the app can ask how long it took. */
  justDone: { id: string; at: string } | null;
  /** The last sync's batch, until the next sync. */
  undo: UndoBatch | null;
  today: DateStr;
  term: { start: DateStr; end: DateStr };
  courseById: Map<string, Course>;
  isDark: boolean;
  sync: SyncState;
  actions: StoreActions;
}

const StoreContext = createContext<Store | null>(null);

const nowIso = () => new Date().toISOString();

/** The two public Supabase settings, by name (see src/env.ts for why never the whole env object). */
function env(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | null {
  const v = key === 'VITE_SUPABASE_URL' ? ENV.SUPABASE_URL : ENV.SUPABASE_ANON_KEY;
  return v.length > 0 ? v : null;
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

/** A brand-new student starts with nothing: the first sync or the first class is theirs. */
/** The device's zone on a first run, so an online student in Ohio sees Ohio times; Phoenix when the browser will not say. */
export function deviceTimezone(fallback = DEFAULT_SETTINGS.timezone): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== 'UTC' && tz !== 'Etc/UTC' && tz.includes('/')) return tz;
  } catch {
    /* an old browser: the fallback is a fine answer */
  }
  return fallback;
}

export function emptyData(): AppData {
  const now = nowIso();
  return { courses: [], items: [], settings: { ...DEFAULT_SETTINGS, timezone: deviceTimezone(), supabaseUrl: env('VITE_SUPABASE_URL'), supabaseAnonKey: env('VITE_SUPABASE_ANON_KEY'), updatedAt: now } };
}

/** Fill fields added after a row was written (older caches, other devices, imports). */
/**
 * Classes in one order on every screen: by code, a lab right after its lecture (CHM-113, CHM-113L, ENG-105…). The
 * cloud returns rows in whatever order they were written, and the Classes list, the Inbox chips and the Study chips
 * each showed a different one (sweep, 2026-09-30). The same array comes back when it is already in order.
 */
export function orderCourses(courses: Course[]): Course[] {
  const by = (a: Course, b: Course) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id);
  for (let i = 1; i < courses.length; i++) if (by(courses[i - 1], courses[i]) > 0) return [...courses].sort(by);
  return courses;
}

export function normalizeData(data: AppData): AppData {
  const codeById = new Map(data.courses.map((c) => [c.id, c.code]));
  return {
    ...data,
    courses: orderCourses(data.courses),
    items: data.items.map((i) => {
      const raw = i as Partial<Item> & Item;
      const courseCode = codeById.get(i.courseId) ?? '';
      // A label made while the course code still carried its section ("ENG-105-ONL4 DQ 5.2") is made again.
      const needsLabel = !raw.label || (!raw.labelOverridden && labelCarriesSection(raw.label, courseCode));
      return {
        ...i,
        // Estimate rules get recalibrated over time; untouched parsed items follow the current table.
        estimatedMinutes: (i.source === 'parsed' || i.source === 'halo' || i.source === 'ics') && !raw.estimateOverridden ? estimateMinutes({ title: i.title, type: i.type, points: i.points, courseCode }) : i.estimatedMinutes,
        label: needsLabel ? shortLabel({ title: i.title, courseCode, type: i.type }) : raw.label,
        // Two wordings of one part, attached before the merge could see they were the same, fold into one here.
        requirements: raw.requirements && raw.requirements.length > 1 ? dedupeRequirements(raw.requirements) : raw.requirements,
        labelOverridden: raw.labelOverridden ?? false,
        award: raw.award ?? null,
      };
    }),
  };
}

function initialData(): AppData {
  const cached = localCache.load();
  // Development and the e2e scripts: a fresh browser opened at #/now?seed=1 loads the sample term. An empty cache
  // (the landing page was visited first) does not count as data and yields to the seed.
  const wantSeed = typeof window !== 'undefined' && window.location.hash.includes('seed=1');
  if (cached && !(wantSeed && cached.courses.length === 0 && cached.items.length === 0)) {
    const settings = { ...DEFAULT_SETTINGS, ...cached.settings };
    if (!settings.supabaseUrl && env('VITE_SUPABASE_URL')) {
      settings.supabaseUrl = env('VITE_SUPABASE_URL');
      settings.supabaseAnonKey = env('VITE_SUPABASE_ANON_KEY');
    }
    return normalizeData({ ...cached, settings });
  }
  if (wantSeed) return seedData();
  return emptyData();
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

/** Fired after the account's rows have been merged into this device. */
export const ACCOUNT_SYNCED_EVENT = 'account-synced';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const [today, setToday] = useState<DateStr>(() => todayStr(data.settings.timezone));
  const [undo, setUndoState] = useState<UndoBatch | null>(() => loadUndo());
  const [sync, setSync] = useState<SyncState>({ status: 'off', lastSync: null, error: null, email: null, pending: localCache.loadPending().length });
  const [isDark, setIsDark] = useState(false);
  const [justDone, setJustDone] = useState<{ id: string; at: string } | null>(null);
  const remoteRef = useRef<Repository | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    localCache.save(data);
  }, [data]);
  // Another tab changed the cache: take its newer rows and keep ours, the same rule the account mirror uses.
  useEffect(
    () =>
      localCache.onChange((other) => {
        const local = dataRef.current;
        const result = mergeData(local, { courses: other.courses, items: other.items, settings: other.settings });
        const merged = normalizeData(result.merged);
        merged.settings = { ...DEFAULT_SETTINGS, ...merged.settings, supabaseUrl: local.settings.supabaseUrl, supabaseAnonKey: local.settings.supabaseAnonKey };
        dataRef.current = merged;
        setData(merged);
      }),
    [],
  );
  useEffect(() => {
    const ledger = ledgerWith(data.items, data.settings.timings);
    if (ledger !== (data.settings.timings ?? ledger)) setData((d) => ({ ...d, settings: { ...d.settings, timings: ledger } }));
  }, [data.items, data.settings.timings]);

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
  const derivedAll = useMemo(
    () => (DERIVED_DEADLINES ? derive(data.items, data.courses, data.settings) : { deadlines: {}, nudges: [] }),
    [data.items, data.courses, data.settings],
  );
  const derived = derivedAll.deadlines;
  const nudges = derivedAll.nudges;
  const stats = useMemo(() => actualStats(data.items, data.settings.timings), [data.items, data.settings.timings]);
  const schedule = useMemo(
    () =>
      computeSchedule(
        // A derived deadline that has already passed stops binding; the syllabus date takes over.
        // Real timings, once there are enough, replace table estimates for the plan.
        withCalibration(
          data.items.map((i) => (derived[i.id] && dateOf(derived[i.id].deadlineAt, data.settings.timezone) >= today ? { ...i, deadlineAt: derived[i.id].deadlineAt } : i)),
          stats,
        ),
        data.settings,
        today,
        term,
      ),
    [data.items, derived, data.settings, today, term, stats],
  );
  const courseById = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const calibrate = useCallback((item: Item) => calibrateItem(item, stats, courseById.get(item.courseId)), [stats, courseById]);
  // Awards of deleted items stay in the bank, so XP, streaks, and badges never drop because a class was reset.
  const progress = useMemo(
    () => computeProgress([...data.items, ...bankedAsItems(data.settings.bankedAwards, new Set(data.items.map((i) => i.id)))], data.settings, today),
    [data.items, data.settings, today],
  );
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
      // A device loading this account for the first time, with nothing of its own: the account's saved settings are
      // the truth. What this device stamped before they arrived (defaults, onboarding starting) is not pushed over them.
      const fresh = (d: AppData) => d.courses.length === 0 && d.items.length === 0 && !d.settings.lastPull;
      const first = !!repo.accountId && !localCache.seenAccount(repo.accountId) && fresh(dataRef.current);
      if (first) localCache.savePending(localCache.loadPending().filter((op) => op.kind !== 'settings'));
      await flushPending();
      const remote = await repo.load();
      const local = dataRef.current;
      const result = mergeData(local, remote, { preferRemoteSettings: first && fresh(local) });
      result.merged = normalizeData(result.merged);
      // Two copies of one class (the Sept 30 move left them in George's account): folded into one, removals mirrored.
      const folded = dedupeData(result.merged);
      if (folded.removedCourses.length || folded.removedItems.length) {
        result.merged = folded.data;
        const at = nowIso();
        for (const id of folded.removedItems) mirror({ kind: 'deleteItem', id, deletedAt: at });
        for (const id of folded.removedCourses) mirror({ kind: 'deleteCourse', id, deletedAt: at });
        mirror({ kind: 'courses', ids: folded.data.courses.map((c) => c.id) });
        mirror({ kind: 'items', ids: folded.data.items.map((i) => i.id) });
        mirror({ kind: 'settings' });
        void pruneOrphanPosts(folded.data.courses.map((c) => c.id));
      }
      // Connection details never come from the server. Every setting the account's saved copy predates gets its
      // default: a copy without weekStartsOn made the Calendar's days NaN and re-render until the tab died (audit).
      result.merged.settings = {
        ...DEFAULT_SETTINGS,
        ...result.merged.settings,
        supabaseUrl: local.settings.supabaseUrl,
        supabaseAnonKey: local.settings.supabaseAnonKey,
      };
      setData(result.merged);
      dataRef.current = result.merged;
      if (result.pushCourses.length) await repo.saveCourses(result.pushCourses);
      if (result.pushItems.length) await repo.saveItems(result.pushItems);
      if (result.pushSettings) await repo.saveSettings(result.merged.settings);
      if (repo.accountId) localCache.markAccountSeen(repo.accountId);
      setSync((s) => ({ ...s, status: 'synced', lastSync: nowIso(), error: null }));
      // The account's rows are here now; anything that waits for them (the announcement reader) may go.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_SYNCED_EVENT));
    } catch (e) {
      setSync((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  }, [flushPending]);

  const connectRemote = useCallback(
    async (repo: Repository | null, email: string | null) => {
      remoteRef.current = repo;
      if (!repo) {
        // The demo student (demo/demo.ts) has no mirror and is complete as loaded: "synced", so the moments a sync
        // leaves behind (the grade that went up) play as they would for a real student.
        setSync((s) => ({ ...s, status: isDemo() ? 'synced' : dataRef.current.settings.supabaseUrl ? 'signed_out' : 'off', email: null }));
        return;
      }
      setSync((s) => ({ ...s, email }));
      // Whose planner is on this device? Another account's: it is cleared, with everything else of that account's,
      // before a single row could merge into or be sent to this one; the page reloads clean and takes this account
      // from the server. A planner made before any sign-in merges into the first account, as before. (George, 2026-10-09:
      // a sign-in to a second account carried his queued changes into it and its state back into his.)
      if (repo.accountId) {
        const owner = localCache.owner();
        if (owner && owner !== 'local' && owner !== repo.accountId) {
          localCache.clearForSwitch();
          localCache.claim(repo.accountId);
          if (typeof window !== 'undefined') window.location.reload();
          return;
        }
        localCache.claim(repo.accountId);
      }
      await syncNow();
    },
    [syncNow],
  );

  // Back online: what was changed offline goes up now, not at the next change or reload (audit, 2026-09-30).
  useEffect(() => {
    const onOnline = () => {
      if (remoteRef.current) void syncNow();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [syncNow]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && remoteRef.current) void syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncNow]);

  // ---- actions ----------------------------------------------------------
  // Computed against the ref, not React's queued state, so several actions in one tick each see the last one's result
  // and a snapshot taken right after an action is exact.
  const update = useCallback((fn: (d: AppData) => AppData) => {
    const raw = fn(dataRef.current);
    const ordered = orderCourses(raw.courses);
    const next = ordered === raw.courses ? raw : { ...raw, courses: ordered };
    dataRef.current = next;
    setData(next);
  }, []);

  /** Swap every class and item for `fresh`, keep settings, and tell the account mirror about the deletions. */
  const replaceAll = useCallback(
    (fresh: AppData) => {
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
    [update, mirror],
  );

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
            if (status === 'done' && i.status !== 'done') setJustDone({ id, at: now });
            if (score !== undefined) next = withScore(next, score);
            return { ...next, updatedAt: now };
          }),
        }));
        mirror({ kind: 'items', ids: [id] });
      },
      upsertCourse(course) {
        const now = nowIso();
        // An online class has no meeting times and nothing happens "in class".
        const stamped = { ...course, meetings: course.online ? [] : course.meetings, updatedAt: now };
        const cleared = applyOnline(dataRef.current.items, course.id, course.online);
        update((d) => ({
          ...d,
          courses: d.courses.some((c) => c.id === course.id)
            ? d.courses.map((c) => (c.id === course.id ? stamped : c))
            : [...d.courses, stamped],
          items: cleared.touched.length ? cleared.items.map((i) => (cleared.touched.includes(i.id) ? { ...i, updatedAt: now } : i)) : d.items,
        }));
        mirror({ kind: 'courses', ids: [course.id] });
        if (cleared.touched.length) mirror({ kind: 'items', ids: cleared.touched });
      },
      deleteCourse(id) {
        const now = nowIso();
        const plan = resetCourseItems(dataRef.current, id, now);
        update((d) => ({ ...d, courses: d.courses.filter((c) => c.id !== id), items: plan.items, settings: plan.settings }));
        for (const itemId of plan.deletedIds) mirror({ kind: 'deleteItem', id: itemId, deletedAt: now });
        mirror({ kind: 'deleteCourse', id, deletedAt: now });
        mirror({ kind: 'settings' });
      },
      resetCourseItems(courseId) {
        const now = nowIso();
        const plan = resetCourseItems(dataRef.current, courseId, now);
        update((d) => ({ ...d, items: plan.items, settings: plan.settings }));
        for (const itemId of plan.deletedIds) mirror({ kind: 'deleteItem', id: itemId, deletedAt: now });
        mirror({ kind: 'settings' });
        return plan.deletedIds.length;
      },
      applyScore(id, score, source) {
        const now = nowIso();
        const tz = dataRef.current.settings.timezone;
        update((d) => ({
          ...d,
          items: d.items.map((i) => {
            if (i.id !== id) return i;
            const done = i.status === 'done' ? i : completeItem(i, scheduleRef.current.byItem[id]?.startBy ?? todayStr(tz), now, tz);
            return { ...withScore(done, score), scoreSource: source, updatedAt: now };
          }),
        }));
        mirror({ kind: 'items', ids: [id] });
      },
      recordQuizAnswer(courseId, topic, missed) {
        update((d) => ({ ...d, settings: { ...d.settings, quizStats: recordAnswer(d.settings.quizStats, courseId, topic, missed, nowIso()), updatedAt: nowIso() } }));
        mirror({ kind: 'settings' });
      },
      snapshotItems() {
        return dataRef.current.items;
      },
      setUndo(batch) {
        saveUndo(batch);
        setUndoState(batch);
      },
      undoLast() {
        const batch = loadUndo();
        if (!batch) return;
        const before = dataRef.current.items;
        update((d) => ({ ...d, items: revert(d.items, batch) }));
        const after = revert(before, batch);
        const afterIds = new Set(after.map((i) => i.id));
        for (const id of batch.added) if (!afterIds.has(id)) mirror({ kind: 'deleteItem', id, deletedAt: nowIso() });
        const touched = batch.before.map((i) => i.id).filter((id) => afterIds.has(id));
        if (touched.length) mirror({ kind: 'items', ids: touched });
        saveUndo(null);
        setUndoState(null);
      },
      recordHaloChecks(recs) {
        if (recs.length === 0) return;
        update((d) => ({ ...d, settings: { ...d.settings, haloChecks: recs.reduce((list, r) => recordCheck(list, r), d.settings.haloChecks ?? []), updatedAt: nowIso() } }));
        mirror({ kind: 'settings' });
      },
      recordHaloCheck(rec) {
        update((d) => ({ ...d, settings: { ...d.settings, haloChecks: recordCheck(d.settings.haloChecks, rec), updatedAt: nowIso() } }));
        mirror({ kind: 'settings' });
      },
      logActual(id, minutes) {
        const now = nowIso();
        const item = dataRef.current.items.find((i) => i.id === id);
        if (!item) return;
        const value = minutes && minutes > 0 ? Math.round(minutes) : null;
        update((d) => ({
          ...d,
          items: d.items.map((i) => (i.id === id ? { ...i, actualMinutes: value, updatedAt: now } : i)),
          settings: { ...d.settings, timings: value ? logTiming(d.settings.timings, item, value, now) : (d.settings.timings ?? []).filter((t) => t.itemId !== id), updatedAt: now },
        }));
        mirror({ kind: 'items', ids: [id] });
        mirror({ kind: 'settings' });
      },
      updateSettings(patch) {
        update((d) => ({ ...d, settings: { ...d.settings, ...patch, updatedAt: nowIso() } }));
        mirror({ kind: 'settings' });
      },
      updateJoy(patch) {
        update((d) => ({ ...d, settings: { ...d.settings, joy: { ...(d.settings.joy ?? {}), ...patch }, updatedAt: nowIso() } }));
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
        replaceAll(seedData());
      },
      clearAll() {
        replaceAll(emptyData());
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
      applyIngest(items, touched, label) {
        const now = nowIso();
        const before = dataRef.current.items;
        update((d) => ({ ...d, items }));
        if (touched.length) mirror({ kind: 'items', ids: touched });
        const batch = diffBatch(label, before, items, now);
        if (batch.count) {
          saveUndo(batch);
          setUndoState(batch);
        }
      },
      applyHaloSync(plan) {
        const now = nowIso();
        const tz = dataRef.current.settings.timezone;
        const before = dataRef.current.items;
        const beforeCourses = dataRef.current.courses;
        const r = applyHaloPlan(dataRef.current, plan, (id) => scheduleRef.current.byItem[id]?.startBy, now, tz);
        // The rewards (joy/): what this sync newly saw handed in, and grades that went up, celebrated once on the next
        // open. Added to whatever is still waiting, so a sync applied in two passes is still one celebration.
        const turnedIn = turnedInSince(before, r.data.items);
        const ups = gradeUps(beforeCourses, r.data.courses);
        const graded = gradedWell(before, r.data.items);
        if (turnedIn > 0 || ups.length > 0 || graded.length > 0) {
          const joy = r.data.settings.joy ?? {};
          const pend = joy.pending ?? { at: now };
          const merged = [...(pend.gradeUps ?? []).filter((g) => !ups.some((u) => u.courseId === g.courseId)), ...ups];
          // Grade ups are also kept two days for the push (notify/plan.ts); a sync on the laptop reaches the phone.
          const twoDays = new Date(Date.parse(now) - 2 * 86_400_000).toISOString();
          const recent = [...(joy.gradeUpRecent ?? []).filter((g) => g.at > twoDays && !ups.some((u) => u.courseId === g.courseId)), ...ups.map((u) => ({ ...u, at: now }))];
          r.data = { ...r.data, settings: { ...r.data.settings, joy: { ...joy, pending: { turnedIn: (pend.turnedIn ?? 0) + turnedIn, gradeUps: merged, graded: [...(pend.graded ?? []).filter((g) => !graded.some((x) => x.id === g.id)), ...graded], at: now }, gradeUpRecent: recent }, updatedAt: now } };
          r.ops.push({ kind: 'settings' });
        }
        update(() => r.data);
        for (const op of r.ops) mirror(op);
        const batch = diffBatch('Sync', before, r.data.items, now);
        if (batch.count) {
          saveUndo(batch);
          setUndoState(batch);
        }
        // The AI layer listens for this (ingest/auto.ts) and re-reads classes that run on it.
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('sync-applied'));
      },
      dismissTimeAsk() {
        setJustDone(null);
      },
      connectRemote,
      syncNow,
    }),
    [update, mirror, connectRemote, syncNow, replaceAll],
  );

  const value = useMemo<Store>(
    () => ({ data, schedule, derived, nudges, progress, previewAward: previewFor, calibrate, justDone, undo, today, term, courseById, isDark, sync, actions }),
    [data, schedule, derived, nudges, progress, previewFor, calibrate, justDone, undo, today, term, courseById, isDark, sync, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
