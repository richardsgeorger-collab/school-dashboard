import { APP_VERSION } from './report';

/**
 * An open Halo+ tab takes a new build by itself (George, 2026-10-09: he only got a fix after a hard reload, and
 * students will not know to). The build writes its version to version.txt; this asks for it now and then, and when
 * it differs, reloads at a quiet moment: nothing open over the page, nothing being typed, the tab in view.
 */
const SEEN_KEY = 'school-dashboard:update-seen';
const EVERY = 10 * 60_000;
const QUIET_EVERY = 15_000;

/** A served version that is real and not this one. Development, test and prerender builds never reload. */
export function newerVersion(current: string, served: string | null | undefined): boolean {
  const s = (served ?? '').trim();
  if (!s || s.length > 40 || !/^[\w.-]+$/.test(s)) return false;
  if (current === 'dev' || current === 'test' || current === 'prerender' || current === 'local') return false;
  return s !== current;
}

/** Nothing would be lost by reloading right now. */
export function quietMoment(doc: Pick<Document, 'visibilityState' | 'querySelector' | 'activeElement'>): boolean {
  if (doc.visibilityState !== 'visible') return false;
  if (doc.querySelector('.modal-backdrop, .onboard, [role="dialog"]')) return false;
  const a = doc.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable)) return false;
  return true;
}

/**
 * Leaving the tab is also a quiet moment, whatever is open on it (George's tab sat on an old build all evening behind an
 * open sheet, 2026-10-12): it reloads while nobody is looking, unless something is being typed.
 */
export function hiddenMoment(doc: Pick<Document, 'visibilityState' | 'activeElement' | 'querySelector'>): boolean {
  if (doc.visibilityState !== 'hidden') return false;
  const a = doc.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable)) return false;
  // Never over a sync waiting for the student (its review, the Move prompt) or a sheet with something typed in it: the
  // sync was already taken from the account and lives only on this page (review, 2026-10-12).
  return !doc.querySelector('.diff-row, .halo-move, .done-toast[data-wait], .modal input:not([type=checkbox]):not([type=radio]), .modal textarea');
}

export function startUpdateWatch(opts: { base?: string; fetchVersion?: () => Promise<string | null>; reload?: () => void } = {}): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const base = opts.base ?? import.meta.env.BASE_URL ?? '/';
  const fetchVersion =
    opts.fetchVersion ??
    (async () => {
      try {
        const r = await fetch(`${base}version.txt?t=${Date.now()}`, { cache: 'no-store' });
        return r.ok ? await r.text() : null;
      } catch {
        return null;
      }
    });
  const reload = opts.reload ?? (() => window.location.reload());
  let pending: string | null = null;
  let quietTimer: number | null = null;
  const tryReload = () => {
    if (!pending) return;
    if (quietMoment(document)) {
      reload();
      return;
    }
    quietTimer = window.setTimeout(tryReload, QUIET_EVERY);
  };
  const look = async () => {
    if (pending) return;
    const served = await fetchVersion();
    if (!newerVersion(APP_VERSION, served)) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      /* storage unavailable */
    }
    // Reloaded for this version already and still not on it (a cache in between): no loop.
    if (seen === served!.trim()) return;
    try {
      localStorage.setItem(SEEN_KEY, served!.trim());
    } catch {
      /* storage unavailable */
    }
    pending = served!.trim();
    tryReload();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void look();
    else if (pending && hiddenMoment(document)) reload();
  };
  const timer = window.setInterval(() => void look(), EVERY);
  document.addEventListener('visibilitychange', onVisible);
  // On open: a phone that last ran Halo+ days ago gets today's build in seconds (2026-10-12).
  window.setTimeout(() => void look(), 3_000);
  return () => {
    window.clearInterval(timer);
    if (quietTimer !== null) window.clearTimeout(quietTimer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
