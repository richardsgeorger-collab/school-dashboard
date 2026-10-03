// Auto-sync with the popup never opened (George, 2026-10-02: "Synced yesterday 2:55 PM via extension" at 1 PM the next
// day). The unpacked extension from this repo with its schedule shortened to 30 seconds (in a copy, for this test only),
// a Max throwaway account, Halo faked, Halo+ served from a local build at haloplus.app. The popup page is never opened.
//   1. A Halo tab is already open when the extension is installed (Chrome's own Extensions.loadUnpacked, as after an
//      install or a Web Store update): Chrome gives that tab no content script. The alarm fires on its own, the worker
//      adds the relay to that tab, and the sync lands in the account (auto: true). Before 0.5.1 it went silent and gave
//      up as "Halo stopped answering" two minutes later (George's Chrome, 2026-10-02 8:52 PM).
//   2. Halo logged out (its sign-in timed out): the scheduled sync fails, Halo+ says "Auto-sync paused: log in to
//      Halo" on Now, and Admin → Errors gets one report, not one per run.
//   3. Halo logged in again and opened: a sync runs by itself, lands, and the note goes.
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-autosync-alarm.mjs
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const SRC = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/extension';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

// The extension, copied, with the schedule at 30 seconds (Chrome's shortest). Nothing else changes.
const EXT = mkdtempSync(join(tmpdir(), 'haloplus-ext-src-'));
cpSync(SRC, EXT, { recursive: true });
writeFileSync(join(EXT, 'config.js'), readFileSync(join(EXT, 'config.js'), 'utf8').replace(/PERIOD_MINUTES = \d+(\.\d+)?/, 'PERIOD_MINUTES = 0.5'));

// A Max throwaway.
const email = `e2e-alarm-${Date.now()}@example.invalid`;
const { data: made } = await admin.auth.admin.createUser({ email, email_confirm: true });
const uid = made.user.id;
await admin.from('profiles').update({ tier: 'max' }).eq('user_id', uid);
await admin.from('subscriptions').insert({ user_id: uid, stripe_subscription_id: `sub_alarm_${Date.now()}`, tier: 'max', interval: 'month', status: 'active', current_period_end: new Date(Date.now() + 20 * 864e5).toISOString(), cancel_at_period_end: false });
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signed } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });

// Halo, faked: two classes, and a switch for logged out.
const halo = { loggedOut: false, classCalls: 0 };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const asm = (id, title, n, points) => ({ id, sequence: 1, title, description: '', startDate: day(-3), dueDate: day(n), points, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false });
const classes = { getCourseClassesForUser: { courseClasses: [
  { id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [asm('as1', 'Topic 5 Homework', 3, 20)] }] },
  { id: 'hc-chml', classCode: 'CHM-113L-M600A', slugId: 'CHM-113L-M600A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lab', stage: 'CURRENT', modality: 'ONGROUND', credits: 1, courseCode: 'CHM-113L', units: [{ id: 'u2', title: 'Week 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [asm('as2', 'Stoichiometry Lab', 2, 30)] }] },
] } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };

// Chromium started by hand so the extension can be installed after a Halo tab is open (Chrome's DevTools protocol).
const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-alarm-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
const pages = [];
ctx.on('page', (p) => pages.push(p.url()));
try {
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    if (route.request().url().includes('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(halo.loggedOut ? {} : { authToken: 'A', contextToken: 'C' }) });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Halo</title><h1>Halo (test)</h1><main>My classes</main>' });
  });
  await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.operationName === 'getCourseClassesForUser') halo.classCalls++;
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  await ctx.addInitScript(({ s, key }) => {
    if (location.hostname !== 'haloplus.app' || localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify(s));
    localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings: { timezone: 'America/Phoenix', onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, maxOnboarding: { step: 'done', doneAt: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' } } }));
  }, { s: signed.session, key: `sb-${ref}-auth-token` });
  // A Halo tab open before the extension is there.
  const haloTab = await ctx.newPage();
  await haloTab.setViewportSize({ width: 1280, height: 900 });
  await haloTab.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  await sleep(1000);
  // Now the extension is installed.
  const cdp = await browser.newBrowserCDPSession();
  const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  let worker = await until(() => ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`)) ?? null, 20000, 300);
  check(!!worker && !(await haloTab.evaluate(() => !!document.getElementById('haloplus-joy'))), `installed with the Halo tab already open (extension ${extId})`);
  // The worker sleeps when idle (as in real Chrome); a read finds it again once something wakes it (the 30 s alarm).
  const live = () => ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`)) ?? null;
  const onWorker = async (fn, arg) => {
    for (let k = 0; k < 90; k++) {
      const w = live() ?? worker;
      try {
        return await w.evaluate(fn, arg);
      } catch {
        await sleep(1000);
      }
    }
    throw new Error('the extension worker did not come back');
  };
  const store = (keys) => onWorker((k) => chrome.storage.local.get(k), keys);
  const slot = async () => (await admin.from('pending_syncs').select('created_at, payload->>auto, payload->>source').eq('user_id', uid).order('created_at', { ascending: false }).limit(1)).data?.[0] ?? null;

  // Halo+ once, as a student does after installing: it learns the plan and the account. Then it is closed.
  const dash = await ctx.newPage();
  await dash.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  check(!!(await until(async () => { const s = await store(['tier', 'syncKey']); return s.tier === 'max' && s.syncKey; }, 30000)), 'Halo+ told the extension: Max, and the account key (no popup)');
  await dash.close();
  const t1 = Date.now();
  // Nothing here starts a sync: the alarm has to fire on its own (a minute after the plan arrived, then every 30 s here).
  const landed = await until(async () => { const r = await slot(); return r && Date.parse(r.created_at) > t1 - 5000 ? r : null; }, 180000, 2000);
  check(!!landed && landed.auto === 'true' && landed.source === 'extension', `the alarm fired on its own, the popup never opened, and the sync landed in the account (auto ${landed?.auto}, ${landed ? Math.round((Date.parse(landed.created_at) - t1) / 1000) : '–'} s)`);
  check(halo.classCalls > 0, `it ran in the Halo tab that was open before the install (Halo read ${halo.classCalls}×)`);
  worker = ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`)) ?? worker;
  const alarm = await onWorker(() => chrome.alarms.get('auto-sync'));
  check(!!alarm && alarm.periodInMinutes === 0.5, `the schedule is set (every ${alarm?.periodInMinutes} min in this test; three hours in the build)`);
  const s1 = await store(['lastSyncAt', 'lastErrorKind', 'autoPaused']);
  check(!!s1.lastSyncAt && !s1.lastErrorKind && !s1.autoPaused, `"Last synced" ${s1.lastSyncAt}, no error`);

  // 2. Logged out of Halo (its sign-in timed out). Two scheduled runs; one report.
  halo.loggedOut = true;
  const deviceId = (await store(['deviceId'])).deviceId ?? null;
  const since = new Date().toISOString();
  for (let k = 0; k < 2; k++) {
    await onWorker(() => chrome.storage.local.set({ lastSyncAt: new Date(Date.now() - 4 * 3600_000).toISOString(), lastAttemptAt: null }));
    const t = Date.now();
    await until(async () => { const s = await store(['lastErrorAt', 'running']); return !s.running && s.lastErrorAt && Date.parse(s.lastErrorAt) > t ? s : null; }, 90000, 1500);
  }
  const s2 = await store(['lastErrorKind', 'autoPaused', 'deviceId']);
  check(s2.lastErrorKind === 'logged-out' && s2.autoPaused?.why === 'logged-out', `a scheduled sync on a logged-out Halo pauses auto-sync (${JSON.stringify(s2.autoPaused)})`);
  await sleep(4000);
  const { data: reports } = await admin.from('error_events').select('title, place, ext_version, device_id, created_at').eq('kind', 'extension').eq('device_id', s2.deviceId ?? deviceId).gte('created_at', since);
  const paused = (reports ?? []).filter((r) => /auto-sync paused: logged out of Halo/i.test(r.title));
  check(paused.length === 1, `Admin → Errors gets it once for the stretch, not per run (${paused.length}: "${paused[0]?.title}")`);
  const d2 = await ctx.newPage();
  await d2.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  const note = await until(() => d2.locator('.autosync-paused').innerText().catch(() => null), 30000);
  check(/Auto-sync paused: log in to Halo\./.test(note ?? ''), `Halo+ says so on Now: "${(note ?? '').replace(/\s+/g, ' ')}"`);
  await d2.locator('.autosync-paused').scrollIntoViewIfNeeded();
  await d2.screenshot({ path: `${OUT}/autosync-paused-now.png` });

  // 3. Logged in again and Halo opened: a sync runs by itself, and the note goes.
  halo.loggedOut = false;
  // The schedule is pushed out of the way, and the last attempt made older than the two-minute guard: only opening
  // Halo can start this sync.
  await onWorker(async () => { await chrome.alarms.create('auto-sync', { delayInMinutes: 30, periodInMinutes: 30 }); await chrome.storage.local.set({ lastAttemptAt: new Date(Date.now() - 5 * 60_000).toISOString() }); });
  const t3 = Date.now();
  await haloTab.reload({ waitUntil: 'load' });
  const back = await until(async () => { const r = await slot(); return r && Date.parse(r.created_at) > t3 ? r : null; }, 90000, 2000);
  check(!!back && back.auto === 'true' && Date.parse(back.created_at) - t3 < 30000, `opening Halo logged in picks auto-sync up at once (${back ? Math.round((Date.parse(back.created_at) - t3) / 1000) : '–'} s)`);
  const gone = await until(async () => (await d2.locator('.autosync-paused').count()) === 0, 30000);
  check(!!gone && !(await store(['autoPaused'])).autoPaused, 'the note goes from Halo+ by itself');
  check(!pages.some((u) => u.includes('popup.html')), 'the popup was never opened');
  await admin.from('error_events').delete().eq('device_id', s2.deviceId ?? deviceId).gte('created_at', since);
} finally {
  await browser.close().catch(() => undefined);
  proc.kill();
  await admin.auth.admin.deleteUser(uid);
  console.log('removed the throwaway');
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
