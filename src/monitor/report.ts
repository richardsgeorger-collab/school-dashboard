import { storedUserId } from '../auth/planCache';
import { ENV } from '../env';

/**
 * Error monitoring, the app half (George, 2026-09-30, launch day): know when something breaks before a student says
 * so. Crashes, failed server calls and the silent failures that bit before go to the `report` function, which groups
 * them and alerts. Never personal content: messages are scrubbed of emails, tokens, keys and long ids here and again
 * on the server; details are counts and short words only; the student is an anonymous hash.
 */
export type ErrorKind = 'crash' | 'rejection' | 'function' | 'extension' | 'server' | 'silent' | 'test';
export interface Report {
  kind: ErrorKind;
  /** What broke, in plain words: the issue's name on the Admin page and in the alert's subject. */
  title: string;
  message?: string;
  stack?: string;
  /** The screen (route) or function it happened in. */
  place?: string;
  status?: number;
  details?: Record<string, number | boolean | string>;
}

export const APP_VERSION: string = (() => {
  try {
    return __APP_VERSION__;
  } catch {
    return 'dev';
  }
})();

/** Emails, tokens, keys, long ids and query strings out; capped. The server does the same again. */
export function scrub(s: string | undefined | null, max: number): string | undefined {
  if (s === undefined || s === null) return undefined;
  let t = String(s);
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  t = t.replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/g, '[token]');
  t = t.replace(/\b(bearer|apikey|authorization|password|token|key|secret)\b(\s*[:=]\s*|\s+)\S+/gi, '$1 [redacted]');
  t = t.replace(/\b(sk|pk|rk|re|whsec|sub|cus|cs)_(live|test)?_?[A-Za-z0-9]{8,}\b/g, '[id]');
  t = t.replace(/\b[a-f0-9]{24,}\b/gi, '[id]');
  t = t.replace(/([?&][\w-]+=)[^&\s#)]+/g, '$1…');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** The same problem, whatever the numbers, ids and build hashes in it (matches the server's fingerprintOf). */
export function fingerprint(r: Pick<Report, 'kind' | 'title' | 'place' | 'stack'>): string {
  const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/-[a-z0-9_-]{6,}\.js/g, '.js').replace(/:\d+(:\d+)?/g, '').replace(/\d+/g, 'n').replace(/\s+/g, ' ').trim();
  const top = norm((r.stack ?? '').split('\n').find((l) => /at |@/.test(l)));
  const key = `${r.kind}|${norm(r.place)}|${norm(r.title)}|${top}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${r.kind}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/** "Chrome 142 on macOS" and desktop/phone/tablet, from the user agent alone. */
export function browserOf(ua: string, touchPoints = 0): { browser: string; device: string } {
  const pick = (re: RegExp) => ua.match(re)?.[1];
  const name = /Edg\//.test(ua) ? `Edge ${pick(/Edg\/(\d+)/)}` : /CriOS|Chrome\//.test(ua) && !/OPR/.test(ua) ? `Chrome ${pick(/(?:CriOS|Chrome)\/(\d+)/)}` : /Firefox\//.test(ua) ? `Firefox ${pick(/Firefox\/(\d+)/)}` : /Safari\//.test(ua) ? `Safari ${pick(/Version\/(\d+)/) ?? ''}`.trim() : 'Other';
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const os = ipad ? 'iPadOS' : /iPhone/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown';
  const device = ipad || /Tablet/.test(ua) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'phone' : 'desktop';
  return { browser: `${name} on ${os}`, device };
}

const LOG_KEY = 'school-dashboard:error-log';
const DEVICE_KEY = 'school-dashboard:device-id';
const PER_WINDOW = 15;
const WINDOW_MS = 10 * 60_000;
const SAME_MS = 5 * 60_000;

/** Per device: at most 15 in 10 minutes, and the same problem once in 5 minutes (a render loop sends one). */
export function allowed(log: { at: number; fp: string }[], fp: string, now: number): boolean {
  const recent = log.filter((x) => now - x.at < WINDOW_MS);
  if (recent.length >= PER_WINDOW) return false;
  return !recent.some((x) => x.fp === fp && now - x.at < SAME_MS);
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage off: the in-memory copy below still limits this page */
  }
};
let memoryLog: { at: number; fp: string }[] = [];

function deviceId(): string {
  let id = read<string | null>(DEVICE_KEY, null);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, '').slice(0, 36);
    write(DEVICE_KEY, id);
  }
  return id;
}

/** The student, anonymously: a one-way hash of the account id, the same on every device. */
async function anonId(): Promise<string | undefined> {
  const id = storedUserId();
  if (!id || !crypto.subtle) return undefined;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`halo+errors:${id}`));
  return [...new Uint8Array(bytes)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const reportUrl = (): string => (ENV.SUPABASE_URL ? `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/report` : '');

/** Sends one report. Never throws, never blocks, never reports its own failure (no loops). */
export function report(r: Report): void {
  void (async () => {
    try {
      const url = reportUrl();
      if (!url || typeof window === 'undefined') return;
      const entry = { ...r, title: scrub(r.title, 160) ?? 'Unknown error', message: scrub(r.message, 500), stack: scrub(r.stack, 4000), place: scrub(r.place ?? currentScreen(), 80) };
      const fp = fingerprint(entry);
      const now = Date.now();
      const log = [...read<{ at: number; fp: string }[]>(LOG_KEY, []), ...memoryLog].filter((x) => now - x.at < WINDOW_MS);
      if (!allowed(log, fp, now)) return;
      memoryLog = [...memoryLog, { at: now, fp }].slice(-30);
      write(LOG_KEY, [...log, { at: now, fp }].slice(-30));
      const { browser, device } = browserOf(navigator.userAgent, navigator.maxTouchPoints ?? 0);
      let plan: string | undefined;
      let ext: string | undefined;
      try {
        plan = localStorage.getItem('school-dashboard:tier') ?? undefined;
        ext = localStorage.getItem('school-dashboard:ext-version') ?? undefined;
      } catch {
        /* storage off */
      }
      const body = { ...entry, fingerprint: fp, app_version: APP_VERSION, ext_version: ext, browser, device, plan, anon_id: await anonId(), device_id: deviceId() };
      await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
    } catch {
      /* the reporter never reports itself */
    }
  })();
}

/** The screen the student is on: the route, never its parameters. */
export function currentScreen(): string {
  try {
    return (window.location.hash.replace(/^#/, '').split('?')[0] || '/now').slice(0, 40);
  } catch {
    return 'unknown';
  }
}

const FN_NAMES: Record<string, string> = { ai: 'AI', 'stripe-checkout': 'Checkout', 'stripe-portal': 'Billing portal', 'referral-credit': 'Referral credit', transcribe: 'Transcription', 'sync-drop': 'Sync to account' };

/**
 * A server function answered with a failure. The answers that are the student's state, not a fault (signed out, not
 * on the plan, over a limit), are not reported; a network failure only when the browser thinks it is online.
 */
export function reportFunctionFailure(fn: string, status: number, message?: string, details: Record<string, number | boolean | string> = {}): void {
  if ([401, 402, 403, 429].includes(status)) return;
  if (status === 0 && typeof navigator !== 'undefined' && navigator.onLine === false) return;
  report({ kind: 'function', title: `${FN_NAMES[fn] ?? fn} failed${status ? ` (${status})` : ' (no answer)'}`, message, place: fn, status, details: { fn, ...details } });
}
