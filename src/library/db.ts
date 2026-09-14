import type { DateStr } from '../domain/types';

export interface Deck {
  id: string;
  courseId: string;
  title: string;
  /** Topic or week, free text, e.g. "Topic 3" or "Week 5". */
  tag: string;
  /** The lecture date the deck belongs to. */
  date: DateStr;
  fileName: string;
  kind: 'pdf' | 'pptx';
  mimeType: string;
  bytes: number;
  pages: number;
  chars: number;
  addedAt: string;
  recordingId: string | null;
  fileDeleted: boolean;
}

export interface DeckPage {
  deckId: string;
  n: number;
  text: string;
}

const DB_NAME = 'school-dashboard-library';
let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: ['deckId', 'n'] }).createIndex('byDeck', 'deckId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Could not open the library store'));
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
async function clearPages(store: IDBObjectStore, deckId: string) {
  const keys = await wait(store.index('byDeck').getAllKeys(deckId));
  for (const k of keys) store.delete(k);
}

export const libraryDb = {
  async putDeck(d: Deck): Promise<void> {
    const db = await open();
    const t = db.transaction('decks', 'readwrite');
    t.objectStore('decks').put(d);
    await finished(t);
  },
  async getDeck(id: string): Promise<Deck | null> {
    const db = await open();
    return (await wait(db.transaction('decks').objectStore('decks').get(id) as IDBRequest<Deck | undefined>)) ?? null;
  },
  async listDecks(): Promise<Deck[]> {
    const db = await open();
    const all = await wait(db.transaction('decks').objectStore('decks').getAll() as IDBRequest<Deck[]>);
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.addedAt.localeCompare(a.addedAt));
  },
  async removeDeck(id: string): Promise<void> {
    const db = await open();
    const t = db.transaction(['decks', 'files', 'pages'], 'readwrite');
    t.objectStore('decks').delete(id);
    t.objectStore('files').delete(id);
    await clearPages(t.objectStore('pages'), id);
    await finished(t);
  },
  async putFile(id: string, blob: Blob): Promise<void> {
    const db = await open();
    const t = db.transaction('files', 'readwrite');
    t.objectStore('files').put({ id, blob });
    await finished(t);
  },
  async getFile(id: string): Promise<Blob | null> {
    const db = await open();
    const row = await wait(db.transaction('files').objectStore('files').get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>);
    return row?.blob ?? null;
  },
  /** Drop the file, keep the text. */
  async deleteFile(id: string): Promise<void> {
    const db = await open();
    const t = db.transaction(['files', 'decks'], 'readwrite');
    t.objectStore('files').delete(id);
    const d = (await wait(t.objectStore('decks').get(id) as IDBRequest<Deck | undefined>)) ?? null;
    if (d) t.objectStore('decks').put({ ...d, fileDeleted: true, bytes: 0 });
    await finished(t);
  },
  async putPages(deckId: string, pages: string[]): Promise<void> {
    const db = await open();
    const t = db.transaction('pages', 'readwrite');
    const s = t.objectStore('pages');
    await clearPages(s, deckId);
    pages.forEach((text, i) => s.put({ deckId, n: i + 1, text }));
    await finished(t);
  },
  async pages(deckId: string): Promise<DeckPage[]> {
    const db = await open();
    const all = await wait(db.transaction('pages').objectStore('pages').index('byDeck').getAll(deckId) as IDBRequest<DeckPage[]>);
    return all.sort((a, b) => a.n - b.n);
  },
  async allPages(): Promise<DeckPage[]> {
    const db = await open();
    return wait(db.transaction('pages').objectStore('pages').getAll() as IDBRequest<DeckPage[]>);
  },
};
