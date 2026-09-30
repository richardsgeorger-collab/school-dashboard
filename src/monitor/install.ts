import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { report } from './report';

/**
 * Uncaught errors and rejected promises anywhere in the app, reported once each (report() rate-limits). The render
 * errors a boundary catches are reported by the boundary itself (components/ErrorBoundary.tsx).
 */
export function installErrorMonitor(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    // A script or image that failed to load fires here without an error object: not a crash of ours.
    if (!e.error && !e.message) return;
    const err = e.error instanceof Error ? e.error : null;
    if (isChunkError(err ?? e.message)) return;
    report({ kind: 'crash', title: `Uncaught error: ${firstLine(err?.message ?? e.message)}`, message: err?.message ?? e.message, stack: err?.stack });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    const err = r instanceof Error ? r : null;
    const message = err?.message ?? (typeof r === 'string' ? r : JSON.stringify(r ?? null));
    if (isChunkError(message) || /AbortError|The user aborted|Load failed$/i.test(message)) return;
    report({ kind: 'rejection', title: `Unhandled promise rejection: ${firstLine(message)}`, message, stack: err?.stack });
  });
}

const firstLine = (s: string) => s.split('\n')[0].slice(0, 100);

/** The browser's words for "that code file is gone": a new version was deployed while this tab was open. */
export function isChunkError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(m);
}

const RELOAD_KEY = 'school-dashboard:chunk-reload';
const loaders: (() => Promise<unknown>)[] = [];

/** The server answers (a real missing file after a deploy) or not (offline, a dead network): never reload into nothing. */
async function reachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const r = await fetch(`${window.location.pathname.replace(/[^/]*$/, '')}site.json?probe=${Date.now()}`, { cache: 'no-store' });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

/** Resolves when the browser says it is back online (or after a while, to try again). */
const backOnline = () =>
  new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener('online', done);
      resolve();
    };
    window.addEventListener('online', done);
    setTimeout(done, 20_000);
  });

/** "You're offline" while a screen waits for the network, read by the Suspense fallback (ScreenLoading). */
export const offlineWait = { on: false, listeners: new Set<() => void>() };
const setOfflineWait = (on: boolean) => {
  offlineWait.on = on;
  offlineWait.listeners.forEach((l) => l());
};

/**
 * A screen loaded on first open. After a deploy, a tab opened before it asks for code files the deploy removed and the
 * whole app showed "This screen could not draw" until a reload (George, 2026-09-30: "20% of the time"). Now that one
 * failure reloads the page once, onto the new version, where the file exists: but only when the server is reachable.
 * Offline the same failure waits for the network instead (a reload offline is a blank page), and the screen opens when
 * it is back. Only a second failure with the server reachable reaches the error screen (and the report).
 */
export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  loaders.push(load);
  const attempt = (): Promise<{ default: T }> =>
    load().catch(async (err: unknown) => {
      if (!isChunkError(err)) throw err;
      if (!(await reachable())) {
        setOfflineWait(true);
        await backOnline();
        setOfflineWait(false);
        return attempt();
      }
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      } catch {
        /* storage off: reload anyway, once per page */
      }
      if (Date.now() - last > 60_000) {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        } catch {
          /* nothing */
        }
        window.location.reload();
        return new Promise<{ default: T }>(() => undefined);
      }
      report({ kind: 'crash', title: 'A screen failed to load even after reloading', message: err instanceof Error ? err.message : String(err) });
      throw err;
    });
  return lazy(attempt);
}

/**
 * Every screen's code, fetched quietly a few seconds after the app opens, so moving between screens later works
 * offline and never waits (skipped on a data-saving connection).
 */
export function prefetchScreens(): void {
  if (typeof window === 'undefined') return;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData || navigator.onLine === false) return;
  const run = () => loaders.forEach((l) => void l().catch(() => undefined));
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  setTimeout(() => (idle ? idle(run, { timeout: 5000 }) : run()), 4000);
}
