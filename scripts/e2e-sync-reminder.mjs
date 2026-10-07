// The sync reminder (George, 2026-10-06), on the real backend with throwaway accounts, desktop and phone, light and
// dark. (1) Never synced on the free week: "You haven't synced Halo yet!" before anything else, straight into this
// device's setup; Later closes it for the visit, the next open brings it back. (2) Last sync 2 days ago: the amber
// banner on Now with Sync now (no extension: Halo opens in a new tab with the bookmark note); 4 days: red. (3) The
// extension on this computer, 7 hours without a sync: "Auto-sync hasn't run since …" with Open Halo. Free: none of it.
// Never two sync prompts: the synced line steps aside. Then, with the real extension installed (DevTools
// Extensions.loadUnpacked), Sync now on the banner runs it and the banner turns into "Synced" and goes. Halo is faked.
// Screens to docs/screens/sync-reminder/.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-sync-reminder.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/sync-reminder';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const DEV = { desk: { viewport: { width: 1280, height: 860 } }, phone: { ...devices['iPhone 14'] } };
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const patch = async (id, extra) => {
  const d = (await db.from('settings').select('data').eq('user_id', id).single()).data.data;
  await db.from('settings').update({ data: { ...d, ...extra, updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('user_id', id);
};
const lastPull = (at, via = 'bookmark') => ({ lastPull: { at, build: null, counts: { classes: 6, assessments: 20 }, via }, extSetup: { shownAt: new Date().toISOString(), skippedAt: new Date().toISOString() } });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (s, dev, scheme, init) => {
  const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  if (init) await ctx.addInitScript(init);
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await ctx.route('https://halo.gcu.edu/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title>Halo (test)' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await sleep(5000);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  return { ctx, p };
};
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

try {
  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    const first = dev === 'desk' && scheme === 'light';
    const tag = `${dev}-${scheme}`;
    // (1) Never synced, on the free week.
    {
      const s = await kit.persona('synced');
      await db.from('items').delete().eq('user_id', s.id);
      await db.from('courses').delete().eq('user_id', s.id);
      await patch(s.id, { lastPull: null, haloPulls: {}, extSetup: { shownAt: new Date().toISOString(), skippedAt: new Date().toISOString() } });
      const { ctx, p } = await open(s, dev, scheme);
      const sheet = await text(p, '.never-synced');
      if (first) check(/You haven't synced Halo yet!/.test(sheet) && /can't show your deadlines, grades, or announcements until you do\. Takes 2 minutes\./.test(sheet), `never synced: the sheet before anything else ("${sheet.slice(0, 120)}")`);
      if (scheme === 'light') check(dev === 'desk' ? /Add the extension to Chrome/.test(sheet) : /Set up on this phone/.test(sheet), `${dev}: it leads to this device's setup ("${await text(p, '.never-synced .btn.primary')}")`);
      await p.screenshot({ path: `${OUT}/1-never-synced-${tag}.png` });
      await p.click('.never-synced-later');
      await sleep(800);
      if (first) check((await p.locator('.never-synced').count()) === 0 && (await p.locator('.connect-halo').count()) === 1 && (await p.locator('.autosync-chip').count()) === 0, 'Later: gone for this visit, the Connect Halo card under it (the "Not synced yet" pill leads, no second chip)');
      await p.screenshot({ path: `${OUT}/1b-after-later-${tag}.png` });
      await p.reload({ waitUntil: 'load' });
      await sleep(5000);
      if (first) check((await p.locator('.never-synced').count()) === 1, 'the next open: back again');
      await p.click('.never-synced .btn.primary');
      await sleep(1500);
      const ob = await text(p, '.onboard');
      if (first) check((await p.locator('.never-synced').count()) === 0 && /Connect Halo the easy way|Add to Chrome/.test(ob), `its button opens the extension setup for desktop Chrome ("${ob.slice(0, 80)}")`);
      if (dev === 'phone' && scheme === 'light') check((await p.locator('.never-synced').count()) === 0 && /bookmark|Copy/i.test(ob), `phone: its button opens the phone's setup ("${ob.slice(0, 80)}")`);
      await ctx.close();
    }
    // (2) Two days, then four, without a sync; no extension.
    {
      const s = await kit.persona('plus');
      await patch(s.id, lastPull(hoursAgo(50)));
      const { ctx, p } = await open(s, dev, scheme);
      const b = await text(p, '.sync-reminder');
      if (first) check(/^Last synced 2 days ago\. Sync now so you don't miss anything\. Sync now$/.test(b) && (await p.locator('.sync-reminder').getAttribute('data-level')) === 'amber', `2 days: "${b}" (amber)`);
      if (first) check((await p.locator('.synced').count()) === 0 && (await p.locator('.autosync-paused, .autosync-callout').count()) === 0, 'one prompt: the synced line and the auto-sync pop-up step aside');
      await p.screenshot({ path: `${OUT}/2-two-days-${tag}.png` });
      if (first) {
        const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), p.click('.sync-reminder .btn')]);
        await sleep(500);
        check(!!tab && /halo\.gcu\.edu/.test(tab.url()) && /On Halo, log in and click 😇 Sync Halo\./.test(await text(p, '.sync-reminder')), `Sync now without the extension: Halo in a new tab, and "${await text(p, '.sync-reminder-note')}"`);
        await p.bringToFront();
        await p.screenshot({ path: `${OUT}/2b-sync-now-note-${tag}.png` });
      }
      await ctx.close();
      await patch(s.id, lastPull(hoursAgo(98)));
      const again = await open(s, dev, scheme);
      const red = await text(again.p, '.sync-reminder');
      if (first) check(/^Last synced 4 days ago\./.test(red) && (await again.p.locator('.sync-reminder').getAttribute('data-level')) === 'red', `4 days: "${red}" (red)`);
      await again.p.screenshot({ path: `${OUT}/3-four-days-red-${tag}.png` });
      await again.ctx.close();
    }
    // (3) The extension on this computer, 7 hours without a sync.
    {
      const s = await kit.persona('max');
      await patch(s.id, lastPull(hoursAgo(7), 'extension'));
      const { ctx, p } = await open(s, dev, scheme, () => localStorage.setItem('school-dashboard:ext-version', '0.5.2'));
      const b = await text(p, '.sync-reminder');
      if (first) check(/^Auto-sync hasn't run since .+\. Open Halo once to wake it up\. Open Halo ↗$/.test(b) && (await p.locator('.sync-reminder a[href="https://halo.gcu.edu/"]').count()) === 1, `extension idle 7 hours: "${b}"`);
      await p.screenshot({ path: `${OUT}/4-auto-sync-idle-${tag}.png` });
      await ctx.close();
    }
    // Free: no reminder (its own paused banner stays as it is).
    if (first) {
      const s = await kit.persona('ended');
      await patch(s.id, lastPull(hoursAgo(98)));
      const { ctx, p } = await open(s, dev, scheme);
      check((await p.locator('.sync-reminder, .never-synced').count()) === 0, `Free with a 4-day-old sync: no reminder${(await p.locator('.frozen-banner').count()) ? ', the paused banner as before' : ''}`);
      await ctx.close();
    }
  }
} catch (e) {
  check(false, `the browser run stopped: ${e?.message ?? e}`);
} finally {
  await browser.close();
}

// The real extension: Sync now on the banner runs it, and the sync landing turns the banner into "Synced".
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const classes = { getCourseClassesForUser: { courseClasses: [{ id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as1', sequence: 1, title: 'Topic 5 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] }] } };
let proc = null;
let cdpBrowser = null;
try {
const who = await kit.persona('plus');
await patch(who.id, lastPull(hoursAgo(50)));
const port = 9300 + Math.floor(Math.random() * 600);
proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-remind-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);
cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = cdpBrowser.contexts()[0];
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
  await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  const cdp = await cdpBrowser.newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.sync-reminder', { timeout: 30000 }).catch(() => undefined);
  await until(() => p.evaluate(() => !!localStorage.getItem('school-dashboard:ext-version')), 15000, 500);
  check(/Last synced 2 days ago/.test(await text(p, '.sync-reminder')), 'with the extension installed: the 2-day banner');
  const t0 = Date.now();
  await p.click('.sync-reminder .btn');
  await sleep(600);
  check(/Syncing/.test(await text(p, '.sync-reminder')), `Sync now asks the extension: "${await text(p, '.sync-reminder')}"`);
  const ok = await until(async () => ((await p.locator('.sync-reminder[data-level="ok"]').count()) ? text(p, '.sync-reminder') : null), 120000, 500);
  check(!!ok && /Synced/.test(ok), `the sync lands (${Math.round((Date.now() - t0) / 1000)} s): "${ok}"`);
  await p.screenshot({ path: `${OUT}/5-synced-desk-light.png` });
  const gone = await until(async () => (await p.locator('.sync-reminder').count()) === 0, 6000, 300);
  check(!!gone && (await p.locator('.synced').count()) === 1, `then it goes, the synced line back: "${await text(p, '.synced')}"`);
} catch (e) {
  check(false, `the extension run stopped: ${e?.message ?? e}`);
} finally {
  await cdpBrowser?.close().catch(() => undefined);
  proc?.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
