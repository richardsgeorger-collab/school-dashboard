/** Syllabus text per class, kept in this browser for the coach to quote. Reference only: never parsed for assignments. */
export interface SyllabusDoc {
  courseId: string;
  name: string;
  text: string;
  chars: number;
  addedAt: string;
}

const DB_NAME = 'school-dashboard-syllabi';
let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('syllabi')) req.result.createObjectStore('syllabi', { keyPath: 'courseId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Could not open the syllabus store'));
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

export const syllabiDb = {
  async put(doc: SyllabusDoc): Promise<void> {
    const db = await open();
    const t = db.transaction('syllabi', 'readwrite');
    t.objectStore('syllabi').put(doc);
    await finished(t);
  },
  async get(courseId: string): Promise<SyllabusDoc | null> {
    const db = await open();
    return (await wait(db.transaction('syllabi').objectStore('syllabi').get(courseId) as IDBRequest<SyllabusDoc | undefined>)) ?? null;
  },
  async list(): Promise<SyllabusDoc[]> {
    const db = await open();
    return wait(db.transaction('syllabi').objectStore('syllabi').getAll() as IDBRequest<SyllabusDoc[]>);
  },
  async remove(courseId: string): Promise<void> {
    const db = await open();
    const t = db.transaction('syllabi', 'readwrite');
    t.objectStore('syllabi').delete(courseId);
    await finished(t);
  },
};
