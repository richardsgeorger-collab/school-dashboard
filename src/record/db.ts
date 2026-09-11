import type { LectureNotes } from './notes';
import { FLUSH_MS } from './support';

export type RecordingStatus = 'recording' | 'interrupted' | 'done';

export interface Recording {
  id: string;
  courseId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  status: RecordingStatus;
  durationMs: number;
  bytes: number;
  mimeType: string;
  chunkCount: number;
  segmentCount: number;
  audioDeleted: boolean;
  notes: LectureNotes | null;
  processedAt: string | null;
  /** Mention id → what the user decided in the review screen. */
  review: Record<string, 'approved' | 'dismissed'>;
}

export interface Chunk {
  recordingId: string;
  seq: number;
  /** Milliseconds since the recording started. */
  at: number;
  blob: Blob;
}

export interface Segment {
  recordingId: string;
  seq: number;
  at: number;
  text: string;
}

const DB_NAME = 'school-dashboard-recordings';
const DB_VERSION = 1;
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recordings')) {
        const s = db.createObjectStore('recordings', { keyPath: 'id' });
        s.createIndex('byCourse', 'courseId');
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const s = db.createObjectStore('chunks', { keyPath: ['recordingId', 'seq'] });
        s.createIndex('byRecording', 'recordingId');
      }
      if (!db.objectStoreNames.contains('segments')) {
        const s = db.createObjectStore('segments', { keyPath: ['recordingId', 'seq'] });
        s.createIndex('byRecording', 'recordingId');
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        opening = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Could not open the recordings database'));
    };
    req.onblocked = () => reject(new Error('The recordings database is open in another tab'));
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
    t.onabort = () => rej(t.error ?? new Error('transaction aborted'));
  });

async function tx(stores: string | string[], mode: IDBTransactionMode) {
  const db = await open();
  return db.transaction(stores, mode);
}

async function clearByRecording(store: IDBObjectStore, recordingId: string): Promise<number> {
  const keys = await wait(store.index('byRecording').getAllKeys(recordingId));
  for (const k of keys) store.delete(k);
  return keys.length;
}

export const recordingsDb = {
  async put(r: Recording): Promise<void> {
    const t = await tx('recordings', 'readwrite');
    t.objectStore('recordings').put(r);
    await finished(t);
  },
  async get(id: string): Promise<Recording | null> {
    const t = await tx('recordings', 'readonly');
    return (await wait(t.objectStore('recordings').get(id) as IDBRequest<Recording | undefined>)) ?? null;
  },
  async list(): Promise<Recording[]> {
    const t = await tx('recordings', 'readonly');
    const all = await wait(t.objectStore('recordings').getAll() as IDBRequest<Recording[]>);
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async remove(id: string): Promise<void> {
    const t = await tx(['recordings', 'chunks', 'segments'], 'readwrite');
    t.objectStore('recordings').delete(id);
    await clearByRecording(t.objectStore('chunks'), id);
    await clearByRecording(t.objectStore('segments'), id);
    await finished(t);
  },
  async addChunk(c: Chunk): Promise<void> {
    const t = await tx('chunks', 'readwrite');
    t.objectStore('chunks').put(c);
    await finished(t);
  },
  async chunks(recordingId: string): Promise<Chunk[]> {
    const t = await tx('chunks', 'readonly');
    const all = await wait(t.objectStore('chunks').index('byRecording').getAll(recordingId) as IDBRequest<Chunk[]>);
    return all.sort((a, b) => a.seq - b.seq);
  },
  /** Drop the audio, keep the transcript. */
  async deleteAudio(id: string): Promise<void> {
    const t = await tx(['chunks', 'recordings'], 'readwrite');
    await clearByRecording(t.objectStore('chunks'), id);
    const r = (await wait(t.objectStore('recordings').get(id) as IDBRequest<Recording | undefined>)) ?? null;
    if (r) t.objectStore('recordings').put({ ...r, audioDeleted: true, bytes: 0, chunkCount: 0 });
    await finished(t);
  },
  async addSegment(s: Segment): Promise<void> {
    const t = await tx('segments', 'readwrite');
    t.objectStore('segments').put(s);
    await finished(t);
  },
  async segments(recordingId: string): Promise<Segment[]> {
    const t = await tx('segments', 'readonly');
    const all = await wait(t.objectStore('segments').index('byRecording').getAll(recordingId) as IDBRequest<Segment[]>);
    return all.sort((a, b) => a.seq - b.seq);
  },
  /** One playable file: WebM chunks from a single MediaRecorder concatenate cleanly. */
  async audioBlob(id: string, mimeType: string): Promise<Blob | null> {
    const cs = await this.chunks(id);
    return cs.length ? new Blob(cs.map((c) => c.blob), { type: mimeType }) : null;
  },
  async estimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      const e = await navigator.storage?.estimate();
      return e && e.quota ? { usage: e.usage ?? 0, quota: e.quota } : null;
    } catch {
      return null;
    }
  },
  /** Ask the browser not to evict this site's storage under pressure. */
  async persist(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  },
};

/**
 * A recording still marked "recording" on load was cut off by a closed tab or a crash.
 * Mark it interrupted with what was flushed; the audio and transcript up to the last flush are intact.
 */
export async function recoverInterrupted(): Promise<Recording[]> {
  const all = await recordingsDb.list();
  for (const r of all.filter((x) => x.status === 'recording')) {
    const cs = await recordingsDb.chunks(r.id);
    const sg = await recordingsDb.segments(r.id);
    const last = cs[cs.length - 1];
    const durationMs = last ? last.at + FLUSH_MS : r.durationMs;
    await recordingsDb.put({
      ...r,
      status: 'interrupted',
      durationMs,
      bytes: cs.reduce((n, c) => n + c.blob.size, 0),
      chunkCount: cs.length,
      segmentCount: sg.length,
      endedAt: r.endedAt ?? new Date(new Date(r.startedAt).getTime() + durationMs).toISOString(),
    });
  }
  return (await recordingsDb.list()).filter((r) => r.status === 'interrupted');
}
