/**
 * The AI layer's cache: class plans, the term pass, lecture knowledge, cross-class links, study kits. Keyed strings, one
 * store, this browser only. Nothing here is the planner's truth; the planner keeps what the user approved.
 */
const DB_NAME = 'school-dashboard-ai';
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Could not open the AI cache'));
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

interface Row {
  key: string;
  value: unknown;
  at: string;
}

export const aiDb = {
  async get<T>(key: string): Promise<T | null> {
    const db = await open();
    const row = (await wait(db.transaction('kv').objectStore('kv').get(key) as IDBRequest<Row | undefined>)) ?? null;
    return (row?.value as T) ?? null;
  },
  async put(key: string, value: unknown): Promise<void> {
    const db = await open();
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').put({ key, value, at: new Date().toISOString() } satisfies Row);
    await finished(t);
  },
  async remove(key: string): Promise<void> {
    const db = await open();
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').delete(key);
    await finished(t);
  },
  async keys(prefix: string): Promise<string[]> {
    const db = await open();
    const all = await wait(db.transaction('kv').objectStore('kv').getAllKeys() as IDBRequest<IDBValidKey[]>);
    return all.map(String).filter((k) => k.startsWith(prefix));
  },
};

export const LINKS_KEY = 'links';
export const lectureKey = (recordingId: string) => `lecture:${recordingId}`;
export const studyKey = (courseId: string, kind: string, topic: string) => `study:${courseId}:${kind}:${topic.toLowerCase().replace(/\s+/g, '-')}`;
