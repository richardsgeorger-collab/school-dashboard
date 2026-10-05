// A new student on desktop Chrome connects Halo with the extension during onboarding (2026-10-05). Chromium started by
// hand; Halo+ is a local build at haloplus.app; a brand-new throwaway signs up and takes the free week; at "Connect
// Halo the easy way" it presses Add to Chrome (the store is stubbed), then this repo's extension is installed into
// that Chrome (DevTools Extensions.loadUnpacked) as the Web Store would. The page sees it, asks for the first sync,
// the sync lands in the account by itself, and onboarding moves on to the payoff with the classes. Halo is faked.
// Screens light and dark to docs/screens/onboarding/ext-*.png.
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-onboarding-ext.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/onboarding';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const classes = { getCourseClassesForUser: { courseClasses: [
  { id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as1', sequence: 1, title: 'Topic 5 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }, { id: 'as2', sequence: 2, title: 'Quiz 2', description: '', startDate: day(-3), dueDate: day(9), points: 50, type: 'QUIZ', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] },
  { id: 'hc-eng', classCode: 'ENG-105-ONL4', slugId: 'ENG-105-ONL4-20260914', startDate: '2026-09-14', endDate: '2026-12-20', name: 'English Composition I', stage: 'CURRENT', modality: 'ONLINE', credits: 3, courseCode: 'ENG-105', units: [{ id: 'u2', title: 'Topic 4', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as3', sequence: 1, title: 'Rhetorical Analysis Final Draft', description: '', startDate: day(-3), dueDate: day(6), points: 150, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] },
] } };

for (const scheme of ['light', 'dark']) {
  const email = `e2e-onbext-${Date.now()}@example.invalid`;
  const { data: made } = await admin.auth.admin.createUser({ email, email_confirm: true });
  const uid = made.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signed } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-onb-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', `--force-dark-mode=${scheme === 'dark'}`, 'about:blank'], { stdio: 'ignore' });
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
    await ctx.route('https://chromewebstore.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Chrome Web Store</title>Halo+ (test)' }));
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
    await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
      const body = JSON.parse(route.request().postData() || '{}');
      const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
    });
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1280, height: 860 });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto('https://haloplus.app/#/start', { waitUntil: 'load' });
    await sleep(1500);
    // Back from the email link with a brand-new account; the free week.
    await p.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: signed.session, key: `sb-${ref}-auth-token` });
    await p.reload({ waitUntil: 'load' });
    await sleep(3000);
    await p.click('.plan-compare .btn.primary').catch(() => undefined);
    await sleep(800);
    await p.click('.plan-offer button:has-text("Start my free week")').catch(() => undefined);
    await sleep(1500);
    await p.click('.onboard button:has-text("Connect Halo")', { timeout: 8000 }).catch(() => undefined);
    await p.waitForSelector('.onboard [aria-label="Add the extension"]', { timeout: 20000 }).catch(() => undefined);
    const first = await p.locator('.onboard').innerText().catch(() => '');
    if (scheme === 'light') check(/Connect Halo the easy way\./.test(first) && /bookmark instead/.test(first), 'a new student on desktop Chrome: "Connect Halo the easy way", the bookmark one tap away');
    await p.screenshot({ path: `${OUT}/ext-1-connect-${scheme}.png` });
    // Press it (the store tab itself is not opened here: the install comes from DevTools below, as the store would).
    await p.evaluate(() => { const a = [...document.querySelectorAll('.onboard a')].find((x) => /Add to Chrome/.test(x.textContent)); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
    await sleep(1200);
    if (scheme === 'light') check(/Press Add to Chrome, then come back\./.test(await p.locator('.onboard').innerText()), 'after Add to Chrome: it waits for the extension');
    await p.screenshot({ path: `${OUT}/ext-2-waiting-${scheme}.png` });
    // The Web Store installs it into this Chrome.
    const t0 = Date.now();
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: EXT });
    const seen = await until(() => p.locator('.onboard [aria-label="Open Halo"]').count(), 20000, 500);
    if (scheme === 'light') check(!!seen && /Now open Halo and log in\./.test(await p.locator('.onboard').innerText()), `the extension shows up on the page by itself (${Math.round((Date.now() - t0) / 1000)} s): "Now open Halo and log in."`);
    await p.screenshot({ path: `${OUT}/ext-3-open-halo-${scheme}.png` });
    const payoff = await until(() => p.locator('.onboard-payoff').count(), 120000, 1000);
    const text = await p.locator('.onboard').innerText().catch(() => '');
    if (scheme === 'light') check(!!payoff && /from 2 classes/.test(text), `the first sync lands and onboarding moves to the payoff by itself (${Math.round((Date.now() - t0) / 1000)} s): "${text.split('\n').find((l) => /assignments? from/.test(l)) ?? ''}"`);
    await sleep(1500);
    await p.screenshot({ path: `${OUT}/ext-4-payoff-${scheme}.png` });
    const { data: st } = await admin.from('settings').select('data').eq('user_id', uid).single();
    if (scheme === 'light') check(st.data.lastPull?.via === 'extension', `the planner records it came via the extension (${st.data.lastPull?.via})`);
  } finally {
    await browser.close().catch(() => undefined);
    proc.kill();
    await admin.auth.admin.deleteUser(uid);
  }
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
