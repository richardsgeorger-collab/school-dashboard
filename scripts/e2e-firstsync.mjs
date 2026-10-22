// The first sync, start to finish, many times (George, 2026-10-21: "the core thing cannot fail even 10% of the time").
// Real Chrome (Chrome for Testing) or Edge, a fresh profile and a brand-new throwaway account each run, this repo's
// extension installed the way the store does it (DevTools Extensions.loadUnpacked) while the Web Store tab is in front,
// Halo+ from the local build at haloplus.app, Halo mocked (its pages, session and gateway). A run passes when:
//   the classes land in the account and Halo+ shows the payoff, Halo+ is the tab in front at the end, and nothing was
//   left half-done (no stuck "Syncing" in the extension).
// Scenarios (SCENARIOS=a,b or all):
//   plain        no Halo tab, logged in
//   halo-before  a Halo tab open before the install
//   halo-after   a Halo tab opened right after the install
//   frozen       a Halo tab open for a while and frozen in the background (Edge sleeping tabs, Chrome energy saver)
//   logged-out   Halo logged out at first; the student logs in when asked
//   slow         every Halo answer takes 1.5 s
//   stale        a Halo tab whose page stopped answering (its script never replies), reloading fixes it
//   flaky        Halo's gateway drops the first sync's first answer
//   hang         Halo never answers the first sync's first question: the extension reloads Halo and tries again itself
//   closed       the Halo tab the extension is reading is closed mid-sync (a student closing a strange tab)
//   KEYS_ENV=... [BROWSER=chrome|edge] [RUNS=n] [SCENARIOS=all] [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-firstsync.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const BROWSER = process.env.BROWSER ?? 'chrome';
const EXE = BROWSER === 'edge' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : chromium.executablePath();
const ALL = ['plain', 'halo-before', 'halo-after', 'frozen', 'logged-out', 'slow', 'stale', 'flaky', 'hang', 'closed'];
const SCENARIOS = !process.env.SCENARIOS || process.env.SCENARIOS === 'all' ? ALL : process.env.SCENARIOS.split(',');
const RUNS = Number(process.env.RUNS ?? SCENARIOS.length);
const LIMIT_MS = Number(process.env.LIMIT_MS ?? 150_000);
const OUT = 'docs/screens/firstsync';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 500) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(every); } return null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const A = (id, title, due, points, type) => ({ id, sequence: 1, title, description: '', startDate: day(-3), dueDate: day(due), points, type, tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false });
const classes = { getCourseClassesForUser: { courseClasses: [
  { id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [A('as1', 'Topic 5 Homework', 3, 20, 'ASSIGNMENT'), A('as2', 'Quiz 2', 9, 50, 'QUIZ')] }] },
  { id: 'hc-eng', classCode: 'ENG-105-ONL4', slugId: 'ENG-105-ONL4-20260914', startDate: '2026-09-14', endDate: '2026-12-20', name: 'English Composition I', stage: 'CURRENT', modality: 'ONLINE', credits: 3, courseCode: 'ENG-105', units: [{ id: 'u2', title: 'Topic 4', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [A('as3', 'Rhetorical Analysis Final Draft', 6, 150, 'ASSIGNMENT')] }] },
] } };

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 600);
  // Edge on a Mac does not start headless (it waits on a first-run prompt it never shows): it runs in a real window,
  // placed off screen.
  const look = BROWSER === 'edge' ? ['--use-mock-keychain', '--window-position=-3000,-3000', '--window-size=1280,900'] : ['--headless=new'];
  const proc = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), `haloplus-first-${BROWSER}-`))}`, '--enable-unsafe-extension-debugging', ...look, '--no-first-run', '--no-default-browser-check', '--disable-features=msEdgeSidebarV2,msHubApps', 'about:blank'], { stdio: 'ignore' });
  const browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`), 30000, 500);
  if (!browser) throw new Error(`${BROWSER} did not start`);
  return { browser, ctx: browser.contexts()[0], proc };
}

/** Halo's mock: logged in or not, slow or not, and a gateway that can drop the first sync's first answer. */
async function mockHalo(ctx, h) {
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  // The store's own address crashes a test browser (Chrome guards it), so a stand-in tab plays the store.
  await ctx.route('https://store.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Add-ons store</title><h1>Halo+</h1>(test store)' }));
  // LIVE_REPORT=1: run reports reach the server (sync_runs), to check Admin's success rate end to end.
  if (process.env.LIVE_REPORT !== '1') await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  await ctx.route('https://halo.gcu.edu/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(h.loggedIn ? { authToken: 'A', contextToken: 'C' } : {}) });
    if (!h.loggedIn && !url.includes('/login')) return route.fulfill({ status: 302, headers: { location: 'https://halo.gcu.edu/login' }, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Halo</title><main>Halo (test)${url.includes('/login') ? ' login' : ''}</main>` });
  });
  await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    if (h.slow) await sleep(h.slow);
    const body = JSON.parse(route.request().postData() || '{}');
    if (h.hangFirst && body.operationName === 'getCourseClassesForUser') {
      h.hangFirst = false;
      return; // never answered: the first reading goes silent
    }
    if (h.dropFirst && body.operationName === 'getCourseClassesForUser') {
      h.dropFirst = false;
      return route.abort('connectionreset');
    }
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
}

/** What the extension itself sees: the tab in front, whether it still says Syncing, setup's step, Halo tabs open. */
async function extView(ctx, extId) {
  const w = await until(async () => ctx.serviceWorkers().find((x) => x.url().startsWith(`chrome-extension://${extId}/`)) ?? null, 10000, 300);
  if (!w) return null;
  return w.evaluate(async () => {
    const [front] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const s = await chrome.storage.local.get(['running', 'setup', 'lastErrorKind']);
    const halo = await chrome.tabs.query({ url: 'https://halo.gcu.edu/*' });
    return { front: front ? front.url : null, running: !!s.running, setup: s.setup ? s.setup.phase : null, haloTabs: halo.length, error: s.lastErrorKind || null };
  }).catch(() => null);
}

async function run(i, scenario) {
  const who = await kit.persona('new');
  const { browser, ctx, proc } = await launch();
  const h = { loggedIn: scenario !== 'logged-out', slow: scenario === 'slow' ? 1500 : scenario === 'closed' ? 800 : 0, dropFirst: scenario === 'flaky', hangFirst: scenario === 'hang' };
  const t0 = Date.now();
  const notes = [];
  try {
    await mockHalo(ctx, h);
    await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
    // A Halo tab already open: plain, or left in the background and frozen, or one whose page stopped answering.
    let halo = null;
    if (['halo-before', 'frozen', 'stale'].includes(scenario)) {
      halo = await ctx.newPage();
      await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    }
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1280, height: 860 });
    await p.goto('https://haloplus.app/#/start', { waitUntil: 'load' });
    await p.bringToFront();
    const add = await until(() => p.locator('.onboard a:has-text("Add to")').count(), 30000);
    if (!add) throw new Error('no Add to Chrome on Connect Halo');
    if (scenario === 'frozen' && halo) {
      const cdp = await ctx.newCDPSession(halo);
      await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
      notes.push('Halo tab frozen');
    }
    if (scenario === 'stale' && halo) {
      // The page's own script no longer answers: as a tab left open through a deploy or a long sleep.
      await halo.evaluate(() => { window.addEventListener('message', (e) => e.stopImmediatePropagation(), true); });
      notes.push('Halo tab stale');
    }
    // Add to Chrome: the store opens in front, and the extension is installed from there.
    await p.evaluate(() => { const a = [...document.querySelectorAll('.onboard a')].find((x) => /Add to/.test(x.textContent)); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
    const store = await ctx.newPage();
    await store.goto('https://store.example.test/detail/halo', { waitUntil: 'load' });
    await store.bringToFront();
    const cdp = await browser.newBrowserCDPSession();
    if (scenario === 'closed') {
      // The first Halo tab the extension opens is closed a moment after it loads.
      let done = false;
      ctx.on('page', (pg) => {
        if (done) return;
        pg.waitForLoadState('load').then(async () => {
          if (done || !pg.url().startsWith('https://halo.gcu.edu')) return;
          done = true;
          await sleep(1500);
          await pg.close().catch(() => undefined);
          notes.push('closed its Halo tab');
        }).catch(() => undefined);
      });
    }
    const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
    if (scenario === 'halo-after') {
      halo = await ctx.newPage();
      await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    }
    // Logged out: the page says so; the student logs in to Halo (a Halo tab, logged in now) and comes back.
    if (scenario === 'logged-out') {
      const asked = await until(async () => /log in to Halo/i.test(await p.locator('.onboard').innerText()), 60000, 500);
      notes.push(asked ? 'asked to log in' : 'never asked to log in');
      h.loggedIn = true;
      const login = await ctx.newPage();
      await login.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
      await sleep(1500);
    }
    const payoff = await until(() => p.locator('.onboard-payoff').count(), LIMIT_MS, 1000);
    const secs = Math.round((Date.now() - t0) / 1000);
    await sleep(2500);
    const view = await extView(ctx, extId);
    const front = !!view?.front?.startsWith('https://haloplus.app/');
    // Every Halo tab left open is one the student opened (the extension closes its own).
    const studentHalo = (halo ? 1 : 0) + (scenario === 'logged-out' ? 1 : 0);
    if (view) notes.push(`front ${front ? 'Halo+' : view.front}, setup ${view.setup}, ${view.haloTabs} Halo tab(s)`);
    const landed = (await db.from('settings').select('data').eq('user_id', who.id).single()).data?.data?.lastPull?.via ?? null;
    const shot = `${OUT}/${BROWSER}-${String(i + 1).padStart(2, '0')}-${scenario}.png`;
    await p.screenshot({ path: shot }).catch(() => undefined);
    const tidy = !!view && !view.running && view.setup === 'done' && view.haloTabs <= studentHalo;
    // RELAXED=1 (an older extension, for comparison): landed and shown is enough.
    const ok = process.env.RELAXED === '1' ? !!payoff && landed === 'extension' : !!payoff && landed === 'extension' && front && tidy;
    return { i, scenario, ok, secs, notes, why: ok ? '' : !payoff ? `no payoff in ${secs}s: "${(await p.locator('.onboard').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140)}"` : landed !== 'extension' ? 'not in the account' : !front ? 'Halo+ not in front' : `left untidy: ${JSON.stringify(view)}` };
  } catch (e) {
    return { i, scenario, ok: false, secs: Math.round((Date.now() - t0) / 1000), notes, why: String(e.message ?? e).slice(0, 200) };
  } finally {
    await browser.close().catch(() => undefined);
    proc.kill();
  }
}

const results = [];
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, RUNS * (LIMIT_MS + 90_000));
try {
  for (let i = 0; i < RUNS; i++) {
    const scenario = SCENARIOS[i % SCENARIOS.length];
    const r = await run(i, scenario);
    results.push(r);
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${BROWSER} #${i + 1} ${scenario}: ${r.secs}s${r.notes?.length ? ` (${r.notes.join(', ')})` : ''}${r.ok ? '' : `  ${r.why}`}`);
  }
} finally {
  clearTimeout(hard);
  // LIVE_REPORT=1: the runs this test made, as Admin's success rate sees them (before the throwaways go).
  if (process.env.LIVE_REPORT === '1') {
    const { data } = await db.from('sync_runs').select('run_id, user_id, outcome, cause, retried, tab, setup, seconds, ended_at').gte('started_at', new Date(Date.now() - 30 * 60_000).toISOString()).order('started_at');
    for (const r of data ?? []) console.log(`run ${r.run_id}: ${r.outcome ?? 'no end'} ${r.cause ?? ''} retried=${r.retried} tab=${r.tab} setup=${r.setup} ${r.seconds ?? '?'}s account=${r.user_id ? 'yes' : 'no'}`);
  }
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
const pass = results.filter((r) => r.ok).length;
console.log(`${BROWSER}: ${pass} of ${results.length} passed (${Math.round((pass / Math.max(1, results.length)) * 100)}%)`);
process.exit(pass === results.length ? 0 : 1);
