// Error monitoring, the server half (2026-09-30). Every event, from a browser, the extension or a server function,
// comes through recordError: scrubbed again, grouped by fingerprint (error_record in migration 0020), and alerted by
// email (Resend) and push to admin devices when it is new, reopened after a new deploy, a silent failure, or 10 in 10
// minutes. One alert per issue per hour at most.
import webpush from 'npm:web-push@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type ErrorKind = 'crash' | 'rejection' | 'function' | 'extension' | 'server' | 'silent' | 'test';
export interface ErrorEntry {
  kind: ErrorKind;
  title: string;
  message?: string | null;
  stack?: string | null;
  place?: string | null;
  status?: number | null;
  app_version?: string | null;
  ext_version?: string | null;
  browser?: string | null;
  device?: string | null;
  plan?: string | null;
  anon_id?: string | null;
  device_id?: string | null;
  details?: Record<string, unknown>;
  fingerprint?: string;
}

const KINDS = new Set(['crash', 'rejection', 'function', 'extension', 'server', 'silent', 'test']);

/** Nothing personal survives: emails, tokens, keys, long ids and query strings are replaced. */
export function scrub(s: unknown, max: number): string | null {
  if (s === null || s === undefined) return null;
  let t = String(s);
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  t = t.replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/g, '[token]');
  t = t.replace(/\b(bearer|apikey|authorization|password|token|key|secret)\b(\s*[:=]\s*|\s+)\S+/gi, '$1 [redacted]');
  t = t.replace(/\b(sk|pk|rk|re|whsec|sub|cus|cs)_(live|test)?_?[A-Za-z0-9]{8,}\b/g, '[id]');
  t = t.replace(/\b[a-f0-9]{24,}\b/gi, '[id]');
  t = t.replace(/([?&][\w-]+=)[^&\s#)]+/g, '$1…');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Details are numbers, booleans and short words only (counts, status, which function). */
function cleanDetails(d: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!d || typeof d !== 'object') return out;
  for (const [k, v] of Object.entries(d as Record<string, unknown>).slice(0, 20)) {
    if (!/^[\w-]{1,40}$/.test(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = scrub(v, 60);
  }
  return out;
}

/** The same problem, whatever the numbers, ids and build hashes in it. */
export function fingerprintOf(e: Pick<ErrorEntry, 'kind' | 'title' | 'place' | 'stack'>): string {
  const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/-[a-z0-9_-]{6,}\.js/g, '.js').replace(/:\d+(:\d+)?/g, '').replace(/\d+/g, 'n').replace(/\s+/g, ' ').trim();
  const top = norm((e.stack ?? '').split('\n').find((l) => /at |@/.test(l)) ?? '');
  const key = `${e.kind}|${norm(e.place)}|${norm(e.title)}|${top}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${e.kind}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function clean(e: ErrorEntry): ErrorEntry | null {
  if (!e || !KINDS.has(e.kind) || !e.title) return null;
  const out: ErrorEntry = {
    kind: e.kind,
    title: scrub(e.title, 160) ?? 'Unknown error',
    message: scrub(e.message, 500),
    stack: scrub(e.stack, 4000),
    place: scrub(e.place, 80),
    status: typeof e.status === 'number' && Number.isFinite(e.status) ? Math.round(e.status) : null,
    app_version: scrub(e.app_version, 40),
    ext_version: scrub(e.ext_version, 20),
    browser: scrub(e.browser, 60),
    device: scrub(e.device, 20),
    plan: scrub(e.plan, 12),
    anon_id: typeof e.anon_id === 'string' && /^[a-f0-9]{8,32}$/.test(e.anon_id) ? e.anon_id : null,
    device_id: typeof e.device_id === 'string' && /^[\w-]{8,40}$/.test(e.device_id) ? e.device_id : null,
    details: cleanDetails(e.details),
  };
  out.fingerprint = typeof e.fingerprint === 'string' && /^[a-z]+-[a-f0-9]{8}$/.test(e.fingerprint) ? e.fingerprint : fingerprintOf(out);
  return out;
}

const HOUR = 3_600_000;

/** Records one event (already cleaned or not) and alerts when the rules say so. Never throws. */
export async function recordError(db: SupabaseClient, raw: ErrorEntry): Promise<{ ok: boolean; alerted?: string | null }> {
  try {
    const e = clean(raw);
    if (!e) return { ok: false };
    const { data, error } = await db.rpc('error_record', { e });
    if (error || !data) {
      console.error('error_record', error?.message);
      return { ok: false };
    }
    const r = data as { is_new: boolean; reopened: boolean; recent: number; alerted_at: string | null };
    const reason = r.is_new ? 'new' : r.reopened ? 'reopened' : e.kind === 'silent' ? 'silent' : r.recent >= 10 ? 'spike' : e.kind === 'test' ? 'test' : null;
    const quiet = r.alerted_at && Date.now() - Date.parse(r.alerted_at) < HOUR;
    if (!reason || (quiet && e.kind !== 'test')) return { ok: true, alerted: null };
    await db.from('error_issues').update({ alerted_at: new Date().toISOString() }).eq('fingerprint', e.fingerprint);
    await alert(db, e, reason, r.recent);
    return { ok: true, alerted: reason };
  } catch (err) {
    console.error('recordError', err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

/** A server function's own failure, in one line at the catch. */
export function serverError(db: SupabaseClient, fn: string, err: unknown, status = 500, details: Record<string, unknown> = {}) {
  const message = err instanceof Error ? err.message : String(err);
  return recordError(db, { kind: 'server', title: `${FN_NAMES[fn] ?? fn} failed on the server${status ? ` (${status})` : ''}`, message, stack: err instanceof Error ? err.stack ?? null : null, place: fn, status, details });
}

export const FN_NAMES: Record<string, string> = {
  ai: 'AI', 'stripe-checkout': 'Checkout', 'stripe-portal': 'Billing portal', 'stripe-webhook': 'Stripe webhook', 'referral-credit': 'Referral credit',
  'sync-drop': 'Sync to account', transcribe: 'Transcription', 'notify-send': 'Notifications', report: 'Error reporting',
};

function subjectOf(e: ErrorEntry, reason: string, recent: number): string {
  const what = e.title.replace(/\.$/, '');
  if (reason === 'spike') return `Halo+: ${what} (${recent} times in 10 minutes)`;
  if (reason === 'reopened') return `Halo+: back again after a deploy: ${what}`;
  if (reason === 'silent') return `Halo+: ${what}`;
  if (reason === 'test') return `Halo+: test alert: ${what}`;
  return `Halo+: new problem: ${what}`;
}

async function alert(db: SupabaseClient, e: ErrorEntry, reason: string, recent: number) {
  const subject = subjectOf(e, reason, recent).slice(0, 150);
  const lines = [
    subject.replace(/^Halo\+: /, ''),
    '',
    `Where: ${e.place ?? 'unknown'}${e.status ? ` · status ${e.status}` : ''}`,
    e.message ? `Message: ${e.message}` : '',
    `Versions: app ${e.app_version ?? '—'}${e.ext_version ? `, extension ${e.ext_version}` : ''}`,
    `Browser: ${e.browser ?? '—'} (${e.device ?? '—'}) · plan ${e.plan ?? '—'}`,
    Object.keys(e.details ?? {}).length ? `Details: ${JSON.stringify(e.details)}` : '',
    '',
    'Open Halo+ → You → Admin → Errors for the stack and every time it happened.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  const log = (channel: string, ok: boolean, detail: string | null) => db.from('error_alerts').insert({ fingerprint: e.fingerprint, reason, subject, channel, ok, detail: detail ? detail.slice(0, 300) : null });

  // Email, through Resend.
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ALERT_EMAIL') ?? 'richards.georger@gmail.com';
  if (!key) await log('email', false, 'RESEND_API_KEY is not set');
  else {
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: 'Halo+ alerts <noreply@haloplus.app>', to: [to], subject, text: lines.join('\n') }) });
      const body = await r.text();
      await log('email', r.ok, r.ok ? `to ${to.replace(/^(.).*(@.*)$/, '$1…$2')}` : `Resend ${r.status}: ${body}`);
    } catch (err) {
      await log('email', false, err instanceof Error ? err.message : String(err));
    }
  }

  // Push, to every admin device that turned notifications on (works before the email key exists).
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return;
  try {
    webpush.setVapidDetails(Deno.env.get('VAPID_CONTACT') ?? 'mailto:hello@example.com', pub, priv);
    const { data: admins } = await db.from('profiles').select('user_id').eq('is_admin', true);
    const ids = (admins ?? []).map((a) => a.user_id);
    if (!ids.length) return;
    const { data: subs } = await db.from('push_subscriptions').select('endpoint, keys').in('user_id', ids);
    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint as string, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify({ title: subject.replace(/^Halo\+: /, 'Halo+ · '), body: e.message ?? e.title, url: '#/admin?s=errors', tag: `error-${e.fingerprint}` }), { TTL: 3600 });
        sent++;
      } catch {
        /* a dead subscription; notify-send prunes those */
      }
    }
    await log('push', sent > 0, `${sent} of ${(subs ?? []).length} admin devices`);
  } catch (err) {
    await log('push', false, err instanceof Error ? err.message : String(err));
  }
}
