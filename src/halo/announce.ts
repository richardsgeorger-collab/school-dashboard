import { callTool, arr, confidence, isoDate, num, obj, str, type ToolSpec } from '../ai/client';
import { dateOf, fmtDate } from '../domain/dates';
import type { Course, DateStr, Item } from '../domain/types';
import type { Confidence, Mention, MentionKind } from '../record/notes';
import { stripHtml } from './normalize';
import type { HaloAlert, HaloAnnouncement, HaloExport, HaloMessage, HaloResource } from './types';

/**
 * Announcements, kept because at GCU the week's real work is often posted here and never reaches the gradebook.
 * Stored whole per class, newest first, read by the same machinery as a lecture: findings become mentions that go
 * through the existing diff and approval flow, each citing the announcement it came from.
 */
export interface StoredAnnouncement extends HaloAnnouncement {
  /** When the action pass last read this post. Null means it has never been read. */
  actionsAt?: string | null;
  /** What that pass said it asks of the student. */
  actionsSummary?: string | null;
  /** How many actionable things came out of it. */
  actionCount?: number | null;
  courseId: string;
  /** The body as readable text, markup gone. */
  text: string;
  /** When it was first pulled here. */
  pulledAt: string;
  /** When the student read it in this app; null means it is still new. */
  readAt: string | null;
  /** When the AI pass last read it, and what it found. */
  processedAt: string | null;
  findings: Mention[] | null;
  /** What the student decided about each finding. */
  review: Record<string, 'approved' | 'dismissed'>;
}

/** A direct message from the instructor, stored the same way an announcement is: it is as load-bearing. */
export interface StoredMessage extends HaloMessage {
  courseId: string;
  text: string;
  readAt: string | null;
}

export interface StoredResource extends HaloResource {
  courseId: string;
  pulledAt: string;
}

const DB_NAME = 'school-dashboard-announcements';
let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('posts')) db.createObjectStore('posts', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      if (!db.objectStoreNames.contains('messages')) db.createObjectStore('messages', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      if (!db.objectStoreNames.contains('resources')) db.createObjectStore('resources', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      if (!db.objectStoreNames.contains('alerts')) db.createObjectStore('alerts', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Could not open the announcement store'));
    };
  });
  return opening;
}
const wait = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
const finished = (t: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });

export const announceDb = {
  async list(): Promise<StoredAnnouncement[]> {
    const db = await open();
    const all = await wait(db.transaction('posts').objectStore('posts').getAll() as IDBRequest<StoredAnnouncement[]>);
    return all.sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));
  },
  async get(id: string): Promise<StoredAnnouncement | null> {
    const db = await open();
    return (await wait(db.transaction('posts').objectStore('posts').get(id) as IDBRequest<StoredAnnouncement | undefined>)) ?? null;
  },
  async put(a: StoredAnnouncement): Promise<void> {
    const db = await open();
    const t = db.transaction('posts', 'readwrite');
    t.objectStore('posts').put(a);
    await finished(t);
  },
  async removeCourse(courseId: string): Promise<number> {
    const db = await open();
    const t = db.transaction('posts', 'readwrite');
    const store = t.objectStore('posts');
    const keys = await wait(store.index('byCourse').getAllKeys(courseId));
    for (const k of keys) store.delete(k);
    await finished(t);
    return keys.length;
  },
};

/** What came out of a sync, merged with what is already stored: the body is refreshed, the reading is kept. */
export function mergeAnnouncement(incoming: HaloAnnouncement, courseId: string, existing: StoredAnnouncement | null, now: string): StoredAnnouncement {
  const text = stripHtml(incoming.content, 20_000);
  const changed = !!existing && (existing.text !== text || existing.title !== incoming.title);
  return {
    ...incoming,
    courseId,
    text,
    pulledAt: existing?.pulledAt ?? now,
    // An edited announcement is new again: the change is usually the point.
    readAt: changed ? null : (existing?.readAt ?? null),
    processedAt: changed ? null : (existing?.processedAt ?? null),
    findings: changed ? null : (existing?.findings ?? null),
    review: changed ? {} : (existing?.review ?? {}),
  };
}

/** Messages, resources, and Halo's own alert feed, stored the same way announcements are. */
export async function saveExtras(payload: HaloExport, courseIdOf: (classId: string, courseCode: string) => string | null, now = new Date().toISOString()): Promise<{ messages: number; resources: number; alerts: number }> {
  let messages = 0;
  let resources = 0;
  for (const c of payload.classes) {
    const courseId = courseIdOf(c.id, c.courseCode);
    if (!courseId) continue;
    for (const m of c.messages ?? []) {
      const text = stripHtml(m.content, 8000);
      if (!text.trim()) continue;
      await announceStores.putMessage({ ...m, courseId, text, readAt: m.fromInstructor ? null : now });
      messages++;
    }
    // Resources are a snapshot of what the class publishes, so they are replaced rather than merged.
    if (c.resources) {
      await announceStores.replaceResources(courseId, c.resources.map((r) => ({ ...r, courseId, pulledAt: now })));
      resources += c.resources.length;
    }
  }
  if (payload.alerts?.length) await announceStores.putAlerts(payload.alerts);
  return { messages, resources, alerts: payload.alerts?.length ?? 0 };
}

/** Everything the export carried, stored per class. Returns how many are new to this device. */
export async function saveAnnouncements(payload: HaloExport, courseIdOf: (classId: string, courseCode: string) => string | null, now = new Date().toISOString()): Promise<{ saved: number; fresh: number }> {
  let saved = 0;
  let fresh = 0;
  for (const c of payload.classes) {
    const courseId = courseIdOf(c.id, c.courseCode);
    if (!courseId || !c.announcements?.length) continue;
    for (const a of c.announcements) {
      const existing = await announceDb.get(a.id).catch(() => null);
      const merged = mergeAnnouncement(a, courseId, existing, now);
      if (!existing) fresh++;
      await announceDb.put(merged);
      saved++;
    }
  }
  return { saved, fresh };
}

export const announceStores = {
  async messages(): Promise<StoredMessage[]> {
    const db = await open();
    const all = await wait(db.transaction('messages').objectStore('messages').getAll() as IDBRequest<StoredMessage[]>);
    return all.sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));
  },
  async resources(): Promise<StoredResource[]> {
    const db = await open();
    return wait(db.transaction('resources').objectStore('resources').getAll() as IDBRequest<StoredResource[]>);
  },
  async alerts(): Promise<HaloAlert[]> {
    const db = await open();
    const all = await wait(db.transaction('alerts').objectStore('alerts').getAll() as IDBRequest<HaloAlert[]>);
    return all.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  },
  async putMessage(m: StoredMessage): Promise<void> {
    const db = await open();
    const t = db.transaction('messages', 'readwrite');
    t.objectStore('messages').put(m);
    await finished(t);
  },
  async replaceResources(courseId: string, list: StoredResource[]): Promise<void> {
    const db = await open();
    const t = db.transaction('resources', 'readwrite');
    const store = t.objectStore('resources');
    for (const k of await wait(store.index('byCourse').getAllKeys(courseId))) store.delete(k);
    for (const r of list) store.put(r);
    await finished(t);
  },
  async putAlerts(list: HaloAlert[]): Promise<void> {
    const db = await open();
    const t = db.transaction('alerts', 'readwrite');
    for (const a of list) t.objectStore('alerts').put(a);
    await finished(t);
  },
};

export const isUnread = (a: StoredAnnouncement): boolean => a.readAt === null;

/** One quiet line for Now, or null. Never a count of things that are merely old. */
export function unreadLine(list: StoredAnnouncement[], courses: Course[], tz: string): { text: string; first: StoredAnnouncement } | null {
  const unread = list.filter(isUnread);
  if (unread.length === 0) return null;
  const first = unread[0];
  const code = courses.find((c) => c.id === first.courseId)?.code ?? '';
  const when = first.publishedAt ? fmtDate(dateOf(first.publishedAt, tz), 'short') : '';
  const rest = unread.length - 1;
  return { text: `${code} posted "${first.title}"${when ? ` on ${when}` : ''}${rest > 0 ? `, and ${rest} more announcement${rest === 1 ? '' : 's'} you have not read` : ''}.`, first };
}

// ---- The AI pass: what an announcement changes, in the planner's own terms --------------------------------

export const ANNOUNCE_TOOL: ToolSpec = {
  name: 'announcement_findings',
  description: 'What one announcement changes about a student’s work: new work, moved dates, cancellations, prerequisites, what to prepare, exam scope.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'findings'],
    properties: {
      summary: { type: 'string', description: 'What this announcement is telling the student, in one or two plain sentences. Not a restatement: the part that changes what they do.' },
      findings: {
        type: 'array',
        description: 'One entry per thing that changes what the student does. Empty when the announcement is only news.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'title', 'date', 'time', 'points', 'quote', 'confidence', 'item_id', 'note'],
          properties: {
            kind: { type: 'string', description: 'new for work that is not in the gradebook, date_change when something moves, cancel when something is dropped, info for exam scope, what to prepare, or a prerequisite that is not its own task.' },
            title: { type: 'string', description: 'What it is about, as the announcement names it.' },
            date: { type: 'string', description: 'YYYY-MM-DD when the announcement gives one, resolved against its posting date. Empty when it does not. Never invent a date.' },
            time: { type: 'string', description: 'HH:mm in 24-hour time when stated, else empty.' },
            points: { type: 'integer', description: '0 when not stated.' },
            quote: { type: 'string', description: 'The announcement’s own words, verbatim, that say this.' },
            confidence: { type: 'string', description: 'high, medium, or low.' },
            item_id: { type: 'string', description: 'The planner item id from the list given when this is about one of them, else empty.' },
            note: { type: 'string', description: 'What the student should do about it, one short line. For exam scope or preparation, what to study or bring.' },
          },
        },
      },
    },
  },
};

export const ANNOUNCE_SYSTEM = `You read one announcement from a college class and say what it changes about the student's work. Professors post the week's real instructions here, and much of it never reaches the gradebook.

Rules:
- A finding is something that changes what the student does: work that is not in their planner, a deadline that moved, something cancelled, something that has to happen before something else, what to bring or prepare for the next class, or what an exam will cover.
- Quote the announcement's own words for every finding. If you cannot quote it, it is not a finding.
- Resolve "Friday" and "next week" against the date the announcement was posted, which is given. Never invent a date: leave it empty and say so in the note.
- When a finding is about an item in the planner list given, set item_id to that id.
- News with nothing to do — office hours moved, a welcome message, encouragement — produces a summary and no findings. An empty findings list is the right answer more often than not.
- Plain words. The note says what to do, not what the announcement said.
Answer only through the announcement_findings tool.`;

const KINDS: MentionKind[] = ['new', 'date_change', 'cancel', 'info'];
const CONF: Confidence[] = ['high', 'medium', 'low'];

export function buildAnnouncePrompt(a: StoredAnnouncement, course: Course, items: Item[], tz: string): { system: { text: string; cache?: boolean }[]; user: string } {
  const open = items
    .filter((i) => i.courseId === course.id && i.status !== 'done')
    .sort((a2, b) => a2.dueAt.localeCompare(b.dueAt))
    .slice(0, 60)
    .map((i) => `${i.id} · ${i.label} · ${i.title} · due ${fmtDate(dateOf(i.dueAt, tz), 'short')}`)
    .join('\n');
  const posted = a.publishedAt ? dateOf(a.publishedAt, tz) : 'unknown';
  return {
    system: [{ text: ANNOUNCE_SYSTEM, cache: true }],
    user: `Class: ${course.code} ${course.name}\nPosted: ${posted}${a.author ? ` by ${a.author}` : ''}\nTitle: ${a.title}\n\nPlanner items already tracked (id · label · title · due):\n${open || '(none)'}\n\nThe announcement:\n"""\n${a.text.slice(0, 20_000)}\n"""`,
  };
}

export interface AnnounceRead {
  summary: string;
  findings: Mention[];
}

export function announceFromTool(raw: unknown, a: StoredAnnouncement, items: Item[]): AnnounceRead {
  const o = obj(raw);
  const ids = new Set(items.map((i) => i.id));
  const findings: Mention[] = [];
  for (const e of arr(o.findings)) {
    const x = obj(e);
    const quote = str(x.quote, 500);
    const title = str(x.title, 120);
    if (!quote || !title) continue;
    const kind = str(x.kind, 20) as MentionKind;
    const points = num(x.points);
    const itemId = str(x.item_id, 60);
    const time = str(x.time, 5);
    findings.push({
      id: `an${findings.length + 1}`,
      quote,
      title,
      kind: KINDS.includes(kind) ? kind : 'info',
      date: isoDate(str(x.date, 12)),
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null,
      points: points !== null && points > 0 ? Math.round(points) : null,
      confidence: (CONF.includes(confidence(x.confidence)) ? confidence(x.confidence) : 'low') as Confidence,
      itemId: ids.has(itemId) ? itemId : null,
      courseId: a.courseId,
      note: str(x.note, 240),
    });
  }
  return { summary: str(o.summary, 400), findings: findings.slice(0, 12) };
}

export async function readAnnouncement(args: { apiKey: string; fetch?: typeof globalThis.fetch; announcement: StoredAnnouncement; course: Course; items: Item[]; tz: string }): Promise<AnnounceRead> {
  const prompt = buildAnnouncePrompt(args.announcement, args.course, args.items, args.tz);
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'announcement', system: prompt.system, user: prompt.user, tool: ANNOUNCE_TOOL, maxTokens: 3000 });
  return announceFromTool(r.input, args.announcement, args.items);
}

/** Announcements as search documents, alongside slides, transcripts, and syllabi. */
export const asSearchDocs = (list: StoredAnnouncement[]) =>
  list.map((a) => ({ kind: 'announcement' as const, courseId: a.courseId, refId: a.id, title: a.title, n: null, date: a.publishedAt, text: a.text }));

/** The block the tutor and the coach read: the recent announcements for one class, newest first. */
export function announceContext(list: StoredAnnouncement[], courseId: string, tz: string, max = 6): string {
  const mine = list.filter((a) => a.courseId === courseId).slice(0, max);
  if (mine.length === 0) return '';
  return mine.map((a) => `[${a.publishedAt ? fmtDate(dateOf(a.publishedAt, tz), 'short') : '?'}] ${a.title}\n${a.text.slice(0, 1200)}`).join('\n\n');
}

/** The newest announcement per class, for the freshness line. */
export function newestByCourse(list: StoredAnnouncement[]): Record<string, DateStr | undefined> {
  const out: Record<string, DateStr | undefined> = {};
  for (const a of list) if (a.publishedAt && !out[a.courseId]) out[a.courseId] = a.publishedAt.slice(0, 10);
  return out;
}
