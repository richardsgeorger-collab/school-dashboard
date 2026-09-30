// The Chrome extension, loaded unpacked into Chromium exactly as George would (chrome://extensions → Load unpacked →
// extension/), against the live haloplus.app with a throwaway Max account; only Halo is faked (2026-09-30).
//   1. Opening Halo syncs by itself when the last sync is over 30 minutes old: the export reaches the dashboard tab and
//      the classes land in the account.
//   2. Opening Halo again within 30 minutes does not sync again.
//   3. On Free, opening Halo does not sync by itself.
//   KEYS_ENV=... node scripts/e2e-extension.mjs
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const SITE = process.env.SITE ?? 'https://haloplus.app/';
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const OUT = 'docs/screens/extension';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const made = [];
const newUser = async () => {
  const email = `e2e-ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const CLASSES = { getCourseClassesForUser: { courseClasses: [
  { id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 3', sequence: 3, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as1', sequence: 1, title: 'Topic 5 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] },
  { id: 'hc-chml', classCode: 'CHM-113L-M600A', slugId: 'CHM-113L-M600A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lab', stage: 'CURRENT', modality: 'ONGROUND', credits: 1, courseCode: 'CHM-113L', units: [{ id: 'u2', title: 'Week 5', sequence: 5, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as2', sequence: 1, title: 'Stoichiometry Lab', description: '', startDate: day(-3), dueDate: day(2), points: 30, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] },
] } };
const fakeHalo = async (ctx, calls, opts = {}) => {
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.loggedOut ? {} : { authToken: 'A', contextToken: 'C' }) });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Halo</title><h1>Halo (test)</h1><main>My classes</main>' });
  });
  await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
    // A real account's gateway: every call takes a while, so a whole sync runs for minutes.
    if (opts.delayMs && route.request().method() !== 'OPTIONS') await new Promise((r) => setTimeout(r, opts.delayMs));
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.operationName === 'getCourseClassesForUser') calls.n++;
    const data = body.operationName === 'getCourseClassesForUser' ? CLASSES : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
};
const settings = { timezone: 'America/Phoenix', onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' } };

const run = async (label, tier) => {
  const u = await newUser();
  if (tier === 'free') await admin.from('profiles').update({ tier: 'free', trial_started_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), trial_ends_at: new Date(Date.now() - 13 * 86_400_000).toISOString() }).eq('user_id', u.id);
  const dir = mkdtempSync(join(tmpdir(), 'haloplus-ext-'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 900 } });
  const calls = { n: 0 };
  await fakeHalo(ctx, calls);
  await ctx.addInitScript(({ s, key, settings }) => { if (location.hostname !== 'haloplus.app' || localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: u.session, key: `sb-${ref}-auth-token`, settings });
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = worker.url().split('/')[2];
  console.log(`--- ${label}: extension ${extId} loaded from ${EXT}`);
  // The dashboard tells the extension which plan this is.
  const dash = await ctx.newPage();
  await dash.goto(`${SITE}#/now`, { waitUntil: 'load' });
  await dash.waitForTimeout(5000);
  await dash.reload({ waitUntil: 'load' });
  await dash.waitForTimeout(3000);
  const stored = await worker.evaluate(() => chrome.storage.local.get(['tier', 'lastSyncAt']));
  check(stored.tier === tier, `${label}: the extension knows the plan from the dashboard (${stored.tier})`);
  // Open Halo, the way a student does.
  const halo = await ctx.newPage();
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  await halo.bringToFront();
  await halo.waitForTimeout(tier === 'free' ? 9000 : 16000);
  const after = await worker.evaluate(() => chrome.storage.local.get(['lastSyncAt', 'lastError', 'lastCounts']));
  const cloud = (await admin.from('courses').select('data').eq('user_id', u.id).is('deleted_at', null)).data ?? [];
  if (tier === 'free') {
    check(!after.lastSyncAt && calls.n === 0, `${label}: opening Halo on Free does not sync by itself (Halo calls: ${calls.n})`);
  } else {
    await dash.bringToFront();
    await dash.waitForTimeout(4000);
    await dash.screenshot({ path: `${OUT}/after-auto-sync.png` });
    const cloud2 = (await admin.from('courses').select('data').eq('user_id', u.id).is('deleted_at', null)).data ?? [];
    check(!!after.lastSyncAt && !after.lastError && calls.n >= 1, `${label}: opening Halo synced by itself (${JSON.stringify(after.lastCounts)}; error: ${after.lastError ?? 'none'})`);
    check(cloud2.length === 2 && cloud2.some((c) => c.data.code === 'CHM-113L'), `${label}: the classes reached the account: ${cloud2.map((c) => c.data.code).join(', ') || '(none yet)'} (before settling: ${cloud.length})`);
    // Again within 30 minutes: no second sync.
    const before = calls.n;
    await halo.close();
    const again = await ctx.newPage();
    await again.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await again.bringToFront();
    await again.waitForTimeout(9000);
    check(calls.n === before, `${label}: opening Halo again within 30 minutes does not sync again (Halo calls ${before} → ${calls.n})`);
    // Past 30 minutes: it syncs again.
    await worker.evaluate(() => chrome.storage.local.set({ lastSyncAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() }));
    await again.close();
    const third = await ctx.newPage();
    await third.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await third.bringToFront();
    await third.waitForTimeout(16000);
    check(calls.n > before, `${label}: once the last sync is over 30 minutes old, opening Halo syncs again (Halo calls ${before} → ${calls.n})`);
  }
  await ctx.close();
};

const popupRun = async (label, opts) => {
  const u = await newUser();
  const dir = mkdtempSync(join(tmpdir(), 'haloplus-ext-'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 900 } });
  const calls = { n: 0 };
  await fakeHalo(ctx, calls, opts);
  await ctx.addInitScript(({ s, key, settings }) => { if (location.hostname !== 'haloplus.app' || localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: u.session, key: `sb-${ref}-auth-token`, settings });
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = worker.url().split('/')[2];
  const dash = await ctx.newPage();
  await dash.goto(`${SITE}#/now`, { waitUntil: 'load' });
  await dash.waitForTimeout(6000);
  // Halo open and logged in, sync-on-open off so the popup's button is what runs.
  await worker.evaluate(() => chrome.storage.local.set({ syncOnOpen: false }));
  const halo = await ctx.newPage();
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 320, height: 260 });
  await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  const font = await popup.$eval('#last', (e) => getComputedStyle(e).fontFamily);
  await popup.screenshot({ path: `${OUT}/popup-${label}-before.png` });
  const t0 = Date.now();
  await popup.click('#sync');
  // Wait for the button to come back (the popup awaits the whole sync).
  await popup.waitForFunction(() => document.getElementById('sync').textContent === 'Sync now', null, { timeout: 16 * 60_000, polling: 1000 }).catch(() => undefined);
  const secs = Math.round((Date.now() - t0) / 1000);
  await popup.waitForTimeout(1500);
  await popup.screenshot({ path: `${OUT}/popup-${label}-after.png` });
  const st = await worker.evaluate(() => chrome.storage.local.get(['lastSyncAt', 'lastError', 'lastCounts']));
  const shown = await popup.$eval('body', (b) => b.innerText.replace(/\s+/g, ' '));
  await ctx.close();
  return { font, secs, st, shown, calls: calls.n, userId: u.id };
};

try {
  if (!process.env.ONLY || process.env.ONLY === 'slow') {
    const r = await popupRun('slow', { delayMs: 9000 });
    const cloud = (await admin.from('courses').select('data').eq('user_id', r.userId).is('deleted_at', null)).data ?? [];
    check(r.secs > 95 && !r.st.lastError && !!r.st.lastSyncAt, `Sync now on a slow, real-sized sync (${r.secs}s, past the old 90-second cutoff): synced, no error (${r.st.lastError ?? 'none'})`);
    check(cloud.length === 2, `…and the classes reached the account: ${cloud.map((c) => c.data.code).join(', ')}`);
    check(!/mono|Menlo|Courier/i.test(r.font), `the popup uses the app's font: ${r.font.split(',')[0]}`);
    console.log('   popup says:', r.shown.slice(0, 160));
  }
  if (!process.env.ONLY || process.env.ONLY === 'loggedout') {
    const r = await popupRun('loggedout', { loggedOut: true });
    check(!!r.st.lastError && r.secs < 60 && !r.st.lastSyncAt, `logged out of Halo: says so right away (${r.secs}s): "${r.st.lastError}"`);
  }
  if (process.env.ONLY && process.env.ONLY !== 'auto') throw 'done';
  await run('max', 'max');
  await run('free', 'free');
} catch (e) {
  if (e !== 'done') throw e;
} finally {
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'announcements', 'read_ledger', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
