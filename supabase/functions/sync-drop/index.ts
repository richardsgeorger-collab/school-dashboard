// The Sync Halo bookmark's second way home (2026-09-28), for iPad and phones, where opening the Halo+ tab replaces
// the Halo tab and the two tabs never talk. The bookmark posts its export here with the student's sync key; this
// stores it in their pending slot and nothing else. The key can drop off a sync; it can never read anything.
// OFF unless an admin has turned it on for the account (or for everyone), and never under the kill switch.
import { admin } from '../_shared/admin.ts';

const ORIGINS = ['https://halo.gcu.edu'];
const MAX_BYTES = 4_000_000;
const PER_HOUR = 30;

const cors = (origin: string | null) => ({
  'access-control-allow-origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
  'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
  vary: 'origin',
});
const reply = (origin: string | null, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { ok: false, why: 'POST only.' });
  try {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return reply(origin, 413, { ok: false, why: 'That export is too big to send this way. Use Copy and paste it into Halo+.' });
    let body: { key?: unknown; payload?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(origin, 400, { ok: false, why: 'The bookmark sent something that was not an export.' });
    }
    const key = typeof body.key === 'string' ? body.key : '';
    const p = body.payload as { kind?: unknown; version?: unknown; classes?: unknown; exportedAt?: unknown } | null;
    if (!/^[a-f0-9]{48}$/.test(key)) return reply(origin, 401, { ok: false, why: 'This bookmark has no valid sync key. Get the bookmark again from Halo+.' });
    if (!p || p.kind !== 'halo-export' || p.version !== 1 || !Array.isArray(p.classes) || typeof p.exportedAt !== 'string') return reply(origin, 400, { ok: false, why: 'The bookmark sent something that was not an export.' });
    const db = admin();
    const { data: owner } = await db.from('sync_keys').select('user_id').eq('key', key).maybeSingle();
    if (!owner) return reply(origin, 401, { ok: false, why: 'This bookmark\'s sync key was reset. Get the bookmark again from Halo+ (You, Halo).' });
    const { data: on } = await db.rpc('server_sync_on', { uid: owner.user_id });
    if (!on) return reply(origin, 200, { ok: false, off: true, why: 'Sending straight to your account is not switched on.' });
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await db.from('pending_syncs').select('id', { count: 'exact', head: true }).eq('user_id', owner.user_id).gte('created_at', since);
    if ((count ?? 0) >= PER_HOUR) return reply(origin, 429, { ok: false, why: 'Too many syncs in the last hour. Wait a few minutes, then tap Sync Halo again.' });
    const { data: row, error } = await db.from('pending_syncs').insert({ user_id: owner.user_id, payload: p, bytes: raw.length }).select('id').single();
    if (error || !row) return reply(origin, 500, { ok: false, why: 'Halo+ could not save it. Tap Sync Halo again, or use Copy and paste it into Halo+.' });
    // Old and taken ones go: a pending slot is a mailbox, not a history.
    await db.from('pending_syncs').delete().eq('user_id', owner.user_id).or(`consumed_at.not.is.null,created_at.lt.${new Date(Date.now() - 7 * 86_400_000).toISOString()}`).neq('id', row.id);
    return reply(origin, 200, { ok: true, id: row.id });
  } catch (e) {
    return reply(origin, 500, { ok: false, why: `Halo+ could not save it (${e instanceof Error ? e.message : String(e)}). Tap Sync Halo again, or use Copy and paste it into Halo+.` });
  }
});
