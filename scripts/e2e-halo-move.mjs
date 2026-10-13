// One Halo student, one Halo+ account, and the move (George, 2026-10-11). Real Chrome with the unpacked extension,
// Halo+ from the local build at haloplus.app, Halo mocked (a session whose student is one email); the account rows and
// sync-drop are the real ones (throwaways, marked real for the link rules where the test needs it).
//   A syncs: the Halo is linked to A. B (another real account) syncs the same Halo on the same computer: refused, and
//   B's Halo+ asks "This Halo account is linked to e2***@example.invalid. Move it to this account?". Move: the link is
//   B's, A's Halo data is cleared and noted in Errors, B gets the sync. A syncs again: refused (A stops getting data).
//   A test account can't take it; a test account never links; a classmate (same class ids, another student) is not
//   blocked.
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-halo-move.mjs
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const DROP = `${env.VITE_SUPABASE_URL}/functions/v1/sync-drop`;
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 700) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const run = Date.now().toString(36);
const STUDENT = `move-student-${run}@my.gcu.edu`;
const hashOf = (email) => createHash('sha256').update(`halo-user:${email.toLowerCase()}`).digest('hex').slice(0, 40);
const H = hashOf(STUDENT);
const CLASS = `hc-move-${run}`;
const classes = { getCourseClassesForUser: { courseClasses: [{ id: CLASS, classCode: 'PSY-102-O500', slugId: `PSY-102-O500-${run}`, startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Psychology', stage: 'CURRENT', modality: 'ONLINE', credits: 4, courseCode: 'PSY-102', units: [{ id: 'u1', title: 'Topic 5', sequence: 5, startDate: day(-5), endDate: day(9), assessments: [{ id: `as-${run}`, sequence: 1, title: 'Topic 5 DQ 1', description: '', startDate: day(-3), dueDate: day(3), points: 5, type: 'DISCUSSION', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] }] } };
const post = async (key, haloUser, classIds = [CLASS]) => {
  const payload = { kind: 'halo-export', version: 1, exportedAt: new Date().toISOString(), auto: false, source: 'extension', haloUser, classes: classIds.map((id) => ({ id, courseCode: 'PSY-102', assessments: [] })) };
  const r = await fetch(DROP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, payload, via: 'extension' }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const keyOf = async (id) => (await db.from('sync_keys').select('key').eq('user_id', id).maybeSingle()).data?.key ?? null;
/** The account's own key, made the way Halo+ makes it (my_sync_key), for accounts this test never opens in the browser. */
const keyFor = async (who) => (await (await kit.signIn(who.email)).c.rpc('my_sync_key')).data?.key ?? null;
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 480000);

const boss = await kit.persona('admin');
const bossC = (await kit.signIn(boss.email)).c;
const A = await kit.persona('plus');
const B = await kit.persona('plus');
const E = await kit.persona('plus');
const C = await kit.persona('plus');
const D = await kit.persona('plus');
// A, B and E stand for real students; C and D stay test accounts (their .invalid addresses).
for (const who of [A, B, E]) await bossC.rpc('admin_set_test', { uid: who.id, test: false });
const PASS = `Pw-${Math.random().toString(36).slice(2)}-9x`;
for (const who of [A, B]) await db.auth.admin.updateUserById(who.id, { password: PASS });

const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-move-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
try {
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  // Halo's session for one student: NextAuth's shape, with the student's email.
  await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C', user: { email: STUDENT, name: 'Test Student' } }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
  await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key) && !localStorage.getItem('school-dashboard:owner')) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: A.session, key: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.now-head', { timeout: 30000, state: 'attached' });
  await sleep(3000);
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: EXT });
  await sleep(2500);
  const local = (k) => p.evaluate((key) => localStorage.getItem(key), k);
  await until(async () => (await local('school-dashboard:sync-key')) === (await keyOf(A.id)), 15000);

  // 1. A syncs: the Halo is A's.
  // "Sync now" from the page, asked again every 12 s until the extension's page script is there to hear it.
  const syncNow = () => p.evaluate(() => window.postMessage({ kind: 'halo-ext-first-sync' }, location.origin));
  const t0 = Date.now();
  let lastAsk = 0;
  const landedA = await until(async () => {
    if (Date.now() - lastAsk > 12000) { lastAsk = Date.now(); await syncNow(); }
    return (await db.from('pending_syncs').select('created_at, payload->>haloUser, payload->>haloUserFrom').eq('user_id', A.id).gte('created_at', new Date(t0).toISOString()).limit(1)).data?.[0] ?? null;
  }, 120000, 2000);
  check(!!landedA && landedA.haloUser === H && landedA.haloUserFrom === 'user.email', `A's sync landed, carrying the Halo student's hash, never the email (${landedA?.haloUserFrom})`);
  const linkA = (await db.from('halo_links').select('user_id, class_ids').eq('halo_user', H).maybeSingle()).data;
  check(linkA?.user_id === A.id && linkA.class_ids.includes(CLASS), 'the Halo is linked to A');
  const aHas = await until(async () => (await db.from('courses').select('id').eq('user_id', A.id).eq('data->>haloClassId', CLASS).is('deleted_at', null)).data?.length, 75000, 1500);
  const aMail = (await db.from('pending_syncs').select('consumed_at').eq('user_id', A.id)).data ?? [];
  check(!!aHas, `A's planner has the class (A's mailbox ${aMail.map((m) => (m.consumed_at ? 'taken' : 'waiting')).join(',') || 'empty'}; dialogs: ${await p.locator('[role=dialog]').count()})`);

  // 2. A signs out, B signs in on the same computer and syncs the same Halo.
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
  await p.goto('https://haloplus.app/#/you', { waitUntil: 'load' });
  await sleep(1500);
  await p.locator('button:has-text("Sign out")').first().click();
  await sleep(2500);
  await signIn(B);
  await until(async () => (await local('school-dashboard:sync-key')) === (await keyOf(B.id)), 20000);
  const t1 = Date.now();
  lastAsk = 0;
  const prompt = await until(async () => {
    if ((await p.locator('.halo-move').count()) > 0) return await p.locator('.halo-move').innerText();
    if (Date.now() - lastAsk > 12000) { lastAsk = Date.now(); await syncNow(); }
    return null;
  }, 120000, 1000);
  const masked = `${A.email.slice(0, 2)}***@example.invalid`;
  check(!!prompt && prompt.includes(`This Halo account is linked to ${masked}. Move it to this account?`), `B's Halo+ asks: "${(prompt ?? '').split('\n')[0]}"`);
  check(((await db.from('pending_syncs').select('id').eq('user_id', B.id).gte('created_at', new Date(t1).toISOString())).data ?? []).length === 0, 'nothing reached B before the move');
  await p.screenshot({ path: 'docs/screens/halo-move/prompt-desk-light.png' }).catch(() => undefined);

  const aCourseIds = ((await db.from('courses').select('id').eq('user_id', A.id).eq('data->>haloClassId', CLASS).is('deleted_at', null)).data ?? []).map((r) => r.id);
  // 3. Move.
  await p.locator('.halo-move button:has-text("Move")').click();
  const linkB = await until(async () => { const l = (await db.from('halo_links').select('user_id, via').eq('halo_user', H).maybeSingle()).data; return l?.user_id === B.id ? l : null; }, 20000);
  check(!!linkB && linkB.via === 'student', 'the Halo is linked to B now (moved by the student)');
  const bClass = await until(async () => (await db.from('courses').select('id').eq('user_id', B.id).eq('data->>haloClassId', CLASS).is('deleted_at', null)).data?.[0] ?? null, 45000, 1500);
  check(!!bClass, 'B gets the sync it ran: the class is in B\'s planner');
  // A tombstone keeps only the id, so A's class is looked up by the ids it had before the move.
  const aLeft = (await db.from('courses').select('id, deleted_at').eq('user_id', A.id).in('id', aCourseIds)).data ?? [];
  const aSettings = (await db.from('settings').select('data').eq('user_id', A.id).single()).data.data;
  const aMailNow = (await db.from('pending_syncs').select('id').eq('user_id', A.id)).data ?? [];
  // A move never deletes anything (review, 2026-10-12: the Halo identity is a hash the browser sends, so a destructive move
  // would let anyone wipe a classmate): A keeps what it had and only stops receiving this Halo's syncs.
  check(aLeft.length > 0 && aLeft.every((r) => !r.deleted_at), `A keeps its class (${aLeft.length} rows, ${aLeft.filter((r) => r.deleted_at).length} tombstoned)`);
  void aSettings;
  void aMailNow;
  const note = (await db.from('error_events').select('title, details').eq('fingerprint', 'halo-link:moved').gte('created_at', new Date(t1).toISOString())).data ?? [];
  check(note.some((n) => n.details?.from === A.id && n.details?.to === B.id), `Admin > Errors has the note ("${note[0]?.title}")`);

  // 4. A syncs that Halo again (its extension elsewhere): refused, nothing lands; A gets a move offer, not the data.
  const tA2 = new Date().toISOString();
  const ra = await post(await keyOf(A.id), H);
  check(ra.status === 409 && ra.body.offer === true && ((await db.from('pending_syncs').select('id').eq('user_id', A.id).gte('created_at', tA2)).data ?? []).length === 0, `A stops getting data: nothing new lands (${ra.status}: ${ra.body.why})`);

  // 5. A test account can't take a real account's Halo; a test account never links one.
  const rc = await post(await keyFor(C), H);
  check(rc.status === 409 && rc.body.canMove === false && ((await db.from('halo_move_offers').select('id').eq('user_id', C.id)).data ?? []).length === 0, `a test account can't take it (${rc.status}: ${rc.body.why})`);
  const H2 = hashOf(`another-${run}@my.gcu.edu`);
  const rd = await post(await keyFor(D), H2);
  check(rd.status === 200 && !(await db.from('halo_links').select('user_id').eq('halo_user', H2).maybeSingle()).data, `a test account syncing an unlinked Halo gets its sync but never links it (${rd.status})`);

  // 6. A classmate: the same class ids, another Halo student: never blocked (the Loop 227 mistake).
  const re = await post(await keyFor(E), hashOf(`classmate-${run}@my.gcu.edu`));
  check(re.status === 200, `a classmate in the same section syncs (${re.status})`);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  proc.kill();
  await db.from('error_events').delete().in('fingerprint', ['halo-link:moved', 'sync-drop:test-halo']).gte('created_at', new Date(Date.now() - 900000).toISOString()).then(() => undefined, () => undefined);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
