// The email rules, on the real database with throwaways (George, 2026-10-09). Nothing is sent: email-send is not
// called; this checks what gets queued, by whom, how often, and that one click unsubscribes.
//   KEYS_ENV=... node scripts/e2e-emails.mjs
import { readFileSync } from 'node:fs';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const hours = (n) => new Date(Date.now() + n * 3_600_000).toISOString();
const outbox = async (id) => (await db.from('email_outbox').select('kind, sent_at, meta').eq('user_id', id)).data ?? [];

try {
  // A: trial ends in 24 h, synced → one trial_ending email queued, once.
  const A = await kit.persona('synced');
  await db.from('profiles').update({ trial_started_at: hours(-96), trial_ends_at: hours(24) }).eq('user_id', A.id);
  // B: trial ends in 24 h but unsubscribed → nothing.
  const B = await kit.persona('synced');
  await db.from('profiles').update({ trial_started_at: hours(-96), trial_ends_at: hours(24) }).eq('user_id', B.id);
  await db.from('notification_prefs').upsert({ user_id: B.id, email: false, email_unsub_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  // C: on Plus, last sync four days ago → one sync_broken email; then a sync lands and it may be sent again later.
  const C = await kit.persona('plus');
  const cs = (await db.from('settings').select('data').eq('user_id', C.id).single()).data.data;
  await db.from('settings').update({ data: { ...cs, lastPull: { ...(cs.lastPull ?? {}), at: hours(-4 * 24) } } }).eq('user_id', C.id);
  // D: on Plus, last sync four days ago, but got a non-account email 2 days ago → the week's one email is used.
  const D = await kit.persona('plus');
  const ds = (await db.from('settings').select('data').eq('user_id', D.id).single()).data.data;
  await db.from('settings').update({ data: { ...ds, lastPull: { ...(ds.lastPull ?? {}), at: hours(-4 * 24) } } }).eq('user_id', D.id);
  await db.from('email_outbox').insert({ user_id: D.id, to_email: D.email, kind: 'trial_ending', sent_at: hours(-48), created_at: hours(-49) });
  // E: Free, never on a plan that syncs, last sync four days ago → nothing (sync is not theirs to have).
  const E = await kit.persona('free');
  const es = (await db.from('settings').select('data').eq('user_id', E.id).maybeSingle()).data?.data ?? {};
  await db.from('settings').upsert({ user_id: E.id, data: { ...es, lastPull: { at: hours(-4 * 24), via: 'bookmark' } }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  const { data: r1, error } = await db.rpc('email_queue_tick');
  if (error) throw new Error(error.message);
  console.log('tick:', JSON.stringify(r1));
  const a = await outbox(A.id);
  check(a.length === 1 && a[0].kind === 'trial_ending' && !!a[0].meta?.ends_at, `A: one trial_ending queued with the end date (${JSON.stringify(a.map((x) => x.kind))})`);
  check((await outbox(B.id)).length === 0, 'B: unsubscribed, nothing queued');
  const c = await outbox(C.id);
  check(c.length === 1 && c[0].kind === 'sync_broken' && Number(c[0].meta?.days) >= 3, `C: one sync_broken queued after ${c[0]?.meta?.days} days`);
  const d = await outbox(D.id);
  check(d.length === 1 && d[0].kind === 'trial_ending', 'D: already had an email this week, so no second one');
  check((await outbox(E.id)).length === 0, 'E: Free without sync on their plan, nothing queued');
  const { data: r2 } = await db.rpc('email_queue_tick');
  check(r2.trial_ending === 0 && r2.sync_broken === 0 && (await outbox(A.id)).length === 1 && (await outbox(C.id)).length === 1, 'a second tick queues nothing more: once each');

  // C's sync lands (what sync-drop does): the sync_broken row goes, so a later break can email once more.
  await db.from('email_outbox').delete().eq('user_id', C.id).eq('kind', 'sync_broken');
  const cs2 = (await db.from('settings').select('data').eq('user_id', C.id).single()).data.data;
  await db.from('settings').update({ data: { ...cs2, lastPull: { ...(cs2.lastPull ?? {}), at: new Date().toISOString() } } }).eq('user_id', C.id);
  const { data: r3 } = await db.rpc('email_queue_tick');
  check(r3.sync_broken === 0 && (await outbox(C.id)).length === 0, 'after a sync lands, nothing is queued for C again until it breaks again');

  // The first sync restarts the free week: a trial started 3 days ago that only synced now gets 5 days from now.
  const F = await kit.persona('new');
  await db.from('profiles').update({ trial_started_at: hours(-72), trial_ends_at: hours(48) }).eq('user_id', F.id);
  const fc = (await kit.signIn(F.email)).c;
  const before = await fc.rpc('trial_sync_started');
  check(before.data?.ok === false && before.data?.why === 'not_synced', `before any sync the clock does not move (${before.data?.why})`);
  await db.from('settings').upsert({ user_id: F.id, data: { lastPull: { at: new Date().toISOString(), via: 'extension' }, timezone: 'America/Phoenix', updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  const r4 = await fc.rpc('trial_sync_started');
  const ends = Date.parse(r4.data?.ends_at ?? '');
  check(r4.data?.ok === true && ends > Date.now() + 4.9 * 86_400_000 && ends < Date.now() + 5.1 * 86_400_000, `the first sync restarts the week: ends in ${Math.round((ends - Date.now()) / 3_600_000)} h`);
  const r5 = await fc.rpc('trial_sync_started');
  check(r5.data?.ok === false && r5.data?.why === 'already', 'only once');
  const G = await kit.persona('new');
  await db.from('profiles').update({ trial_started_at: hours(-13 * 24), trial_ends_at: hours(-8 * 24) }).eq('user_id', G.id);
  await db.from('settings').upsert({ user_id: G.id, data: { lastPull: { at: new Date().toISOString(), via: 'extension' }, timezone: 'America/Phoenix', updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  const r6 = await (await kit.signIn(G.email)).c.rpc('trial_sync_started');
  const ends6 = Date.parse(r6.data?.ends_at ?? '');
  check(r6.data?.ok === true && ends6 < Date.now() + 1.1 * 86_400_000, `never past 14 days from the start (ends in ${Math.round((ends6 - Date.now()) / 3_600_000)} h)`);

  // One-click unsubscribe: the real function, a GET with the link an email would carry.
  const H = await kit.persona('synced');
  const secret = env.NOTIFY_CRON_SECRET;
  if (!secret) console.log('skip: NOTIFY_CRON_SECRET not in keys.env, the unsubscribe link is not tried here');
  else {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(H.id)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
    const url = `${env.VITE_SUPABASE_URL}/functions/v1/email-unsub?u=${H.id}&t=${sig}`;
    const r = await fetch(url);
    const html = await r.text();
    const pref = (await db.from('notification_prefs').select('email, email_unsub_at').eq('user_id', H.id).maybeSingle()).data;
    check(r.status === 200 && /unsubscribed/i.test(html) && pref?.email === false && !!pref?.email_unsub_at, `one click unsubscribes (${r.status}, email=${pref?.email})`);
  }
  const bad = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/email-unsub?u=${H.id}&t=deadbeef`);
  const prefH = (await db.from('notification_prefs').select('email').eq('user_id', H.id).maybeSingle()).data;
  check(bad.status === 400 && (prefH === null || prefH.email !== false || !!secret), `a wrong token changes nothing (${bad.status})`);
} finally {
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
