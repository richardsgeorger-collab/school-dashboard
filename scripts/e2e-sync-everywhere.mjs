// Every sync that lands clears every "Syncing" (George, 2026-10-12). Real Chrome with the unpacked extension, Halo+ from
// the local build at haloplus.app, Halo mocked (logged in); the account and sync-drop are real (a throwaway on Plus
// whose last sync is two days old). Four ways in, each must land and leave nothing saying "Syncing":
//   A. the Now banner's Sync now: "✓ Synced just now", the banner goes, the line says "just now", the popup says done;
//   B. the popup's Sync now: the popup shows syncing, then done, and Halo+ takes the sync;
//   C. the 😇 Sync Halo bookmark, run on Halo while the popup is stuck on "Syncing…": Halo+ applies it and the popup
//      stops syncing and shows it as the last sync;
//   D. a run the worker lost (running in storage, nothing from Halo for 3 minutes): the popup says it stopped partway
//      with Try again, and Try again lands.
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-sync-everywhere.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/sync-everywhere';
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
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 600000);

const who = await kit.persona('plus');
const st = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
const old = day(-2);
const pulls = Object.fromEntries(Object.entries(st.haloPulls ?? {}).map(([k, v]) => [k, Object.fromEntries(Object.keys(v).map((kk) => [kk, old]))]));
await db.from('settings').update({ data: { ...st, lastPull: { ...(st.lastPull ?? {}), at: old, via: 'extension' }, haloPulls: pulls, updatedAt: new Date().toISOString() } }).eq('user_id', who.id);
const courses = (await db.from('courses').select('data').eq('user_id', who.id)).data.map((c) => c.data);
const items = (await db.from('items').select('data').eq('user_id', who.id)).data.map((i) => i.data);
// Halo answers with this account's own classes and assignments, so a sync changes nothing but when it happened.
const classes = { getCourseClassesForUser: { courseClasses: courses.map((c, i) => ({ id: c.haloClassId, classCode: `${c.code}-X`, slugId: c.haloSlugId, startDate: '2026-09-08', endDate: '2026-12-20', name: c.name, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: c.code, units: [{ id: `u${i}`, title: 'Topic 5', sequence: 5, startDate: day(-30), endDate: day(60), assessments: items.filter((it) => it.courseId === c.id).map((it, k) => ({ id: it.haloId, sequence: k, title: it.title, description: '', startDate: day(-10), dueDate: it.dueAt, points: it.points, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false })) }] })) } };

const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-every-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
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
  await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C', user: { email: `every-${who.id.slice(0, 8)}@my.gcu.edu` } }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
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
  const clear = async (page = p) => { for (let i = 0; i < 4 && (await page.locator('.modal-backdrop, .levelup, .ext-setup-sheet').count()) > 0; i++) { await page.keyboard.press('Escape'); await sleep(400); if (await page.locator('.ext-setup-sheet button:has-text("Skip for now")').count()) await page.locator('.ext-setup-sheet button:has-text("Skip for now")').first().click().catch(() => undefined); } };
  await clear();
  const cdp = await browser.newBrowserCDPSession();
  const loaded = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const ver = await until(() => p.evaluate(() => localStorage.getItem('school-dashboard:ext-version')), 20000);
  check(ver === JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')).version, `the extension is on this computer (${ver})`);
  await until(async () => (await p.evaluate(() => localStorage.getItem('school-dashboard:sync-key'))) !== null, 15000);
  const extId = loaded.id;
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 380, height: 520 });
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  await sleep(800);
  // The popup's text, read once its last render has caught up with what storage says.
  const popup = async () => { const read = async () => ({ status: (await pop.locator('#status').innerText()).replace(/\s+/g, ' '), button: (await pop.locator('#sync').innerText()).trim(), progress: !(await pop.locator('#progress').isHidden()), storage: await pop.evaluate(() => chrome.storage.local.get(['running', 'lastSyncAt', 'progress', 'progressAt'])) }); let r = await read(); for (let i = 0; i < 10 && !r.storage.running && r.button === 'Syncing…'; i++) { await sleep(300); r = await read(); } return r; };
  const line = p.locator('.now-side .synced-when');
  const cacheAt = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.lastPull?.at ?? null; } catch { return null; } });
  await p.bringToFront();

  // A. The Now banner.
  const banner = p.locator('.sync-reminder');
  await banner.waitFor({ timeout: 15000 });
  check(/Last synced 2 days ago/.test(await banner.innerText()) && (await line.count()) === 1, `A. the banner and the line together: "${(await line.innerText()).trim()}"`);
  const tA = Date.now();
  await clear();
  await banner.locator('button:has-text("Sync now")').click();
  const doneA = await until(async () => /✓ Synced just now/.test(await banner.innerText().catch(() => '')), 90000, 300);
  check(!!doneA, `A. the banner says "✓ Synced just now" (${Math.round((Date.now() - tA) / 1000)} s, no reload)${doneA ? '' : ` (phase ${await banner.getAttribute('data-phase').catch(() => '?')}; extension ${JSON.stringify(await pop.evaluate(() => chrome.storage.local.get(['running', 'progress', 'lastError']))).slice(0, 300)})`}`);
  const seq = [];
  const goneA = await until(async () => { const a = await cacheAt(); if (seq[seq.length - 1] !== a) seq.push(a); return (await banner.count()) === 0; }, 15000, 300);
  console.log('     lastPull values while the check showed:', seq.map((x) => x?.slice(11, 23)).join(' → '));
  check(!!goneA, `A. then the banner goes${goneA ? '' : ` (still: "${(await banner.innerText().catch(() => '')).replace(/\s+/g, ' ')}")`}`);
  check(/^Synced from Halo just now via extension\.$/.test((await line.innerText()).trim()), `A. the line: "${(await line.innerText()).trim()}"`);
  const popA = await until(async () => { const s = await popup(); return !s.storage.running && s.storage.lastSyncAt && Date.parse(s.storage.lastSyncAt) >= tA - 60000 ? s : null; }, 20000);
  check(!!popA && popA.button === 'Sync now' && !popA.progress && /Last synced/.test(popA.status), `A. the popup: "${popA?.status}", button "${popA?.button}"`);

  // B. The popup.
  const tB = Date.now();
  await pop.bringToFront();
  await pop.locator('#sync').click();
  await sleep(400);
  check((await popup()).button === 'Syncing…', 'B. the popup shows it is syncing');
  const landedB = await until(async () => (await db.from('pending_syncs').select('created_at').eq('user_id', who.id).gte('created_at', new Date(tB).toISOString())).data?.[0] ?? null, 90000, 1500);
  const popB = await until(async () => { const s = await popup(); return !s.storage.running && s.storage.lastSyncAt && Date.parse(s.storage.lastSyncAt) >= tB - 5000 ? s : null; }, 30000);
  const extB = await pop.evaluate(() => chrome.storage.local.get(['running', 'progress', 'lastError', 'lastErrorKind', 'lastDrop', 'lastAttemptAt']));
  check(!!landedB && !!popB && popB.button === 'Sync now' && !popB.progress, `B. landed in the account and the popup says done: "${popB?.status}"${popB ? '' : ` (extension: ${JSON.stringify(extB).slice(0, 400)})`}`);
  await pop.screenshot({ path: `${OUT}/b-popup-done.png` });
  const takenB = await until(async () => { const a = await cacheAt(); return a && Date.parse(a) >= tB - 5000 ? a : null; }, 60000);
  const rowB = (await db.from('pending_syncs').select('created_at, consumed_at, payload->>exportedAt').eq('user_id', who.id).order('created_at', { ascending: false }).limit(1)).data?.[0];
  check(!!takenB, `B. Halo+ took it: its last pull moved (mailbox ${rowB?.consumed_at ? 'taken' : 'NOT taken'}; exportedAt ${rowB?.exportedAt}; cache ${await cacheAt()}; line "${(await line.innerText()).trim()}"; active tab ${await p.evaluate(() => document.visibilityState)})`);

  // C. The bookmark, while the popup is stuck on "Syncing…" (a run the worker lost a moment ago).
  await pop.evaluate(() => chrome.storage.local.set({ running: true, progress: 'Sent to the dashboard. Review the changes there.', progressAt: new Date().toISOString() }));
  await sleep(500);
  check((await popup()).button === 'Syncing…', 'C. the popup is stuck on "Syncing…"');
  const halo = await ctx.newPage();
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  const tC = Date.now();
  const opened = ctx.waitForEvent('page', { timeout: 30000 }).catch(() => null);
  await halo.addScriptTag({ content: `(function(){ var s=document.createElement('script'); s.src="https://haloplus.app/halo-sync.js?v="+Date.now(); (document.head||document.documentElement).appendChild(s); })();` });
  const dash = await opened;
  const sent = await until(async () => { const t = await halo.locator('body').innerText().catch(() => ''); return /Sent to the dashboard|did not answer|failed/.test(t) ? t : null; }, 90000, 1000);
  check(!!sent && /Sent to the dashboard/.test(sent), `C. the bookmark ran on Halo: "${(sent ?? '').split('\n').find((l) => /Sent|answer|failed/.test(l))}"`);
  if (dash) await clear(dash);
  const popC = await until(async () => { const s = await popup(); return !s.storage.running && s.storage.lastSyncAt && Date.parse(s.storage.lastSyncAt) >= tC - 5000 ? s : null; }, 45000);
  check(!!popC && popC.button === 'Sync now' && !popC.progress, `C. Halo+ applied the bookmark's sync and the popup stopped syncing: "${popC?.status}"`);
  await pop.screenshot({ path: `${OUT}/c-popup-after-bookmark.png` });

  // D. A run the worker lost three minutes ago.
  await pop.evaluate(() => chrome.storage.local.set({ running: true, progress: 'Reading Halo (3 of 6)…', progressAt: new Date(Date.now() - 180000).toISOString(), runningSince: new Date(Date.now() - 200000).toISOString() }));
  await sleep(800);
  const stuck = await popup();
  check(stuck.button === 'Try again' && /stopped partway: nothing came from Halo for 2 minutes/.test(stuck.status) && !stuck.progress, `D. the popup says: "${stuck.status}", button "${stuck.button}"`);
  await pop.screenshot({ path: `${OUT}/d-popup-stopped.png` });
  const tD = Date.now();
  await pop.locator('#sync').click();
  const popD = await until(async () => { const s = await popup(); return !s.storage.running && s.storage.lastSyncAt && Date.parse(s.storage.lastSyncAt) >= tD - 5000 ? s : null; }, 90000, 1000);
  const extD = await pop.evaluate(() => chrome.storage.local.get(['running', 'progress', 'progressAt', 'lastError', 'lastErrorKind', 'lastAttemptAt']));
  check(!!popD && popD.button === 'Sync now', `D. Try again landed: "${popD?.status}"${popD ? '' : ` (extension: ${JSON.stringify(extD).slice(0, 400)}; Halo tabs: ${ctx.pages().filter((x) => x.url().includes('halo.gcu.edu')).length})`}`);
  check(p.url().endsWith('#/now') && (await p.evaluate(() => performance.getEntriesByType('navigation').length)) === 1, 'Now was never reloaded');
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  proc.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
