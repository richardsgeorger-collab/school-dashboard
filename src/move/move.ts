import { CANONICAL_BASE, CANONICAL_ORIGIN, LEGACY_ORIGIN } from '../config/site';

/**
 * Moving a student from the old address to haloplus.app (2026-09-29). Browsers keep each site's storage apart, so a
 * planner, a sign-in, slides, recordings and syllabi saved under the old address are invisible to the new one. The
 * old page opens the new one (one tap, so the browser allows it), and hands everything over with postMessage, which
 * carries files as they are. Only the two Halo+ origins take part, each checking the other's.
 */
export const DBS = ['school-dashboard-recordings', 'school-dashboard-announcements', 'school-dashboard-ai', 'school-dashboard-library', 'school-dashboard-syllabi'];
/** Set on the old address once moved: from then on it forwards straight to the new one. */
export const MOVED_KEY = 'school-dashboard:moved-to';
const OURS = (k: string) => k.startsWith('school-dashboard') || /^sb-[a-z0-9]+-auth-token$/.test(k);

interface StoreDump {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: { name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }[];
  keys: IDBValidKey[];
  values: unknown[];
}
export interface DbDump {
  name: string;
  version: number;
  stores: StoreDump[];
}
export interface MoveDump {
  local: Record<string, string>;
  dbs: DbDump[];
}

const req = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

async function dumpDb(name: string): Promise<DbDump | null> {
  // Opening without a version never creates or upgrades a database; one that did not exist comes back empty.
  const db = await new Promise<IDBDatabase | null>((res) => {
    const r = indexedDB.open(name);
    let created = false;
    r.onupgradeneeded = () => {
      created = true;
    };
    r.onsuccess = () => {
      if (created) {
        r.result.close();
        indexedDB.deleteDatabase(name);
        res(null);
      } else res(r.result);
    };
    r.onerror = () => res(null);
  });
  if (!db) return null;
  const stores: StoreDump[] = [];
  for (const s of Array.from(db.objectStoreNames)) {
    const st = db.transaction(s).objectStore(s);
    const indexes = Array.from(st.indexNames).map((i) => {
      const ix = st.index(i);
      return { name: ix.name, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry };
    });
    const keys = await req(st.getAllKeys());
    const values = await req(db.transaction(s).objectStore(s).getAll());
    stores.push({ name: s, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes, keys, values });
  }
  const out = { name, version: db.version, stores };
  db.close();
  return out;
}

/** Everything this address holds for Halo+. */
export async function dumpAll(): Promise<MoveDump> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && OURS(k) && k !== MOVED_KEY) local[k] = localStorage.getItem(k) ?? '';
  }
  const dbs: DbDump[] = [];
  for (const name of DBS) {
    const d = await dumpDb(name).catch(() => null);
    if (d && d.stores.some((s) => s.values.length > 0)) dbs.push(d);
  }
  return { local, dbs };
}

/** Whether this address holds anything worth moving. */
export function hasLocalData(): boolean {
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !OURS(k) || k === MOVED_KEY || /onboard-wait-ms|story-hold|pixel:|last-seen|seen-level|seen-streak|:tier$/.test(k)) continue;
    // The app writes an empty planner the moment it starts; that is not something to move.
    if (k === 'school-dashboard:v1' && isEmptyPlanner(localStorage.getItem(k) ?? '')) continue;
    return true;
  }
  return false;
}

async function restoreDb(d: DbDump): Promise<void> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(d.name, d.version);
    // The same stores and indexes as the app makes, so the app opens it at the same version with nothing to upgrade.
    r.onupgradeneeded = () => {
      const up = r.result;
      for (const s of d.stores) {
        if (up.objectStoreNames.contains(s.name)) continue;
        const st = up.createObjectStore(s.name, { keyPath: s.keyPath ?? undefined, autoIncrement: s.autoIncrement });
        for (const ix of s.indexes) st.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  for (const s of d.stores) {
    if (!db.objectStoreNames.contains(s.name)) continue;
    const t = db.transaction(s.name, 'readwrite');
    const st = t.objectStore(s.name);
    s.values.forEach((v, i) => (s.keyPath === null ? st.put(v, s.keys[i]) : st.put(v)));
    await new Promise<void>((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  db.close();
}

/** Writes a dump here. What this address already has is kept unless it is empty: a fresh start never wins. */
export async function restoreAll(dump: MoveDump): Promise<{ keys: number; records: number }> {
  let keys = 0;
  for (const [k, v] of Object.entries(dump.local)) {
    const here = localStorage.getItem(k);
    const emptyHere = here === null || (k === 'school-dashboard:v1' && isEmptyPlanner(here));
    if (emptyHere) {
      localStorage.setItem(k, v);
      keys += 1;
    }
  }
  let records = 0;
  for (const d of dump.dbs) {
    await restoreDb(d);
    records += d.stores.reduce((n, s) => n + s.values.length, 0);
  }
  return { keys, records };
}

function isEmptyPlanner(json: string): boolean {
  try {
    const d = JSON.parse(json) as { courses?: unknown[]; items?: unknown[] };
    return !d.courses?.length && !d.items?.length;
  } catch {
    return true;
  }
}

/** Is the new address really up (DNS, HTTPS and the site)? GitHub Pages answers with CORS open, so this can ask. */
export async function newSiteLive(): Promise<boolean> {
  try {
    const r = await fetch(`${CANONICAL_ORIGIN}${CANONICAL_BASE}site.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const j = (await r.json()) as { site?: string };
    return j.site === 'haloplus';
  } catch {
    return false;
  }
}

/** The same place on the new address: the hash (the app's route) carries over. */
export const canonicalHref = (): string => `${CANONICAL_ORIGIN}${CANONICAL_BASE}${window.location.hash || '#/now'}`;

/**
 * The new address's side. Opened by the old page with #/moving: says it is ready, takes the dump from the old
 * origin only, writes it, says done, then opens the app.
 */
export function receiveMove(): void {
  const opener = window.opener as Window | null;
  const status = document.getElementById('root');
  if (status) status.innerHTML = '<p style="font:16px system-ui;padding:32px;text-align:center">Moving your planner to haloplus.app…</p>';
  if (!opener) {
    window.location.replace(`${CANONICAL_BASE}#/now`);
    return;
  }
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== LEGACY_ORIGIN || (e.data as { kind?: string })?.kind !== 'halo-move') return;
    void restoreAll((e.data as { dump: MoveDump }).dump).then(
      (n) => {
        opener.postMessage({ kind: 'halo-move-done', ...n }, LEGACY_ORIGIN);
        window.location.replace(`${CANONICAL_BASE}#/now`);
      },
      (err: unknown) => opener.postMessage({ kind: 'halo-move-failed', why: String(err) }, LEGACY_ORIGIN),
    );
  });
  opener.postMessage({ kind: 'halo-move-ready' }, LEGACY_ORIGIN);
}

/** The old address's side: opens the new one, sends everything once it is ready, waits for done. */
export function sendMove(): Promise<'done' | 'blocked' | 'failed'> {
  return new Promise((resolve) => {
    const w = window.open(`${CANONICAL_ORIGIN}${CANONICAL_BASE}#/moving`, '_blank');
    if (!w) {
      resolve('blocked');
      return;
    }
    let sent = false;
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve('failed');
    }, 60_000);
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== CANONICAL_ORIGIN) return;
      const kind = (e.data as { kind?: string })?.kind;
      if (kind === 'halo-move-ready' && !sent) {
        sent = true;
        void dumpAll().then((dump) => w.postMessage({ kind: 'halo-move', dump }, CANONICAL_ORIGIN));
      } else if (kind === 'halo-move-done' || kind === 'halo-move-failed') {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        if (kind === 'halo-move-done') {
          try {
            localStorage.setItem(MOVED_KEY, new Date().toISOString());
          } catch {
            /* the forward just won't be automatic next time */
          }
        }
        resolve(kind === 'halo-move-done' ? 'done' : 'failed');
      }
    };
    window.addEventListener('message', onMsg);
  });
}
