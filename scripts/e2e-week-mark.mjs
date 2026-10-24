// A check-off from "This week" on Halo's Student Home reaches the account (extension 0.10.0, George 2026-10-24: "checking
// the box marks it done in Halo+, same done state everywhere, undo for a few seconds"), against the deployed sync-drop
// with a throwaway Max account (scripts/lib/personas.mjs, the made-up term) and its own sync key:
//   - mark: the item is done as the app's Done button makes it (status, completedAt, award, updatedAt), nothing else
//     changes, and the account's done list has it (Halo's id and Halo+'s);
//   - undo (after it was sent): put back as it was;
//   - Halo+ (the local build, the real backend) shows it done; another account's item and a wrong key are refused.
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/e2e-week-mark.mjs
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const DROP = `${env.VITE_SUPABASE_URL}/functions/v1/sync-drop`;
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 300000);
const post = async (body) => {
  const r = await fetch(DROP, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'chrome-extension://test' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const row = async (uid, id) => (await db.from('items').select('data, updated_at').eq('user_id', uid).eq('id', id).single()).data;

try {
  const who = await kit.persona('max');
  const other = await kit.persona('max');
  const key = randomBytes(24).toString('hex');
  await db.from('sync_keys').upsert({ user_id: who.id, key }, { onConflict: 'user_id' });
  const { data: items } = await db.from('items').select('id, data').eq('user_id', who.id);
  const target = items.find((r) => r.data.haloId && r.data.status !== 'done' && (r.data.points || 0) > 0 && r.data.type !== 'participation' && !/particip/i.test(r.data.title));
  const before = target.data;

  // ---- mark ----
  const m = await post({ key, mark: { id: target.id, done: true } });
  const after = (await row(who.id, target.id)).data;
  check(m.status === 200 && m.body?.ok && m.body.prev?.status === before.status, `mark: accepted, and what it was comes back (${m.status}, was "${m.body?.prev?.status}")`);
  check(after.status === 'done' && !!after.completedAt && after.award?.base === (before.points || 0) && after.updatedAt > before.updatedAt, `done as Halo+'s Done button makes it (status ${after.status}, award ${after.award?.base})`);
  const changed = Object.keys({ ...before, ...after }).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
  check(changed.every((k) => ['award', 'completedAt', 'status', 'updatedAt'].includes(k)), `nothing else of the item changed (${changed.join(', ')})`);
  const d = await post({ key, done: true });
  check(d.body?.done?.includes(target.id) && d.body.done.includes(before.haloId), 'the account\'s done list has it, by Halo\'s id and Halo+\'s');

  // ---- undo, after it was sent ----
  const u = await post({ key, mark: { id: target.id, done: false, prev: m.body.prev } });
  const undone = (await row(who.id, target.id)).data;
  check(u.body?.ok && undone.status === before.status && (undone.completedAt ?? null) === (before.completedAt ?? null), `undo: put back as it was (${undone.status})`);
  const d2 = await post({ key, done: true });
  check(!d2.body?.done?.includes(target.id), 'and off the done list');

  // ---- refused: someone else's item, a wrong key, an item not in Halo+ ----
  // The key is this student's: another account's item is never touched, even one with the same id as one of theirs.
  const open2 = (await db.from('items').select('id, data').eq('user_id', other.id)).data.filter((r) => r.data.status !== 'done');
  const theirs = open2.find((r) => !items.some((mine) => mine.id === r.id)) ?? open2[0];
  const x1 = await post({ key, mark: { id: theirs.id, done: true } });
  const theirsAfter = (await row(other.id, theirs.id)).data;
  check(theirsAfter.status === theirs.data.status && theirsAfter.updatedAt === theirs.data.updatedAt, `another account's item: untouched (${x1.status}${items.some((mine) => mine.id === theirs.id) ? ', the same id in this account was the one marked' : ''})`);
  const x2 = await post({ key: 'b'.repeat(48), mark: { id: target.id, done: true } });
  check(x2.status === 401, `an unknown key: refused (${x2.status})`);
  const x3 = await post({ key, mark: { id: 'no-such-item', done: true } });
  check(x3.status === 404, `an item not in Halo+: "${x3.body?.why}"`);

  // ---- Halo+ shows it done ----
  await post({ key, mark: { id: target.id, done: true } });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
  await ctx.addInitScript(({ ses, k }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(ses)); }, { ses: who.session, k: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  await p.goto(`https://haloplus.app/#/class?c=${before.courseId}&i=${target.id}`, { waitUntil: 'load' });
  const done = await p.locator('.sheet-done[data-done]').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  if (!done) console.log('  page:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600));
  check(done, `Halo+ shows it done ("${before.title}")`);
  await sleep(4000);
  check((await row(who.id, target.id)).data.status === 'done', 'and Halo+ opening did not put it back');
  await browser.close();
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
