// The Sync Halo bookmark's second way home (2026-09-28), for iPad and phones, where opening the Halo+ tab replaces
// the Halo tab and the two tabs never talk. The bookmark posts its export here with the student's sync key; this
// stores it in their pending slot and nothing else. The key can drop off a sync; it can never read anything.
// OFF for the bookmark unless an admin has turned it on for the account (or for everyone), and never under the kill
// switch. The Chrome extension's syncs (via: 'extension') are always taken, kill switch aside (George, 2026-09-30:
// a scheduled sync at 6:08 AM read Halo, found no Halo+ tab open, and was lost; now it waits here for Halo+), except
// a scheduled one from an account with no Halo sync (auto-sync is Plus and Max since 2026-10-04; Max only before).
// A new drop replaces every older one: the newest sync is the whole picture, and an older one applied after it would
// put stale dates back.
import { admin } from '../_shared/admin.ts';
import { can } from '../_shared/flags.ts';
import type { Tier } from '../_shared/tiers.ts';

const ORIGINS = ['https://halo.gcu.edu'];
// What arrives on the wire, and what it may unpack to. The extension gzips its export (a real account's sync, six
// classes with descriptions, rubrics, discussions and 249 files, was refused at 8 MB of plain JSON, 2026-09-30).
const MAX_WIRE = 8_000_000;
const MAX_BYTES = 40_000_000;
const PER_HOUR = 30;

const allowed = (origin: string | null) => !!origin && (ORIGINS.includes(origin) || origin.startsWith('chrome-extension://'));
const cors = (origin: string | null) => ({
  'access-control-allow-origin': allowed(origin) ? origin! : ORIGINS[0],
  'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info, x-halo-encoding',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
  vary: 'origin',
});
const reply = (origin: string | null, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });

/** ge***@gmail.com */
const maskEmail = (e: string | null): string => (!e || !e.includes('@') ? 'another account' : `${e.split('@')[0].slice(0, 2)}***@${e.split('@')[1]}`);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { ok: false, why: 'POST only.' });
  try {
    const wire = await req.arrayBuffer();
    if (wire.byteLength > MAX_WIRE) return reply(origin, 413, { ok: false, why: 'That export is too big to send this way. Use Copy and paste it into Halo+.' });
    let raw: string;
    try {
      raw = req.headers.get('x-halo-encoding') === 'gzip' ? await new Response(new Blob([wire]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(wire);
    } catch {
      return reply(origin, 400, { ok: false, why: 'The sync arrived damaged. Press Sync now to try again.' });
    }
    if (raw.length > MAX_BYTES) return reply(origin, 413, { ok: false, why: 'That export is too big to send this way. Use Copy and paste it into Halo+.' });
    let body: { key?: unknown; payload?: unknown; via?: unknown; dryRun?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(origin, 400, { ok: false, why: 'The bookmark sent something that was not an export.' });
    }
    const key = typeof body.key === 'string' ? body.key : '';
    const p = body.payload as { kind?: unknown; version?: unknown; classes?: unknown; exportedAt?: unknown; auto?: unknown } | null;
    if (!/^[a-f0-9]{48}$/.test(key)) return reply(origin, 401, { ok: false, why: 'This bookmark has no valid sync key. Get the bookmark again from Halo+.' });
    if (!p || p.kind !== 'halo-export' || p.version !== 1 || !Array.isArray(p.classes) || typeof p.exportedAt !== 'string') return reply(origin, 400, { ok: false, why: 'The bookmark sent something that was not an export.' });
    const db = admin();
    const { data: owner } = await db.from('sync_keys').select('user_id').eq('key', key).maybeSingle();
    if (!owner) return reply(origin, 401, { ok: false, why: 'This bookmark\'s sync key was reset. Get the bookmark again from Halo+ (You, Halo).' });
    const fromExtension = body.via === 'extension';
    const { data: on } = fromExtension
      ? await db.from('app_switches').select('enabled').eq('name', 'server_sync_kill').maybeSingle().then(({ data }) => ({ data: !data?.enabled }))
      : await db.rpc('server_sync_on', { uid: owner.user_id });
    if (!on) return reply(origin, 200, { ok: false, off: true, why: 'Sending straight to your account is not switched on.' });
    // Auto-sync is Plus and Max (2026-10-04): the extension's scheduled syncs (payload.auto, sent by every extension
    // build since 0.2) are taken for Plus, Max, a trial or a friend link; not for Free. Sync now (auto false) as before.
    if (fromExtension && p.auto === true) {
      const { data: plan } = await db.rpc('plan_of', { uid: owner.user_id });
      if (!can('haloAutoSync', ((plan as Tier) ?? 'free'))) return reply(origin, 403, { ok: false, plan: 'plus', why: 'Automatic syncs are part of Plus and Max.' });
    }
    // One Halo student, one Halo+ account (2026-10-11). Keyed on the Halo student (the sync script's hash of the Halo
    // session's identity), never on class ids: those are sections every classmate shares, and keying on them blocked
    // classmates from each other (Loop 227). An export without the hash (an older extension) lands as it always has.
    const haloUser = typeof (p as { haloUser?: unknown }).haloUser === 'string' && /^[0-9a-f]{40}$/.test((p as { haloUser: string }).haloUser) ? (p as { haloUser: string }).haloUser : null;
    const classIds = (p.classes as { id?: unknown }[]).map((c) => (typeof c?.id === 'string' ? c.id : '')).filter(Boolean).slice(0, 30);
    if (haloUser) {
      const { data: ownerTest } = await db.rpc('link_test', { uid: owner.user_id });
      const { data: link } = await db.from('halo_links').select('user_id').eq('halo_user', haloUser).maybeSingle();
      let holder: string | null = link && link.user_id !== owner.user_id ? (link.user_id as string) : null;
      if (holder) {
        const { data: alive } = await db.from('profiles').select('user_id').eq('user_id', holder).maybeSingle();
        const { data: holderTest } = await db.rpc('link_test', { uid: holder });
        if (!alive || holderTest) holder = null;
      }
      if (holder) {
        const { data: who } = await db.auth.admin.getUserById(holder);
        const masked = maskEmail(who?.user?.email ?? null);
        if (ownerTest) {
          await db.rpc('error_record', { e: { fingerprint: 'sync-drop:test-halo', kind: 'server', title: 'A test account synced a Halo that a real account holds', message: `refused for ${owner.user_id.slice(0, 8)}; held by ${masked}`, place: 'sync-drop', status: 409, details: { owner: owner.user_id, holder } } }).then(() => undefined, () => undefined);
          return reply(origin, 409, { ok: false, foreign: true, canMove: false, why: `This Halo account belongs to ${masked}. A test account can't take it.` });
        }
        const codes = (p.classes as { courseCode?: unknown }[]).map((c) => (typeof c?.courseCode === 'string' ? c.courseCode : '')).filter(Boolean);
        await db.from('halo_move_offers').upsert({ user_id: owner.user_id, halo_user: haloUser, holder, holder_masked: masked, class_codes: codes, class_ids: classIds, payload: p, exported_at: p.exportedAt, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }, { onConflict: 'user_id,halo_user' });
        return reply(origin, 409, { ok: false, foreign: true, canMove: true, offer: true, why: `This Halo account is linked to ${masked}. Open Halo+ to move it to this account.` });
      }
      if (!ownerTest) {
        if (link?.user_id === owner.user_id) await db.from('halo_links').update({ last_seen_at: new Date().toISOString(), class_ids: classIds }).eq('halo_user', haloUser);
        else await db.rpc('halo_move', { p_halo_user: haloUser, p_to: owner.user_id, p_class_ids: classIds, p_how: fromExtension ? 'extension' : 'bookmark' });
      }
    }
    // A check with nothing saved: every rule above, then stop (support and the account-health check use it).
    if ((body as { dryRun?: unknown }).dryRun === true) return reply(origin, 200, { ok: true, dry: true, linked: haloUser ? true : null });
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await db.from('pending_syncs').select('id', { count: 'exact', head: true }).eq('user_id', owner.user_id).gte('created_at', since);
    if ((count ?? 0) >= PER_HOUR) return reply(origin, 429, { ok: false, why: 'Too many syncs in the last hour. Wait a few minutes, then tap Sync Halo again.' });
    const { data: row, error } = await db.from('pending_syncs').insert({ user_id: owner.user_id, payload: p, bytes: raw.length }).select('id').single();
    if (error || !row) return reply(origin, 500, { ok: false, why: `Halo+ could not save it (${error?.message ?? 'no row'}). Tap Sync Halo again, or use Copy and paste it into Halo+.` });
    // A mailbox, not a history: the newest sync replaces every older one, taken or not.
    await db.from('pending_syncs').delete().eq('user_id', owner.user_id).neq('id', row.id);
    // Halo is heard from again: the "sync broken" email may be sent once more if it breaks again (2026-10-09).
    await db.from('email_outbox').delete().eq('user_id', owner.user_id).eq('kind', 'sync_broken').then(() => undefined, () => undefined);
    return reply(origin, 200, { ok: true, id: row.id });
  } catch (e) {
    return reply(origin, 500, { ok: false, why: `Halo+ could not save it (${e instanceof Error ? e.message : String(e)}). Tap Sync Halo again, or use Copy and paste it into Halo+.` });
  }
});
