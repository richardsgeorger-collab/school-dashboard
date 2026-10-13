// Sign up, connect Halo, payoff (George, 2026-10-13: most sign-ups never synced). Real Chrome; Halo+ from the local
// build at haloplus.app; brand-new throwaways on the real backend; Halo mocked (its session and gateway). Checks:
//   L. a laptop in Chrome: Step 2 of 3 is Connect Halo (no welcome, no plan story, no Skip or Later anywhere); the calm
//      line before Chrome's prompt; Add to Chrome; this repo's extension installed as the store would; a live progress
//      bar (the extension's own steps, 0.7.5); the payoff; each step recorded with the device and browser.
//   O. Halo logged out: one clear "log in to Halo", and back on the tab the sync runs again and lands.
//   P. an iPhone: the example week (labeled), "Finish on your laptop in 2 minutes", Email me the link (once), Add your
//      syllabus, the phone's own setup one tap away, no skip; Finish on my laptop closes setup and Now keeps the card;
//      the same account on a laptop opens straight at Connect Halo.
//   S. Safari on a Mac: says up front it needs Chrome, Edge or Brave, with the bookmark as the backup.
//   A. Admin: the sign-up funnel lists the new accounts with their steps, and the activity chart has no "Invalid Date".
// Screens (light and dark) to docs/screens/connect/.
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-connect.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/connect';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 500) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 900000);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15';
const assessment = (id, title, due, points, type) => ({ id, sequence: 1, title, description: '', startDate: day(-3), dueDate: day(due), points, type, tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false });
const classes = { getCourseClassesForUser: { courseClasses: [
  { id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [assessment('as1', 'Topic 5 Homework', 3, 20, 'ASSIGNMENT'), assessment('as2', 'Quiz 2', 9, 50, 'QUIZ')] }] },
  { id: 'hc-eng', classCode: 'ENG-105-ONL4', slugId: 'ENG-105-ONL4-20260914', startDate: '2026-09-14', endDate: '2026-12-20', name: 'English Composition I', stage: 'CURRENT', modality: 'ONLINE', credits: 3, courseCode: 'ENG-105', units: [{ id: 'u2', title: 'Topic 4', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [assessment('as3', 'Rhetorical Analysis Final Draft', 6, 150, 'ASSIGNMENT')] }] },
] } };

/** A brand-new throwaway (the free week, as every new account), signed in. */
const newAccount = () => kit.persona('new');

/** Real Chrome with the extension loadable; Halo+ served from the local build; Halo mocked. */
const launch = async (opts = {}) => {
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-connect-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', `--force-dark-mode=${opts.scheme === 'dark'}`, 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const ctx = browser.contexts()[0];
  const state = { loggedIn: true, slow: 0 };
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('https://chromewebstore.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Chrome Web Store</title>Halo+ (test)' }));
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  // Never a real email to a test address: the "email me the link" call answers as the server would.
  await ctx.route('**/rest/v1/rpc/queue_email', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }));
  await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.loggedIn ? { authToken: 'A', contextToken: 'C' } : {}) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
  await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    if (state.slow) await sleep(state.slow);
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  return { browser, ctx, proc, state, close: async () => { await browser.close().catch(() => undefined); proc.kill(); } };
};

const signInPage = async (ctx, who, opts = {}) => {
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  if (opts.ua) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.setUserAgentOverride', { userAgent: opts.ua, platform: opts.platform ?? '' });
    if (opts.touch) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    }
  }
  if (!opts.touch) await p.setViewportSize({ width: 1280, height: 860 });
  if (opts.scheme) await p.emulateMedia({ colorScheme: opts.scheme });
  await p.goto(`https://haloplus.app/#/${opts.route ?? 'start'}`, { waitUntil: 'load' });
  await sleep(4000);
  return p;
};
const text = (p) => p.locator('.onboard').innerText().catch(() => '');
const noSkip = async (p) => (await p.locator('button:has-text("Skip for now"), button:has-text("Later"), button:has-text("Not now")').count()) === 0;
const steps = async (uid) => (await db.from('onboarding_events').select('step, event, device, browser').eq('user_id', uid)).data ?? [];

try {
  // ---- U. Signed out: sign up is step 1 ------------------------------------------------------------------------------
  {
    const b = await launch();
    try {
      const p = await b.ctx.newPage();
      await p.setViewportSize({ width: 1280, height: 860 });
      await p.goto('https://haloplus.app/#/start', { waitUntil: 'load' });
      const t = await until(async () => { const x = await text(p); return /Step 1 of 3: Sign up/.test(x) ? x : null; }, 30000, 500);
      check(!!t && /Log in/.test(t) && (await noSkip(p)) && !/keep everything on this device/.test(t), 'U. signed out: Step 1 of 3 is Sign up, with Log in for an account already made, and no way around it');
      await sleep(800);
      await p.screenshot({ path: `${OUT}/laptop-0-sign-up-light.png` });
    } finally {
      await b.close();
    }
  }

  // ---- L. A laptop in Chrome --------------------------------------------------------------------------------------
  for (const scheme of ['light', 'dark']) {
    const who = await newAccount();
    const b = await launch({ scheme });
    b.state.slow = 900;
    try {
      const p = await signInPage(b.ctx, who, { scheme });
      await p.waitForSelector('.onboard [aria-label="Add the extension"]', { timeout: 30000 }).catch(() => undefined);
      const t1 = await text(p);
      if (scheme === 'light') {
        check(/Step 2 of 3: Connect Halo/.test(t1), `L. a new account lands on "Step 2 of 3: Connect Halo" (${t1.split('\n')[0]})`);
        check(/Add Halo\+ to Chrome\./.test(t1) && t1.includes('Chrome will ask to read halo.gcu.edu. Halo+ only reads your own classes and never sees your password.'), 'L. the calm line comes before Add to Chrome');
        check(await noSkip(p), 'L. no Skip for now, Later or Not now on a laptop');
        check(!/Welcome to Max|Free beside|Start my free week|plan-compare/.test(t1) && (await p.locator('.plan-compare, .plan-offer').count()) === 0, 'L. no plan story');
      }
      await p.screenshot({ path: `${OUT}/laptop-1-connect-${scheme}.png` });
      await p.evaluate(() => { const a = [...document.querySelectorAll('.onboard a')].find((x) => /Add to Chrome/.test(x.textContent)); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
      await sleep(1200);
      if (scheme === 'light') check(/Press Add to Chrome, then Add extension\./.test(await text(p)), 'L. after Add to Chrome: it waits for the extension');
      await p.screenshot({ path: `${OUT}/laptop-2-waiting-${scheme}.png` });
      const t0 = Date.now();
      const cdp = await b.browser.newBrowserCDPSession();
      await cdp.send('Extensions.loadUnpacked', { path: EXT });
      const bar = await until(() => p.locator('.onboard .sync-bar').count(), 30000, 300);
      if (scheme === 'light') check(!!bar && /Bringing in your classes/.test(await text(p)), `L. the extension shows up by itself and the first sync starts with a live bar (${Math.round((Date.now() - t0) / 1000)} s)`);
      const stepSeen = await until(async () => { const l = await p.locator('.sync-bar-label').innerText().catch(() => ''); return /Reading .+\(\d of \d\)/.test(l) ? l : null; }, 30000, 200);
      const pct = Number(await p.locator('.sync-bar').getAttribute('aria-valuenow').catch(() => '0'));
      if (scheme === 'light') check(!!stepSeen && pct > 0, `L. the bar follows the extension's own steps: "${(stepSeen ?? '').split('\n')[0]}" at ${pct}%`);
      await p.screenshot({ path: `${OUT}/laptop-3-progress-${scheme}.png` });
      const payoff = await until(() => p.locator('.onboard-payoff').count(), 120000, 1000);
      const t3 = await text(p);
      if (scheme === 'light') check(!!payoff && /from 2 classes/.test(t3) && /Optional: pin Halo\+/.test(t3), `L. the payoff, with pinning as an optional line (${Math.round((Date.now() - t0) / 1000)} s)`);
      await sleep(1500);
      await p.screenshot({ path: `${OUT}/laptop-4-payoff-${scheme}.png` });
      if (scheme === 'light') {
        const ev = await steps(who.id);
        const has = (s) => ev.some((e) => e.step === s);
        check(has('connect:store') && has('connect:ext-found') && has('connect:halo'), `L. Admin's steps were recorded: ${['connect:store', 'connect:ext-found', 'connect:halo'].map((s) => `${s} ${has(s) ? 'yes' : 'no'}`).join(', ')}`);
        check(ev.some((e) => e.device === 'laptop' && e.browser === 'Chrome'), 'L. each step carries the device and browser (laptop, Chrome)');
        const st = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
        check(st.lastPull?.via === 'extension', `L. the sync came through the extension (${st.lastPull?.via})`);
        const prof = await until(async () => { const r = (await db.from('profiles').select('trial_synced_at, trial_ends_at').eq('user_id', who.id).single()).data; return r?.trial_synced_at ? r : null; }, 90000, 2000);
        const days = prof ? (Date.parse(prof.trial_ends_at) - Date.parse(prof.trial_synced_at)) / 864e5 : 0;
        check(!!prof && Math.abs(days - 7) < 0.01 && Math.abs(Date.parse(prof.trial_synced_at) - t0) < 180_000, `L. the free week starts at the first sync: seven days from it (${days.toFixed(3)} days)`);
      }
    } finally {
      await b.close();
    }
  }

  // ---- O. Halo logged out ------------------------------------------------------------------------------------------
  {
    const who = await newAccount();
    const b = await launch();
    b.state.loggedIn = false;
    try {
      const p = await signInPage(b.ctx, who);
      await p.waitForSelector('.onboard [aria-label="Add the extension"]', { timeout: 30000 }).catch(() => undefined);
      const cdp = await b.browser.newBrowserCDPSession();
      await cdp.send('Extensions.loadUnpacked', { path: EXT });
      const asked = await until(async () => /One more thing: log in to Halo\./.test(await text(p)), 60000, 500);
      check(!!asked && (await p.locator('.onboard a:has-text("Log in to Halo")').count()) === 1, 'O. Halo logged out: one clear "log in to Halo"');
      await p.screenshot({ path: `${OUT}/laptop-5-log-in-light.png` });
      b.state.loggedIn = true;
      await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const payoff = await until(() => p.locator('.onboard-payoff').count(), 90000, 1000);
      check(!!payoff, 'O. back on the tab after logging in, the sync runs again and lands');
    } finally {
      await b.close();
    }
  }

  // ---- P. An iPhone, then the same account on a laptop -------------------------------------------------------------
  for (const scheme of ['light', 'dark']) {
    const who = await newAccount();
    const b = await launch({ scheme });
    try {
      const p = await signInPage(b.ctx, who, { ua: IPHONE, platform: 'iPhone', touch: true, scheme });
      await p.waitForSelector('.onboard .phone-connect', { timeout: 30000 }).catch(() => undefined);
      await until(() => p.locator('.example-week-list li:not(.example-loading)').count(), 10000, 300);
      const t1 = await text(p);
      if (scheme === 'light') {
        check(/Finish on your laptop in 2 minutes\./.test(t1) && /Example/i.test(t1) && /A made-up student's week/.test(t1) && (await p.locator('.example-week-list li:not(.example-loading)').count()) >= 3, `P. a phone sees an example week, labeled, and "Finish on your laptop in 2 minutes" (${await p.locator('.example-week-list li').count()} rows)`);
        check(/Email me the link/.test(t1) && /Add your syllabus/.test(t1) && /Set up on this phone instead/.test(t1), 'P. Email me the link, Add your syllabus, and the phone setup one tap away');
        check(await noSkip(p), 'P. no Skip for now on a phone');
      }
      await p.screenshot({ path: `${OUT}/phone-1-connect-${scheme}.png`, fullPage: true });
      await p.locator('.onboard button:has-text("Email me the link")').click();
      const sent = await until(async () => /Sent to .+\. Open it on your laptop\./.test(await text(p)), 10000, 300);
      if (scheme === 'light') check(!!sent && (await p.locator('.onboard button:has-text("Email me the link")').count()) === 0, 'P. the link is sent once, and says where');
      await p.screenshot({ path: `${OUT}/phone-2-sent-${scheme}.png`, fullPage: true });
      await p.locator('.onboard button:has-text("Finish on my laptop")').click();
      await sleep(2500);
      const closed = (await p.locator('.onboard').count()) === 0;
      const card = await p.locator('.phone-connect-card').count();
      if (scheme === 'light') check(closed && card === 1, 'P. Finish on my laptop closes setup; Now keeps the example and the laptop step');
      await p.screenshot({ path: `${OUT}/phone-3-now-${scheme}.png`, fullPage: true });
      if (scheme === 'light') {
        const st = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
        check(!!st.onboarding?.laptopAt && !!st.onboarding?.emailedAt, 'P. the account remembers: finish on a laptop, link emailed');
        const ev = await steps(who.id);
        check(ev.some((e) => e.step === 'connect:handoff' && e.device === 'phone' && e.browser === 'Safari'), 'P. recorded as a phone in Safari choosing the laptop');
        // The same account on a laptop.
        const l = await launch();
        try {
          const lp = await signInPage(l.ctx, who, { route: 'now' });
          const at = await until(async () => /Add Halo\+ to Chrome\./.test(await text(lp)), 30000, 500);
          check(!!at, 'P. the next laptop open goes straight to Connect Halo');
          await lp.screenshot({ path: `${OUT}/laptop-6-after-phone-light.png` });
        } finally {
          await l.close();
        }
      }
    } finally {
      await b.close();
    }
  }

  // ---- S. Safari on a Mac ------------------------------------------------------------------------------------------
  {
    const who = await newAccount();
    const b = await launch();
    try {
      const p = await signInPage(b.ctx, who, { ua: MAC_SAFARI, platform: 'MacIntel' });
      const t1 = await until(async () => { const t = await text(p); return /Halo\+ connects in Chrome, Edge or Brave\./.test(t) ? t : null; }, 30000, 500);
      check(!!t1 && /Safari can't run it/.test(t1) && /Copy the link/.test(t1) && /bookmark in Safari/.test(t1), 'S. Safari on a Mac: needs Chrome, Edge or Brave, said up front, with the bookmark as the backup');
      check(await noSkip(p), 'S. no skip there either');
      await sleep(1000);
      await p.screenshot({ path: `${OUT}/laptop-7-safari-light.png` });
    } finally {
      await b.close();
    }
  }

  // ---- A. Admin ----------------------------------------------------------------------------------------------------
  {
    const boss = await kit.persona('admin');
    const c = (await kit.signIn(boss.email)).c;
    const { data, error } = await c.rpc('admin_signup_funnel', { p_days: 14 });
    check(!error && Array.isArray(data?.accounts), `A. admin_signup_funnel answers (${data?.accounts?.length ?? 0} real accounts in 14 days)`);
    const b = await launch();
    try {
      const p = await signInPage(b.ctx, boss, { route: 'admin' });
      await until(() => p.locator('.admin-signup-funnel table').count(), 30000, 500);
      const t = await p.locator('.admin-signup-funnel').innerText().catch(() => '');
      check(/Sign-up to first sync/i.test(t) && /Pressed Add to Chrome/.test(t) && /A sync landed/.test(t), 'A. Admin shows the sign-up funnel');
      check(!/Invalid Date/.test(await p.locator('body').innerHTML()), 'A. the activity chart has no "Invalid Date"');
    } finally {
      await b.close();
    }
  }
} finally {
  clearTimeout(hard);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
