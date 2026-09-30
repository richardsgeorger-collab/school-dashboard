// The Chrome extension, loaded unpacked into Chromium exactly as George would (chrome://extensions → Load unpacked →
// extension/), against the live haloplus.app with throwaway accounts; only Halo is faked, answering at a real
// account's pace when asked (2026-09-30).
//   1. Sync now in the popup: runs at once, shows real progress, finishes past the old 90-second cutoff, classes land.
//   2. Logged out of Halo: the popup says so calmly, with a link to log in, and no badge.
//   3. The three-hour schedule: with no Halo tab open, one opens in the background (never active), is closed after,
//      nothing takes focus, and an open Halo+ tab applies the sync quietly (no review sheet, an Undo note).
//   4. With Halo+ closed, a scheduled sync goes to the account's pending slot; Halo+ takes it when it opens and Now
//      says the time Halo was read, "via extension". Never seen Halo+ (no key): it says it did not land, then lands.
//   5. Opening Halo no longer syncs by itself; Free gets no scheduled sync.
//   KEYS_ENV=... [ONLY=popup|loggedout|schedule|closed|nokey|free] node scripts/e2e-extension.mjs
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const SITE = process.env.SITE ?? 'https://haloplus.app/';
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const OUT = 'docs/screens/extension';
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY;
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const made = [];
const newUser = async (free = false) => {
  const email = `e2e-ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  if (free) await admin.from('profiles').update({ tier: 'free', trial_started_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), trial_ends_at: new Date(Date.now() - 13 * 86_400_000).toISOString() }).eq('user_id', data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const unit = (id, title, as) => ({ id, title, sequence: 1, startDate: day(-5), endDate: day(9), assessments: as });
const asm = (id, title, n, points) => ({ id, sequence: 1, title, description: '', startDate: day(-3), dueDate: day(n), points, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false });
const classes = (extra) => ({ getCourseClassesForUser: { courseClasses: [
  { id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [unit('u1', 'Topic 5', [asm('as1', 'Topic 5 Homework', 3, 20), ...(extra ? [asm('as3', 'Topic 6 Homework', 8, 20)] : [])])] },
  { id: 'hc-chml', classCode: 'CHM-113L-M600A', slugId: 'CHM-113L-M600A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lab', stage: 'CURRENT', modality: 'ONGROUND', credits: 1, courseCode: 'CHM-113L', units: [unit('u2', 'Week 5', [asm('as2', 'Stoichiometry Lab', 2, 30)])] },
] } });
// LOCAL_SITE=dist-site serves haloplus.app from a local build (SITE_BASE=/), to test the app before it is deployed.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml' };
const serveLocal = (dist) => (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
  let file = join(dist, path || 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
};
const fakeHalo = async (ctx, calls, opts) => {
  if (process.env.LOCAL_SITE) await ctx.route('https://haloplus.app/**', serveLocal(process.env.LOCAL_SITE));
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.loggedOut ? {} : { authToken: 'A', contextToken: 'C' }) });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Halo</title><h1>Halo (test)</h1><main>My classes</main>' });
  });
  await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
    if (opts.delayMs && route.request().method() !== 'OPTIONS') await new Promise((r) => setTimeout(r, opts.delayMs));
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.operationName === 'getCourseClassesForUser') calls.n++;
    const data = body.operationName === 'getCourseClassesForUser' ? classes(opts.extra?.()) : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
};
const settings = { timezone: 'America/Phoenix', onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' } };

const open = async (u, opts = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'haloplus-ext-'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, colorScheme: opts.scheme ?? 'light', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 900 } });
  const calls = { n: 0 };
  await fakeHalo(ctx, calls, opts);
  await ctx.addInitScript(({ s, key, settings }) => { if (location.hostname !== 'haloplus.app' || localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: u.session, key: `sb-${ref}-auth-token`, settings });
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = worker.url().split('/')[2];
  return { ctx, calls, worker, extId };
};
const dashboard = async (ctx) => {
  const dash = await ctx.newPage();
  await dash.goto(`${SITE}#/now`, { waitUntil: 'load' });
  await dash.waitForTimeout(6000);
  return dash;
};
const popupPage = async (ctx, extId) => {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 320, height: 320 });
  await p.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  return p;
};
const cloudCodes = async (id) => ((await admin.from('courses').select('data').eq('user_id', id).is('deleted_at', null)).data ?? []).map((c) => c.data.code).sort();
const fireAlarm = (worker) => worker.evaluate(async () => { await chrome.storage.local.remove('lastSyncAt'); await chrome.alarms.create('auto-sync', { when: Date.now() + 1500, periodInMinutes: 180 }); });
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 1000)); } return false; };

try {
  if (!ONLY || ONLY === 'popup') {
    for (const scheme of process.env.DBG ? ['light'] : ['light', 'dark']) {
      const u = await newUser();
      const { ctx, calls, worker, extId } = await open(u, { delayMs: 9000, scheme });
      await dashboard(ctx);
      const halo = await ctx.newPage();
      await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
      await halo.waitForTimeout(8000);
      if (scheme === 'light') check(calls.n === 0, 'opening Halo no longer syncs by itself');
      const p = await popupPage(ctx, extId);
      await p.screenshot({ path: `${OUT}/popup-${scheme}-1-before.png` });
      const font = await p.$eval('body', (e) => getComputedStyle(e).fontFamily);
      if (process.env.DBG) { worker.on('console', (m) => console.log('   worker:', m.text().slice(0, 160))); halo.on('console', (m) => console.log('   halo:', m.text().slice(0, 160))); }
      const t0 = Date.now();
      await p.click('#sync');
      for (let k = 0; k < 3; k++) { await p.waitForTimeout(4000); if (process.env.DBG) console.log('   progress', (k + 1) * 5, JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(['progress', 'running']))), await worker.evaluate(() => chrome.tabs.query({}).then((t) => t.map((x) => `${x.id}:${(x.url || '').slice(8, 30)}:${x.active ? 'A' : ''}${x.discarded ? 'D' : ''}`).join(' ')))); }
      const mid = await p.evaluate(() => ({ step: document.getElementById('step').innerText, fill: document.getElementById('fill').style.width, disabled: document.getElementById('sync').disabled }));
      await p.screenshot({ path: `${OUT}/popup-${scheme}-2-syncing.png` });
      await until(async () => !(await worker.evaluate(() => chrome.storage.local.get('running').then((s) => s.running))), 12 * 60_000);
      const secs = Math.round((Date.now() - t0) / 1000);
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${OUT}/popup-${scheme}-3-after.png` });
      const status = await p.$eval('#status', (e) => e.innerText);
      const st = await worker.evaluate(() => chrome.storage.local.get(['lastSyncAt', 'lastError']));
      const codes = await cloudCodes(u.id);
      if (scheme === 'light') {
        check(!/mono|Menlo|Courier/i.test(font) && /Inter/.test(font), `the popup uses the app's font: ${font.split(',')[0]}`);
        check(mid.disabled && /Reading|Checking|rubric|Finishing/i.test(mid.step), `while it runs: real progress ("${mid.step}", bar ${mid.fill || 'moving'})`);
        check(!st.lastError && codes.join() === 'CHM-113,CHM-113L', `Sync now finished a ${secs}s sync with no error; classes landed: ${codes.join(', ')}`);
        check(/^Last synced \d{1,2}:\d{2}\s?[AP]M\s*Next sync around \d{1,2}:\d{2}\s?[AP]M$/.test(status), `the popup says "${status}"`);
        // Three hours on, never the same minute (the first alarm after install was a minute out).
        const mins = [...status.matchAll(/(\d{1,2}):(\d{2})\s?([AP])M/g)].map(([, h, m, ap]) => ((Number(h) % 12) + (ap === 'P' ? 12 : 0)) * 60 + Number(m));
        const gap = mins.length === 2 ? (mins[1] - mins[0] + 1440) % 1440 : -1;
        check(gap >= 179 && gap <= 181, `next sync is three hours after the last (${gap} minutes)`);
      }
      await ctx.close();
    }
  }
  if (!ONLY || ONLY === 'loggedout') {
    const u = await newUser();
    const { ctx, worker, extId } = await open(u, { loggedOut: true });
    await dashboard(ctx);
    const p = await popupPage(ctx, extId);
    await p.click('#sync');
    await until(async () => !!(await worker.evaluate(() => chrome.storage.local.get('lastError').then((s) => s.lastError))), 60_000);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/popup-logged-out.png` });
    const text = await p.$eval('#problem', (e) => (e.hidden ? '' : e.innerText.replace(/\s+/g, ' ')));
    const badge = await worker.evaluate(() => chrome.action.getBadgeText({}));
    const tabs = await worker.evaluate(() => chrome.tabs.query({ url: 'https://halo.gcu.edu/*' }).then((t) => t.length));
    check(/logged out of Halo/i.test(text) && /Log in to Halo/.test(text) && badge === '', `logged out: "${text}", no badge`);
    check(tabs === 0, 'the Halo tab it opened is closed again');
    await ctx.close();
  }
  if (!ONLY || ONLY === 'schedule') {
    const u = await newUser();
    let extra = false;
    const { ctx, calls, worker } = await open(u, { extra: () => extra });
    const dash = await dashboard(ctx);
    if (process.env.DBG) { dash.on('console', (m) => console.log('   dash:', m.text().slice(0, 200))); ctx.on('page', (pg) => pg.on('console', (m) => console.log('   page:', pg.url().slice(0, 30), m.text().slice(0, 160)))); }
    // First, a normal Sync now so the account has classes; then the schedule brings one new assignment.
    await worker.evaluate(() => chrome.runtime.sendMessage === undefined);
    await worker.evaluate(async () => { await chrome.storage.local.set({ tier: 'max' }); });
    const work = await ctx.newPage();
    await work.goto('https://example.org/', { waitUntil: 'load' }).catch(() => undefined);
    await work.bringToFront();
    await fireAlarm(worker);
    await until(async () => calls.n >= 1 && !(await worker.evaluate(() => chrome.storage.local.get('running').then((s) => s.running))), 120_000);
    await dash.waitForTimeout(6000);
    if (process.env.DBG) console.log('   after first:', calls.n, JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(['lastSyncAt', 'lastError', 'running', 'progress']))), 'modal', !!(await dash.$('.modal')), await dash.$eval('.done-toast', (e) => e.innerText).catch(() => 'no toast'));
    extra = true;
    const pagesBefore = ctx.pages().length;
    const before = calls.n;
    let haloActive = false;
    worker.evaluate(() => new Promise((r) => { chrome.tabs.onCreated.addListener((t) => { if ((t.pendingUrl || t.url || '').includes('halo.gcu.edu')) r(t.active); }); })).then((a) => { haloActive = a; }).catch(() => undefined);
    await fireAlarm(worker);
    await until(async () => calls.n > before && !(await worker.evaluate(() => chrome.storage.local.get('running').then((s) => s.running))), 180_000);
    await dash.waitForTimeout(3000);
    console.log('   debug', calls.n, JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(['lastSyncAt', 'lastError', 'running', 'progress', 'tier']))), JSON.stringify(await worker.evaluate(() => chrome.tabs.query({}).then((t) => t.map((x) => [x.url, x.active])))));
    const focused = await work.evaluate(() => document.hasFocus() || document.visibilityState === 'visible');
    const haloLeft = await worker.evaluate(() => chrome.tabs.query({ url: 'https://halo.gcu.edu/*' }).then((t) => t.length));
    const toast = await dash.$eval('.done-toast', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
    const modal = !!(await dash.$('.modal'));
    await dash.bringToFront();
    await dash.screenshot({ path: `${OUT}/scheduled-sync-note.png` });
    const items = ((await admin.from('items').select('data').eq('user_id', u.id).is('deleted_at', null)).data ?? []).map((r) => r.data.title);
    check(calls.n > before && haloActive === false && haloLeft === 0 && ctx.pages().length === pagesBefore, `scheduled sync: Halo opened in a background tab (active: ${haloActive}) and closed after (${haloLeft} left)`);
    check(focused, 'what the student was looking at stayed in front');
    check(!modal && /Synced from Halo: 1 new/.test(toast) && /Undo/.test(toast), `the open Halo+ tab applied it quietly: no review sheet, a note "${toast}"`);
    check(items.includes('Topic 6 Homework'), 'the new assignment reached the account');
    await ctx.close();
  }
  if (!ONLY || ONLY === 'closed' || ONLY === 'waiting') {
    // George, 2026-09-30: a 6:08 AM sync read Halo with no Halo+ tab open and was lost. Now it goes to the account.
    const u = await newUser();
    const { ctx, calls, worker, extId } = await open(u);
    const dash = await dashboard(ctx);
    const key = await worker.evaluate(() => chrome.storage.local.get('syncKey').then((s) => s.syncKey || null));
    check(!!key, 'opening Halo+ once gave the extension this account (its sync key)');
    await dash.close();
    await fireAlarm(worker);
    await until(async () => calls.n >= 1 && !(await worker.evaluate(() => chrome.storage.local.get('running').then((s) => s.running))), 120_000);
    const st = await worker.evaluate(() => chrome.storage.local.get(['waiting', 'lastSyncAt', 'lastLanded', 'lastError']));
    const dashTabs = await worker.evaluate(() => chrome.tabs.query({ url: 'https://haloplus.app/*' }).then((t) => t.length));
    const pend = (await admin.from('pending_syncs').select('id, consumed_at, bytes, payload').eq('user_id', u.id)).data ?? [];
    check(pend.length === 1 && !pend[0].consumed_at && pend[0].payload?.source === 'extension' && !st.waiting && dashTabs === 0, `with Halo+ closed, the sync went to the account (${pend.length} pending, ${pend[0]?.bytes} bytes) and opened no Halo+ tab`);
    const p = await popupPage(ctx, extId);
    const status = await p.$eval('#status', (e) => e.innerText.replace(/\s+/g, ' '));
    const lastWhen = status.match(/Last synced (\d{1,2}:\d{2}\s?[AP]M)/)?.[1] ?? null;
    check(st.lastLanded === 'account' && !!st.lastSyncAt && !st.lastError && !!lastWhen, `the popup says "${status}" (landed in the account)`);
    await p.screenshot({ path: `${OUT}/popup-landed-closed.png` });
    await p.close();
    // A minute later, so the time Halo was read and the time Halo+ applies it differ.
    await new Promise((r) => setTimeout(r, 65_000));
    const again = await dashboard(ctx);
    await again.waitForTimeout(6000);
    const codes = await cloudCodes(u.id);
    const taken = ((await admin.from('pending_syncs').select('consumed_at').eq('user_id', u.id)).data ?? [])[0]?.consumed_at;
    check(codes.join() === 'CHM-113,CHM-113L' && !!taken, `opening Halo+ took it from the account and applied it: ${codes.join(', ')}`);
    const line = await again.$eval('.synced', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
    await again.screenshot({ path: `${OUT}/now-after-closed-sync.png` });
    check(/via extension/.test(line) && !!lastWhen && line.includes(lastWhen), `Now says "${line}", the time Halo was read (popup: ${lastWhen})`);
    await ctx.close();
  }
  if (!ONLY || ONLY === 'nokey') {
    // An extension that has never seen this account's Halo+: the sync cannot land, and it says so plainly.
    const u = await newUser();
    const { ctx, calls, worker, extId } = await open(u);
    await worker.evaluate(async () => { await chrome.storage.local.set({ tier: 'max' }); await chrome.storage.local.remove('syncKey'); });
    await fireAlarm(worker);
    await until(async () => calls.n >= 1 && !(await worker.evaluate(() => chrome.storage.local.get('running').then((s) => s.running))), 120_000);
    const st = await worker.evaluate(() => chrome.storage.local.get(['waiting', 'lastSyncAt', 'lastError']));
    const p = await popupPage(ctx, extId);
    const status = await p.$eval('#status', (e) => e.innerText.replace(/\s+/g, ' '));
    const problem = await p.$eval('#problem', (e) => (e.hidden ? '' : e.innerText.replace(/\s+/g, ' ')));
    await p.screenshot({ path: `${OUT}/popup-not-landed.png` });
    check(!st.lastSyncAt && !!st.waiting && !/Last synced/.test(status) && /could not go to your account/.test(problem), `not landed: no "Last synced" ("${status}"), and "${problem}"`);
    await p.close();
    const dash = await dashboard(ctx);
    await dash.waitForTimeout(6000);
    const codes = await cloudCodes(u.id);
    const after = await worker.evaluate(() => chrome.storage.local.get(['waiting', 'lastSyncAt']));
    check(codes.join() === 'CHM-113,CHM-113L' && !after.waiting && !!after.lastSyncAt, `opening Halo+ signed in sent it to the account and applied it: ${codes.join(', ')}`);
    await ctx.close();
  }
  if (!ONLY || ONLY === 'free') {
    const u = await newUser(true);
    const { ctx, calls, worker } = await open(u);
    await dashboard(ctx);
    const tier = await worker.evaluate(() => chrome.storage.local.get('tier').then((s) => s.tier));
    await fireAlarm(worker);
    await new Promise((r) => setTimeout(r, 12000));
    check(tier === 'free' && calls.n === 0, `on Free the schedule does not sync (plan ${tier}, Halo calls ${calls.n})`);
    await ctx.close();
  }
} finally {
  for (const id of made) {
    for (const t of ['pending_syncs', 'sync_keys', 'courses', 'items', 'settings', 'announcements', 'read_ledger', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
