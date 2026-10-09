// The help kit's extension side (0.6.0), offline: the unpacked extension in a real Chrome, Halo+ served from the local
// build at haloplus.app, Halo mocked. The page asks for a file the way HelpKit does; the extension has no file-host
// permission yet, so it opens its allow page and answers need-permission; "Not now" there tells the page granted:false.
// The grant is Chrome's own prompt on a real click, which headless Chrome cannot answer; the mint step is proven on its
// own, run by the worker in the mocked Halo tab the way kitFiles runs it. The fetch half runs in a real Chrome.
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-kit-ext.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 300) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const S3 = 'https://gce-lms-resource-prod.s3.us-west-2.amazonaws.com';
const DOCX = Buffer.from('PK\u0003\u0004 a pretend docx for the kit test', 'latin1');

const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 240000);
const who = await kit.persona('max');
const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-kit-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
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
  // Halo, mocked: a page with a __NEXT_DATA__ pointing the orchestration API at the mock, a session, and downloadUrl.
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) });
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Halo</title><main>Halo (test)</main><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ runtimeConfig: { orchestrationApiEndpoint: 'https://orch.halo.gcu.edu/' } })}</script>` });
  });
  let minted = 0;
  await ctx.route('https://orch.halo.gcu.edu/**', (route) => {
    const u = new URL(route.request().url());
    const auth = route.request().headers()['authorization'];
    if (!u.pathname.startsWith('/downloadUrl/') || auth !== 'Bearer A') return route.fulfill({ status: 401, body: '{}' });
    minted += 1;
    if (u.pathname.endsWith('-dead')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ downloadUrl: `${S3}/files/${u.pathname.split('/').pop()}.docx?X-Amz-Signature=test` }) });
  });
  let fetched = 0;
  await ctx.route(`${S3}/**`, (route) => { fetched += 1; return route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: DOCX }); });
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.now-head, .ext-setup-sheet', { timeout: 30000, state: 'attached' });
  await sleep(3000);
  if (process.env.DEBUG) { await p.screenshot({ path: process.env.SCRATCH + '/kit-ext-debug.png' }); console.log('DIALOGS', await p.$$eval('[role=dialog]', (els) => els.map((e) => e.getAttribute('aria-label') + ':' + e.className)), (await p.locator('body').innerText()).slice(0, 400).replace(/\s+/g, ' ')); }
  for (const sel of ['.ext-setup-sheet button:has-text("Skip for now")', '.onboard button:has-text("Not now")', '.onboard button:has-text("Skip for now")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: EXT });
  await sleep(2500);
  // The page's side of the bridge, the way extFiles.ts asks.
  const ask = (page, requestId) => page.evaluate((rid) => new Promise((resolve) => {
    const seen = [];
    const on = (e) => {
      if (e.source !== window || !e.data) return;
      if (e.data.kind === 'halo-kit-progress' && e.data.requestId === rid) seen.push(e.data.note);
      if (e.data.kind === 'halo-kit-files-result' && e.data.requestId === rid) { window.removeEventListener('message', on); resolve({ ...e.data, seen }); }
    };
    window.addEventListener('message', on);
    window.setTimeout(() => resolve({ status: 'timeout', seen }), 40000);
    window.postMessage({ kind: 'halo-kit-files', requestId: rid, files: [{ resourceId: 'res-42', name: 'UNV-106-RS-T5Walkthrough.docx' }] }, location.origin);
  }), requestId);
  const permissionSeen = p.evaluate(() => new Promise((resolve) => { window.addEventListener('message', (e) => { if (e.source === window && e.data?.kind === 'halo-kit-permission') resolve(e.data.granted); }); window.setTimeout(() => resolve('timeout'), 30000); }));
  const first = await ask(p, 'kit-1');
  check(first.status === 'need-permission', `first ask without the permission: ${first.status}`);
  const allow = await until(() => ctx.pages().find((pg) => pg.url().endsWith('/allow.html')) ?? null, 10000);
  check(!!allow, `the extension opened its allow page (${allow?.url().replace(/^chrome-extension:\/\/[a-z]+/, 'chrome-extension://…')})`);
  check(/Let Halo\+ fetch your course files/.test(await allow.locator('h1').innerText()), 'the allow page explains the file host');
  await allow.screenshot({ path: 'docs/screens/kit/2-allow-page.png' });
  await allow.locator('#later').click();
  check((await permissionSeen) === false, '"Not now" reaches the Halo+ tab as granted:false, so it builds the links-only kit');
  await sleep(1800);
  check(!ctx.pages().some((pg) => pg.url().endsWith('/allow.html')), 'the allow tab is closed');
  check(!p.isClosed() && (await p.evaluate(() => document.visibilityState)) === 'visible', 'the Halo+ tab is still open and is the active tab again (George, 2026-10-09)');
  // The grant itself is Chrome's own prompt on a real click, which headless Chrome cannot answer, so the fetch half runs
  // in George's Chrome. What can be proven here: the mint step, the shipped function run in the (mocked) Halo tab.
  const src = readFileSync(join(EXT, 'background.js'), 'utf8');
  const fn = src.slice(src.indexOf('function mintDownloadUrls('), src.indexOf('\nconst toBase64'));
  const halo = await ctx.newPage();
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  const r = await halo.evaluate(`(${fn})(['res-42', 'res-43', 'res-dead'])`);
  check(!r.error && r.urls?.length === 3 && r.urls.slice(0, 2).every((u) => u.url.startsWith(S3 + '/files/')) && r.urls[2].url === '' && /no download link/.test(r.urls[2].error), `mint in the Halo tab: ${r.error ?? r.urls?.map((u) => u.url.replace(/\?.*$/, '') || u.error).join(', ')}`);
  check(minted === 3, `three download links asked of Halo's API with the page's own session (${minted})`);
  const fn2 = src.slice(src.indexOf('function fetchInHaloTab('), src.indexOf('\nconst hostOf'));
  const inTab = await halo.evaluate(`(${fn2})(${JSON.stringify(S3 + '/files/res-42.docx?X-Amz-Signature=test')})`);
  check(inTab.ok && Buffer.from(inTab.base64, 'base64').equals(DOCX), `the fallback fetch inside the Halo tab returns the bytes (${inTab.ok ? Buffer.from(inTab.base64, 'base64').length + ' B' : inTab.error})`);
  await halo.close();
  const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ?? null;
  if (sw) check((await sw.evaluate(() => chrome.permissions.contains({ origins: ['https://gce-lms-resource-prod.s3.us-west-2.amazonaws.com/*'] }))) === false, 'the file host is still not granted (the kit stays links-only until the student allows it)');
} finally {
  await browser.close().catch(() => undefined);
  proc.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
clearTimeout(hard);
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
