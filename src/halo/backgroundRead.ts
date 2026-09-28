import { useEffect, useRef, useSyncExternalStore } from 'react';
import { describeAiError } from '../ai/client';
import { costOf, loadPrices, type ApiUsage } from '../ai/usage';
import { useAccount } from '../auth/AccountContext';
import { aiAvailable, loadApiKey } from '../chat/key';
import { can } from '../config/flags';
import type { Course, Item } from '../domain/types';
import { SYNC_EVENT } from '../ingest/auto';
import { ACCOUNT_SYNCED_EVENT, useStore } from '../storage/store';
import { readActions } from './actions';
import { announceDb, bodyHash, healEntries, readLedger, type ReadEntry, type StoredAnnouncement } from './announce';
import { pushLedgerEntry, syncLedger } from './ledgerSync';
import { syncPosts } from './postsSync';
import { emptyOutcome, groupFailures, needsRead, planFromActions, readReason, type AutoOutcome, type AutoPlan } from './autoRead';
import { withRetry } from './readAll';
import { readGuard } from './readCost';

/**
 * Announcements are read in the background, by the app, not by the review sheet. The sheet used to own the loop,
 * so closing it mid-way lost the run, and the large-run question it asked was lost with it: real data showed a
 * student with 56 of 58 posts never read across every sync. Now a sync fires an event, this runner picks it up
 * whenever the app is open, the question (when there is one) waits here until it is answered, and every screen
 * can show where the run is.
 */
export interface ReadStatus {
  running: boolean;
  progress: { done: number; total: number; title: string; why: string } | null;
  outcome: AutoOutcome | null;
  /** A run that stopped to ask, with what it would cost. Answered with readBacklog({ approved: true }). */
  waiting: { count: number; line: string } | null;
  at: string | null;
}

/** Fired when a background read finishes, so the Inbox and Now can refresh. Never re-triggers a read. */
export const READ_EVENT = 'announcements-read';

let status: ReadStatus = { running: false, progress: null, outcome: null, waiting: null, at: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<ReadStatus>) => {
  status = { ...status, ...patch };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useReadStatus = (): ReadStatus => useSyncExternalStore(subscribe, () => status);
export const readStatusNow = (): ReadStatus => status;

interface Args {
  items: Item[];
  courses: Course[];
  tier: Parameters<typeof can>[1];
  tz: string;
  upsertItem: (i: Item) => void;
  upsertCourse: (c: Course) => void;
  approved?: boolean;
}

/**
 * Reads every post on file that has no ledger entry (or whose words changed), applies what it finds, and stamps
 * the ledger only after a successful read. Returns the outcome, or null when it stopped to ask or had nothing to do.
 */
export async function readBacklog(args: Args): Promise<AutoOutcome | null> {
  if (status.running) return null;
  const ids = new Set(args.courses.map((c) => c.id));
  // The account's posts and its read ledger come here first, so the phone shows the laptop's Inbox without a sync of
  // its own and never re-reads what the laptop read.
  const arrived = await syncPosts(ids).catch(() => 0);
  await syncLedger().catch(() => 0);
  if (arrived > 0 && typeof window !== 'undefined') window.dispatchEvent(new Event(READ_EVENT));
  const onFile = (await announceDb.list().catch(() => [] as StoredAnnouncement[])).filter((a) => ids.has(a.courseId));
  let ledger: Map<string, ReadEntry>;
  try {
    ledger = await readLedger.all();
  } catch (e) {
    const outcome = { ...emptyOutcome(), ledgerError: e instanceof Error ? e.message : String(e) };
    set({ outcome, waiting: null, at: new Date().toISOString() });
    return outcome;
  }
  for (const h of healEntries(onFile, ledger)) {
    await readLedger.put(h).catch(() => undefined);
    ledger.set(h.id, h);
  }
  const todo = needsRead(onFile, ids, ledger);
  if (todo.length === 0) {
    set({ waiting: null });
    return null;
  }
  const guard = readGuard({ todo: todo.length, onFile: onFile.length, fresh: todo.filter((a) => !ledger.has(a.id)).length, edited: todo.filter((a) => ledger.has(a.id)).length });
  if (!args.approved && guard.ask) {
    set({ waiting: { count: todo.length, line: guard.line } });
    return null;
  }
  if (!aiAvailable() || !can('announcementAI', args.tier)) {
    const outcome = { ...emptyOutcome(), todo: todo.length, noKey: !aiAvailable(), locked: !can('announcementAI', args.tier) };
    set({ outcome, waiting: null, at: new Date().toISOString() });
    return outcome;
  }

  set({ running: true, waiting: null, progress: { done: 0, total: todo.length, title: '', why: '' } });
  const key = loadApiKey() || undefined;
  const at = new Date().toISOString();
  const total: AutoPlan = { upserts: [], courses: [], added: [], moved: [], attached: 0, noted: 0, updated: [], needsApproval: [] };
  const spend = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let failed = 0;
  let read = 0;
  const why: string[] = [];
  let items = args.items;
  let courses = args.courses;
  // The model calls overlap, a few at a time; the plans apply strictly in order, so two posts that touch the same
  // assignment never race. A prefetched call that fails is caught here and counted when its turn comes.
  type Got = { ok: true; r: Awaited<ReturnType<typeof readActions>> } | { ok: false; e: unknown };
  const pending = new Map<number, Promise<Got | null>>();
  const start = (n: number) => {
    if (n >= todo.length || pending.has(n)) return;
    const a = todo[n];
    const course = courses.find((c) => c.id === a.courseId);
    pending.set(n, course ? withRetry(() => readActions({ apiKey: key, announcement: a, course, items, tz: args.tz })).then((r): Got => ({ ok: true, r }), (e: unknown): Got => ({ ok: false, e })) : Promise.resolve(null));
  };
  try {
    for (let n = 0; n < todo.length; n++) {
      for (let k = n; k < Math.min(todo.length, n + LOOKAHEAD); k++) start(k);
      const a = todo[n];
      const course = courses.find((c) => c.id === a.courseId);
      const got = await pending.get(n);
      pending.delete(n);
      if (!course || !got) continue;
      set({ progress: { done: n + 1, total: todo.length, title: a.title || '(untitled)', why: readReason(a) } });
      try {
        if (!got.ok) throw got.e;
        const r = got.r;
        const p = planFromActions({ actions: r.actions, announcement: a, course, items, courses, now: at });
        for (const i of p.upserts) {
          args.upsertItem(i);
          items = [...items.filter((x) => x.id !== i.id), i];
        }
        for (const c of p.courses) {
          args.upsertCourse(c);
          courses = courses.map((x) => (x.id === c.id ? c : x));
        }
        total.added.push(...p.added);
        total.moved.push(...p.moved);
        total.attached += p.attached;
        total.noted += p.noted;
        total.updated.push(...p.updated);
        total.needsApproval.push(...p.needsApproval);
        const u = r.usage as ApiUsage | undefined;
        if (u) {
          spend.calls += 1;
          spend.input += u.input_tokens ?? 0;
          spend.output += u.output_tokens ?? 0;
          spend.cacheRead += u.cache_read_input_tokens ?? 0;
          spend.cacheWrite += u.cache_creation_input_tokens ?? 0;
        }
        read += 1;
        // The ledger entry is what stops this post being read again; it is written only after a read succeeds.
        const entry: ReadEntry = { id: a.id, hash: bodyHash(a), at, summary: r.summary, count: r.actions.length };
        await readLedger.put(entry);
        void pushLedgerEntry(entry).catch(() => undefined);
        await announceDb.put({ ...a, actionsAt: at, actionsModifiedAt: a.modifiedAt ?? null, actionsSummary: r.summary, actionCount: r.actions.length });
      } catch (e) {
        // A post that could not be read is left unstamped, so the next run tries it again.
        failed += 1;
        why.push(await describeAiError(e));
      }
    }
  } finally {
    const outcome: AutoOutcome = { todo: todo.length, read, failed, noKey: false, failures: groupFailures(why), cost: costOf(spend, loadPrices()), plan: total };
    set({ running: false, progress: null, outcome, at: new Date().toISOString() });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(READ_EVENT));
  }
  return status.outcome;
}

/** Model calls in flight at once. Three keeps a 56-post first read to about a minute without racing the plans. */
const LOOKAHEAD = 3;

const SETTLE_MS = 900;
const FIRST_MS = 1500;

/** Mounted once in the app: reads the backlog after a sync lands, and once on open in case a run was interrupted. */
export function useBackgroundRead(): void {
  const { data, actions } = useStore();
  const { tier } = useAccount();
  const latest = useRef({ data, actions, tier });
  latest.current = { data, actions, tier };
  useEffect(() => {
    let timer: number | null = null;
    const run = () => {
      const { data: d, actions: a, tier: t } = latest.current;
      if (d.courses.length === 0) return;
      void readBacklog({ items: d.items, courses: d.courses, tier: t, tz: d.settings.timezone, upsertItem: a.upsertItem, upsertCourse: a.upsertCourse });
    };
    const later = (ms: number) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(run, ms);
    };
    const onSync = () => later(SETTLE_MS);
    window.addEventListener(SYNC_EVENT, onSync);
    // A fresh device: the on-open run fires before the account's classes have arrived, so it runs again once they have.
    window.addEventListener(ACCOUNT_SYNCED_EVENT, onSync);
    later(FIRST_MS);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener(ACCOUNT_SYNCED_EVENT, onSync);
      if (timer) window.clearTimeout(timer);
    };
  }, []);
  // The profile lands after the first run on a slow connection, and a run that saw Free left the backlog marked
  // "part of Pro" until the next Halo sync. When the plan turns out to read, run again.
  const canRead = can('announcementAI', tier);
  useEffect(() => {
    if (!canRead) return;
    const { data: d, actions: a, tier: t } = latest.current;
    if (d.courses.length === 0) return;
    const timer = window.setTimeout(() => void readBacklog({ items: d.items, courses: d.courses, tier: t, tz: d.settings.timezone, upsertItem: a.upsertItem, upsertCourse: a.upsertCourse }), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [canRead]);
}
