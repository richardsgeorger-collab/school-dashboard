import { describeAiError } from '../ai/client';
import { mergeNotes, mergeRequirements } from '../domain/requirements';
import type { ClassNote, Course, Item, Requirement } from '../domain/types';
import { routeActions, readActions, type Action } from './actions';
import { announceDb, bodyHash, readLedger, type StoredAnnouncement } from './announce';

/**
 * Every announcement on file, read once each. A class is run from these posts, so the backlog is not a nicety: a
 * requirement posted in week two is still graded in week six, and nothing in the app would otherwise know it exists.
 */

export interface ReadProgress {
  done: number;
  total: number;
  /** The announcement being read, for the line on screen. */
  title: string;
  course: string;
}

export interface AnnouncementResult {
  announcement: StoredAnnouncement;
  course: Course;
  summary: string;
  actions: Action[];
  /** The plain sentence for the reader. */
  error: string | null;
  /** What actually came back: the status and the API's own message. "Could not be read" diagnoses nothing. */
  raw: { status: number | null; message: string } | null;
}

/** The status and message out of an SDK error, without importing the SDK to find out. */
export function rawError(e: unknown): { status: number | null; message: string } {
  const o = (e ?? {}) as Record<string, unknown>;
  const nested = ((o.error as Record<string, unknown>)?.error ?? {}) as Record<string, unknown>;
  const message = String(nested.message ?? o.message ?? e ?? 'unknown').slice(0, 600);
  const status = typeof o.status === 'number' ? o.status : null;
  return { status, message };
}

/** One failure per distinct cause, with how many announcements hit it. 47 of 47 is one problem, not 47. */
export function errorGroups(results: AnnouncementResult[]): { status: number | null; message: string; plain: string; count: number }[] {
  const m = new Map<string, { status: number | null; message: string; plain: string; count: number }>();
  for (const r of results) {
    if (!r.error) continue;
    const key = `${r.raw?.status ?? ''} ${r.raw?.message ?? r.error}`;
    const row = m.get(key) ?? { status: r.raw?.status ?? null, message: r.raw?.message ?? r.error, plain: r.error, count: 0 };
    row.count += 1;
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export interface ReadAllResult {
  results: AnnouncementResult[];
  /** Parts to attach to work that already exists, per item. */
  requirements: Map<string, Requirement[]>;
  /** Class-level findings, per course. */
  notes: Map<string, ClassNote[]>;
  /** Things that create or move rows. They wait for approval. */
  changes: { action: Action; courseId: string; announcement: StoredAnnouncement }[];
  read: number;
  failed: number;
}

const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Forty-seven calls in a row will meet a rate limit sooner or later, and one 429 should not cost an announcement.
 * Retries only what is worth retrying: a rate limit or a server-side wobble, never a rejected key or a bad request.
 */
export async function withRetry<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = nap, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = rawError(e).status;
      const worthRetrying = status === 429 || status === 408 || (status !== null && status >= 500);
      if (!worthRetrying || i === attempts - 1) throw e;
      await sleep(400 * 2 ** i);
    }
  }
  throw last;
}

/** Announcements that have not been read yet, oldest first so the term reads in order. */
export function unread(list: StoredAnnouncement[], courseIds: Set<string>): StoredAnnouncement[] {
  return list.filter((a) => courseIds.has(a.courseId) && a.actionsAt == null).sort((a, b) => String(a.publishedAt ?? '').localeCompare(String(b.publishedAt ?? '')));
}

/**
 * Reads each one in turn. One post per call: they are short, the prompt prefix is cached across them, and a failure
 * costs that post rather than the batch. Nothing is written to the planner here; the caller decides what to keep.
 */
export async function readAllAnnouncements(args: {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  list: StoredAnnouncement[];
  courses: Course[];
  items: Item[];
  tz: string;
  at: string;
  onProgress?: (p: ReadProgress) => void;
  signal?: { stopped: boolean };
  /** Injected so the tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReadAllResult> {
  const byCourse = new Map(args.courses.map((c) => [c.id, c]));
  const out: ReadAllResult = { results: [], requirements: new Map(), notes: new Map(), changes: [], read: 0, failed: 0 };
  const todo = args.list.filter((a) => byCourse.has(a.courseId));
  let n = 0;
  for (const a of todo) {
    if (args.signal?.stopped) break;
    const course = byCourse.get(a.courseId)!;
    n += 1;
    args.onProgress?.({ done: n, total: todo.length, title: a.title || '(untitled)', course: course.code });
    try {
      const r = await withRetry(() => readActions({ apiKey: args.apiKey, fetch: args.fetch, announcement: a, course, items: args.items, tz: args.tz }), args.sleep);
      out.results.push({ announcement: a, course, summary: r.summary, actions: r.actions, error: null, raw: null });
      out.read += 1;
      const routed = routeActions(r.actions, course.id, args.at);
      for (const { itemId, req } of routed.requirements) out.requirements.set(itemId, [...(out.requirements.get(itemId) ?? []), req]);
      for (const { courseId, note } of routed.notes) out.notes.set(courseId, [...(out.notes.get(courseId) ?? []), note]);
      for (const action of routed.changes) out.changes.push({ action, courseId: course.id, announcement: a });
    } catch (e) {
      out.failed += 1;
      out.results.push({ announcement: a, course, summary: '', actions: [], error: await describeAiError(e), raw: rawError(e) });
    }
  }
  return out;
}

/** Writes the half with nothing to approve onto the items and classes it belongs to. */
export function applyReadAll(r: ReadAllResult, items: Item[], courses: Course[]): { items: Item[]; courses: Course[]; attached: number; noted: number } {
  let attached = 0;
  let noted = 0;
  const nextItems = items.map((i) => {
    const add = r.requirements.get(i.id);
    if (!add?.length) return i;
    const merged = mergeRequirements(i.requirements, add);
    attached += merged.length - (i.requirements?.length ?? 0);
    return { ...i, requirements: merged };
  });
  const nextCourses = courses.map((c) => {
    const add = r.notes.get(c.id);
    if (!add?.length) return c;
    const merged = mergeNotes(c.notes, add);
    noted += merged.length - (c.notes?.length ?? 0);
    return { ...c, notes: merged };
  });
  return { items: nextItems, courses: nextCourses, attached, noted };
}

/** Marks what was read, so a second press only reads what is new. */
export async function stampRead(results: AnnouncementResult[], at: string): Promise<void> {
  for (const r of results) {
    if (r.error) continue;
    await readLedger.put({ id: r.announcement.id, hash: bodyHash(r.announcement), at, summary: r.summary, count: r.actions.length });
    await announceDb.put({ ...r.announcement, actionsAt: at, actionsModifiedAt: r.announcement.modifiedAt ?? null, actionsSummary: r.summary, actionCount: r.actions.length });
  }
}

const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

/**
 * What the pass found. A failed read means the contents are unknown, so nothing here may describe them: reporting
 * "nothing asks anything of you" over 47 failures is the same mistake as calling a Halo check clean on a parse error.
 */
export function readAllLine(r: ReadAllResult, attached: number, noted: number): string {
  if (r.failed > 0 && r.read === 0) return `${n(r.failed, 'announcement', 'announcements')} could not be read. I do not know what they ask.`;
  const parts = [n(attached, 'requirement', 'requirements') + ' attached to work you already have'];
  if (r.changes.length) parts.push(`${n(r.changes.length, 'change', 'changes')} to approve`);
  if (noted) parts.push(n(noted, 'class note', 'class notes'));
  const head = `Read ${n(r.read, 'announcement', 'announcements')}: ${parts.join(', ')}.`;
  if (r.failed === 0) return head;
  return `${head} ${n(r.failed, 'announcement', 'announcements')} could not be read, so I do not know what those ask.`;
}

/**
 * True only when every announcement was read and none of them asked anything. The all-clear is the one sentence
 * that must be backed by a complete pass.
 */
export const genuinelyNothing = (r: ReadAllResult, attached: number, noted: number): boolean =>
  r.failed === 0 && r.read > 0 && attached === 0 && noted === 0 && r.changes.length === 0;
