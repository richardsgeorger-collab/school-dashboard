// Two accounts, one computer, the extension installed (George, 2026-10-09). A is signed in with a synced term; A signs
// out; B signs in on the same browser; B syncs Halo through the extension; B signs out; A signs back in. Nothing of
// A's reaches B, nothing of B's reaches A, the extension sends each sync to the account signed in at the time, and a
// Halo already linked to one account is refused for another. Real Chrome, the unpacked extension, Halo+ served from
// the local build at haloplus.app, Halo mocked; the account rows and sync-drop are the real ones (throwaways).
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-switch.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 500) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const haloClasses = (tag) => ({ getCourseClassesForUser: { courseClasses: [{ id: `hc-${tag}`, classCode: 'PSY-102-O500', slugId: `PSY-102-O500-20260908`, startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Psychology', stage: 'CURRENT', modality: 'ONLINE', credits: 4, courseCode: 'PSY-102', units: [{ id: 'u1', title: 'Topic 5', sequence: 5, startDate: day(-5), endDate: day(9), assessments: [{ id: `as-${tag}`, sequence: 1, title: 'Topic 5 DQ 1', description: '', startDate: day(-3), dueDate: day(3), points: 5, type: 'DISCUSSION', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] }] } });
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 420000);

const A = await kit.persona('synced');
const B = await kit.persona('max');
const PASS = `Pw-${Math.random().toString(36).slice(2)}-9x`;
for (const who of [A, B]) await db.auth.admin.updateUserById(who.id, { password: PASS });
const aItems = (await db.from('items').select('id, data, updated_at').eq('user_id', A.id)).data;
const aIds = aItems.map((i) => i.id);
const bIds = (await db.from('items').select('id').eq('user_id', B.id)).data.map((i) => i.id);
const aOnly = aIds[0];
const bOnly = bIds[0];
console.log(`A ${A.email.slice(0, 14)}… ${aIds.length} items; B ${B.email.slice(0, 14)}… ${bIds.length} items`);

const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-switch-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
let haloTag = 'b';
try {
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
  await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? haloClasses(haloTag) : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  // A is signed in on this browser.
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key) && !localStorage.getItem('school-dashboard:owner')) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: A.session, key: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  p.on('dialog', (d) => d.accept());
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.now-head', { timeout: 30000, state: 'attached' });
  await sleep(3000);
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: EXT });
  await sleep(2500);
  const local = (k) => p.evaluate((key) => localStorage.getItem(key), k);
  const cacheTitles = async () => { try { return JSON.parse(await local('school-dashboard:v1')).items.map((i) => i.id); } catch { return []; } };
  check((await local('school-dashboard:owner')) === A.id, 'A signed in: the device cache is claimed by A');
  check((await cacheTitles()).includes(aOnly), "A's items are in the cache");
  const keyA = await until(() => local('school-dashboard:sync-key'), 15000);
  const keyRowA = (await db.from('sync_keys').select('key').eq('user_id', A.id)).data?.[0]?.key;
  check(!!keyA && keyA === keyRowA, "the sync key in the page is A's");

  // A signs out.
  await p.goto('https://haloplus.app/#/you', { waitUntil: 'load' });
  await sleep(1500);
  await p.locator('button:has-text("Sign out")').first().click();
  await sleep(2500);
  check((await local('school-dashboard:sync-key')) === null, 'signed out: the sync key is gone from the page');
  check((await local('school-dashboard:owner')) === A.id, "signed out: A's planner stays on the device, still claimed by A");

  // B signs in with email and password.
  const signIn = async (who) => {
    await p.goto('https://haloplus.app/#/login', { waitUntil: 'load' });
    await sleep(1500);
    await p.locator('form.signin[data-step="email"] input[name="email"]').fill(who.email);
    await p.locator('form.signin[data-step="email"] button[type="submit"]').click();
    await p.waitForSelector('form.signin[data-step="password"] input[name="password"]', { timeout: 15000 });
    await p.locator('form.signin[data-step="password"] input[name="password"]').fill(PASS);
    await p.locator('form.signin[data-step="password"] button[type="submit"]').click();
    await sleep(6000);
  };
  await signIn(B);
  await until(async () => (await local('school-dashboard:owner')) === B.id, 20000);
  check((await local('school-dashboard:owner')) === B.id, 'B signed in: the device cache is claimed by B');
  const titlesB = await until(async () => { const t = await cacheTitles(); return t.includes(bOnly) ? t : null; }, 20000);
  check(!!titlesB && !titlesB.includes(aOnly), `B sees B's items and none of A's (${titlesB?.length ?? 0} items)`);
  const pendingB = JSON.parse((await local('school-dashboard:pending')) || '[]');
  const leakedOps = pendingB.filter((op) => (op.ids ?? [op.id]).some((id) => aIds.includes(id)));
  check(leakedOps.length === 0, `A's unsent changes did not carry into B (${pendingB.length} ops in B's queue, ${leakedOps.length} about A's rows)`);
  const keyB = await until(async () => { const k = await local('school-dashboard:sync-key'); return k && k !== keyA ? k : null; }, 15000);
  const keyRowB = (await db.from('sync_keys').select('key').eq('user_id', B.id)).data?.[0]?.key;
  check(!!keyB && keyB === keyRowB, "the sync key in the page is now B's");
  // B syncs Halo through the extension: the export lands in B's account, not A's.
  const t0 = Date.now();
  await p.evaluate(() => window.postMessage({ kind: 'halo-ext-first-sync' }, location.origin));
  const landedB = await until(async () => (await db.from('pending_syncs').select('created_at, payload->>source').eq('user_id', B.id).gte('created_at', new Date(t0).toISOString()).limit(1)).data?.[0] ?? null, 90000, 2000);
  check(!!landedB && landedB.source === 'extension', `B's extension sync landed in B's account (${landedB ? Math.round((Date.parse(landedB.created_at) - t0) / 1000) + ' s' : 'never'})`);
  const strayA = (await db.from('pending_syncs').select('id').eq('user_id', A.id).gte('created_at', new Date(t0).toISOString())).data ?? [];
  check(strayA.length === 0, "nothing landed in A's account while B was signed in");
  await sleep(4000);
  await p.goto('https://haloplus.app/#/inbox', { waitUntil: 'load' });
  await sleep(3000);
  const dbs = await p.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  check(dbs.includes(`school-dashboard-announcements-${B.id.slice(0, 8)}`), `B's announcements live in a database of B's own (${dbs.filter((n) => n.startsWith('school-dashboard-announcements')).join(', ')})`);
  check(!dbs.some((n) => n === `school-dashboard-announcements-${A.id.slice(0, 8)}`), "A's databases keep the original names");
  check(await p.evaluate(() => document.querySelectorAll('.modal-backdrop').length === 0), 'no review of a sync is open on the Inbox');

  // B signs out; A signs back in: everything of A's is as it was.
  await p.goto('https://haloplus.app/#/you', { waitUntil: 'load' });
  await sleep(1500);
  await p.locator('button:has-text("Sign out")').first().click();
  await sleep(2500);
  await signIn(A);
  await until(async () => (await local('school-dashboard:owner')) === A.id, 20000);
  const titlesA = await until(async () => { const t = await cacheTitles(); return t.includes(aOnly) ? t : null; }, 20000);
  check(!!titlesA && !titlesA.includes(bOnly), `A sees A's items and none of B's (${titlesA?.length ?? 0} items)`);
  const aAfter = (await db.from('items').select('id, data, updated_at, deleted_at').eq('user_id', A.id)).data;
  const changed = aAfter.filter((r) => aItems.find((x) => x.id === r.id)?.updated_at !== r.updated_at);
  const added = aAfter.filter((r) => !aItems.some((x) => x.id === r.id));
  check(aAfter.length === aItems.length && aAfter.every((r) => !r.deleted_at) && changed.length === 0, `A's rows on the server are untouched: ${aItems.length} → ${aAfter.length} rows, ${aAfter.filter((r) => r.deleted_at).length} tombstones, ${changed.length} changed${added.length ? `, added: ${added.map((r) => r.data.title).join(', ')}` : ''}${changed.length ? `, e.g. ${changed[0].data.title} ${aItems.find((x) => x.id === changed[0].id)?.data.status} → ${changed[0].data.status}` : ''}`);
  const bLeak = (await db.from('items').select('id').eq('user_id', B.id).in('id', aItems.map((i) => i.id))).data ?? [];
  check(bLeak.length === 0, "none of A's rows exist under B");
  // A's extension sync now reads the same Halo class B already holds: refused, never landed.
  haloTag = 'b';
  const t1 = Date.now();
  await p.evaluate(() => window.postMessage({ kind: 'halo-ext-first-sync' }, location.origin));
  await sleep(15000);
  const landedA = (await db.from('pending_syncs').select('id').eq('user_id', A.id).gte('created_at', new Date(t1).toISOString())).data ?? [];
  check(landedA.length === 0, "a Halo already linked to B's account is refused for A (nothing landed)");
  const psy = (await db.from('courses').select('id').eq('user_id', A.id).eq('data->>haloClassId', 'hc-b')).data ?? [];
  check(psy.length === 0 && (await p.evaluate(() => document.querySelectorAll('.modal-backdrop').length)) === 0, "the refused export was not handed to A's tab either (no PSY-102 in A, no review open)");
  const refused = (await db.from('error_events').select('id, title').eq('fingerprint', 'sync-drop:foreign-halo').gte('created_at', new Date(t1).toISOString())).data ?? [];
  check(refused.length >= 1, `the refusal is in Admin > Errors (${refused[0]?.title ?? 'none'})`);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  proc.kill();
  await db.from('error_events').delete().eq('fingerprint', 'sync-drop:foreign-halo').gte('created_at', new Date(Date.now() - 600000).toISOString()).then(() => undefined, () => undefined);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
