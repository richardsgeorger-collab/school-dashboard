// The "Last synced a day ago" banner on Now (George, 2026-10-11). Real Chrome with the unpacked extension, Halo+ from the
// local build at haloplus.app, Halo mocked; the account and sync-drop are the real ones (a throwaway on Plus whose last
// sync is two days old). The banner and the always-visible "Synced from Halo …" line show together. Sync now with Halo
// logged out: the banner says why in plain words with Try again, never "Syncing…" forever. Logged in, Try again: the
// sync lands, the banner turns into "✓ Synced just now" and goes, no reload, and the last-synced line says "just now".
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-sync-banner.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/sync-banner';
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 500) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 420000);

const who = await kit.persona('plus');
// The last sync two days ago, everywhere it is kept.
const st = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
const old = day(-2);
const pulls = Object.fromEntries(Object.entries(st.haloPulls ?? {}).map(([k, v]) => [k, Object.fromEntries(Object.keys(v).map((kk) => [kk, old]))]));
await db.from('settings').update({ data: { ...st, lastPull: { ...(st.lastPull ?? {}), at: old, via: 'extension' }, haloPulls: pulls, updatedAt: new Date().toISOString() } }).eq('user_id', who.id);
const courses = (await db.from('courses').select('data').eq('user_id', who.id)).data.map((c) => c.data);
const classes = { getCourseClassesForUser: { courseClasses: courses.map((c, i) => ({ id: c.haloClassId, classCode: `${c.code}-X`, slugId: c.haloSlugId, startDate: '2026-09-08', endDate: '2026-12-20', name: c.name, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: c.code, units: [{ id: `u${i}`, title: 'Topic 5', sequence: 5, startDate: day(-5), endDate: day(9), assessments: [] }] })) } };

const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-banner-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
let haloLoggedIn = false;
try {
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(haloLoggedIn ? { authToken: 'A', contextToken: 'C', user: { email: `banner-${who.id.slice(0, 8)}@my.gcu.edu` } } : {}) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
  await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.now-head', { timeout: 30000, state: 'attached' });
  await sleep(2500);
  for (const sel of ['.ext-setup-sheet button:has-text("Skip for now")', '.joy-card button:has-text("Nice")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const ver = await until(() => p.evaluate(() => localStorage.getItem('school-dashboard:ext-version')), 20000);
  check(ver === '0.6.6', `the extension is on this computer (${ver})`);
  await until(async () => (await p.evaluate(() => localStorage.getItem('school-dashboard:sync-key'))) !== null, 15000);

  // Whatever opens over Now on its own (the Sunday review on a Sunday evening, a celebration) is closed first.
  const clear = async () => { for (let i = 0; i < 4 && (await p.locator('.modal-backdrop, .levelup').count()) > 0; i++) { await p.keyboard.press('Escape'); await sleep(400); } };
  await sleep(1500);
  await clear();
  const banner = p.locator('.sync-reminder');
  await banner.waitFor({ timeout: 15000 });
  const line = p.locator('.now-side .synced-when');
  check(/Last synced 2 days ago\./.test(await banner.innerText()), `the banner: "${(await banner.innerText()).split('\n')[0]}"`);
  check((await line.count()) === 1 && /^Synced from Halo .+ via extension\.$/.test((await line.innerText()).trim()), `the last-synced line shows at the same time: "${(await line.innerText()).trim()}"`);
  await p.screenshot({ path: `${OUT}/1-stale-with-line.png` });

  // Halo logged out: a reason and Try again, not "Syncing…" forever.
  await clear();
  await banner.locator('button:has-text("Sync now")').click();
  await sleep(500);
  check(/Syncing/.test(await banner.innerText()), 'pressed: it says it is syncing');
  const failed = await until(async () => { const t = await banner.innerText().catch(() => ''); return /Sync didn't finish/.test(t) ? t : null; }, 90000, 1000);
  check(!!failed && /Halo isn't logged in on this computer\. Log in at halo\.gcu\.edu, then try again\./.test(failed) && (await banner.locator('button:has-text("Try again")').count()) === 1 && (await banner.locator('a:has-text("Open Halo")').count()) === 1, `logged out: "${(failed ?? '').replace(/\s+/g, ' ').slice(0, 120)}", with Open Halo and Try again`);
  await p.screenshot({ path: `${OUT}/2-failed-logged-out.png` });

  // Logged in: Try again lands it, and the banner clears by itself.
  haloLoggedIn = true;
  const before = (await line.innerText()).trim();
  const t0 = Date.now();
  await clear();
  await banner.locator('button:has-text("Try again")').click();
  const done = await until(async () => /✓ Synced just now/.test(await banner.innerText().catch(() => '')), 90000, 300);
  check(!!done, `the sync landed and the banner says "✓ Synced just now" without a reload (${Math.round((Date.now() - t0) / 1000)} s)`);
  await p.screenshot({ path: `${OUT}/3-synced.png` });
  const gone = await until(async () => (await banner.count()) === 0, 10000, 300);
  check(!!gone, 'then the banner goes by itself');
  const after = (await line.innerText()).trim();
  check(after !== before && /^Synced from Halo just now via extension\.$/.test(after), `the last-synced line updated: "${before}" → "${after}"`);
  const landed = (await db.from('pending_syncs').select('created_at').eq('user_id', who.id).gte('created_at', new Date(t0).toISOString())).data ?? [];
  check(landed.length === 1, 'the sync reached the account through sync-drop');
  check(p.url().endsWith('#/now') && (await p.evaluate(() => performance.getEntriesByType('navigation').length)) === 1, 'no reload happened');
  await p.screenshot({ path: `${OUT}/4-after.png` });
  // The top bar's Sync sheet says the same, live.
  await p.locator('button:has-text("Sync")').first().click().catch(() => undefined);
  const sheet = await until(async () => { const t = await p.locator('.synced-when').allInnerTexts(); return t.find((x) => /just now/.test(x) && !x.includes('\n')) ?? null; }, 5000);
  check(!!sheet, `the Sync sheet: "${sheet}"`);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  proc.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
