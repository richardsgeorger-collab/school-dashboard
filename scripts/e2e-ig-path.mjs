// The whole Instagram path as a brand-new student (Loop 294, George 2026-10-30), timed, every tap counted.
// Phone (WebKit, Safari's engine): haloplus.app/?src=ig in iPhone Safari (the share sheet, stood in by a share() that
// resolves the way it does when a student picks AirDrop or Messages) and in Instagram's in-app browser (no share sheet:
// "Copy link"; then "Email me the link", one real email to Resend's test inbox, and the same address again: never
// twice). A signed-in phone and a desktop see the landing as before. Cell data: the phone screen under Slow 4G.
// Laptop (a fresh Chrome profile): the emailed link's laptop page, Add to Chrome (the Web Store stood in; the extension
// loaded the way Chrome installs it), the welcome tab, the one-step sign-up with a throwaway, Open Halo (the Halo
// stand-in), the first sync, This week on Halo. Then Admin's Instagram funnel. Safari and Firefox on the laptop page.
// haloplus.app is this build (dist-site); the backend is real; every funnel row and the throwaway are removed after.
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/e2e-ig-path.mjs
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { chromium, devices, webkit } from 'playwright-core';
import { haloPage, launch, sleep, until } from './lib/haloStandIn.mjs';
import { personaKit } from './lib/personas.mjs';
import { assertThrowaways } from './lib/guard.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/instagram-path';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => {
  checks.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
};
const steps = [];
/** One step of the walkthrough: what, how long, how many taps or clicks. */
const step = (where, what, ms, taps) => {
  steps.push({ where, what, s: +(ms / 1000).toFixed(1), taps });
  console.log(`STEP ${where} · ${what} · ${(ms / 1000).toFixed(1)} s · ${taps} tap${taps === 1 ? '' : 's'}`);
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const site = (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
  let file = join(LOCAL_SITE, path || 'index.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(LOCAL_SITE, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
};
const vids = new Set();
const watchFunnel = (ctx, seen) =>
  ctx.on('request', (r) => {
    if (!r.url().endsWith('/functions/v1/report') || r.method() !== 'POST') return;
    try {
      const b = JSON.parse(r.postData() || '{}');
      if (b.kind === 'funnel') {
        seen.push(b);
        vids.add(b.vid);
      }
    } catch {
      /* not JSON */
    }
  });
/** Every test browser's random id, so its funnel rows go when the run ends (some requests are not seen). */
const remember = async (p) => {
  const v = await p.evaluate(() => localStorage.getItem('school-dashboard:vid')).catch(() => null);
  if (v) vids.add(v);
};
const text = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
const hard = setTimeout(() => {
  console.log('HARD TIMEOUT');
  process.exit(3);
}, 900000);
const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.32.112 (iPhone15,3; iOS 17_5; en_US; en; scale=3.00; 1290x2796; 548339486)';
const iphone = devices['iPhone 13'];
const testEmail = `delivered+haloplus-ig-${Date.now()}@resend.dev`;
let signedUp = null;
let browserL = null;
let procL = null;
let deviceId = null;

try {
  // ——— Phone 1: iPhone Safari, the share sheet ———
  const wk = await webkit.launch();
  {
    const ctx = await wk.newContext({ ...iphone });
    const seen = [];
    watchFunnel(ctx, seen);
    await ctx.route('https://haloplus.app/**', site);
    await ctx.addInitScript(() => {
      // The share sheet: the student picks Messages or AirDrop and sends (the promise resolves).
      navigator.share = (data) => {
        window.__shared = data;
        return new Promise((r) => setTimeout(r, 400));
      };
    });
    const p = await ctx.newPage();
    const t0 = Date.now();
    await p.goto('https://haloplus.app/?src=ig', { waitUntil: 'commit' });
    await p.locator('.lp-onphone-title').waitFor({ state: 'visible', timeout: 15000 });
    const shown = Date.now() - t0;
    step('Phone (Safari)', 'open haloplus.app from the bio link: the phone screen', shown, 1);
    const title = await p.locator('.lp-onphone-title').innerText();
    check(/Hey! Looks like you’re on your phone/.test(title) && (await p.locator('.lp-hero').isVisible()), `iPhone Safari: the phone screen first ("${title}"), the landing below`);
    await p.waitForFunction(() => !!document.querySelector('.lp-onphone-reel video'), null, { timeout: 15000 });
    await sleep(1500);
    const btn = p.locator('.lp-onphone-second');
    check((await btn.innerText()) === 'Text or AirDrop it to my laptop', `the first button: "${await btn.innerText()}"`);
    await p.screenshot({ path: `${OUT}/phone-safari-1-screen.png` });
    await p.screenshot({ path: `${OUT}/phone-safari-1-screen-full.png`, fullPage: true });
    const t1 = Date.now();
    await btn.click();
    await p.locator('.lp-onphone-done').waitFor({ timeout: 8000 });
    step('Phone (Safari)', '"Text or AirDrop it to my laptop", pick AirDrop or Messages, send', Date.now() - t1 + 3000, 3);
    const shared = await p.evaluate(() => window.__shared);
    check(/^https:\/\/haloplus\.app\/laptop\/\?src=ig&via=share&t=[A-Za-z0-9_-]{8,}$/.test(shared?.url ?? ''), `the share sheet gets the laptop page, tagged (${shared?.url})`);
    check(/Sent! Open it on your laptop and you’re 2 minutes away/.test(await p.locator('.lp-onphone-done').innerText()), 'the happy confirmation');
    await sleep(500);
    await p.screenshot({ path: `${OUT}/phone-safari-2-sent.png` });
    await until(async () => seen.some((b) => b.step === 'share'), 5000, 200);
    check(seen.some((b) => b.step === 'visit' && b.src === 'ig' && b.device === 'phone') && seen.some((b) => b.step === 'share' && b.via === 'share'), `counted: ${seen.map((b) => b.step).join(', ')}`);
    // "Already have it on your laptop? Sign in"
    await p.locator('.lp-onphone-signin a').click();
    await p.waitForURL(/#\/login/, { timeout: 8000 });
    check(/#\/login/.test(p.url()), 'the small "Sign in" link goes to the app sign-in');
    for (const pg of ctx.pages()) await remember(pg);
    await ctx.close();
  }

  // ——— Phone 2: Instagram's in-app browser: no share sheet → Copy link; then the one email ———
  let phoneVid = '';
  {
    const ctx = await wk.newContext({ ...iphone, userAgent: IG_UA });
    const seen = [];
    watchFunnel(ctx, seen);
    await ctx.route('https://haloplus.app/**', site);
    await ctx.addInitScript(() => {
      delete Navigator.prototype.share;
      try {
        Object.defineProperty(navigator, 'share', { value: undefined });
      } catch {
        /* already gone */
      }
    });
    const p = await ctx.newPage();
    const t0 = Date.now();
    await p.goto('https://haloplus.app/?src=ig', { waitUntil: 'commit' });
    await p.locator('.lp-onphone-title').waitFor({ state: 'visible', timeout: 15000 });
    step('Phone (Instagram)', 'tap the bio link in Instagram: the phone screen', Date.now() - t0, 1);
    await p.waitForFunction(() => document.querySelector('.lp-onphone-second')?.textContent === 'Copy the link instead', null, { timeout: 10000 });
    check(true, 'Instagram (no share sheet): the share button is "Copy the link instead"');
    await sleep(1500);
    await p.screenshot({ path: `${OUT}/phone-instagram-1-screen.png` });
    const t1 = Date.now();
    await p.locator('.lp-onphone-second').click();
    const copied = await p.locator('.lp-onphone-done').waitFor({ timeout: 5000 }).then(() => true, () => false);
    const manual = await p.locator('.lp-onphone-manual input').count();
    check(copied || manual > 0, `Copy link: ${copied ? `"${await p.locator('.lp-onphone-done').innerText()}"` : 'the link to copy by hand'}`);
    step('Phone (Instagram)', '"Copy link", then paste it into a text or note to yourself', Date.now() - t1 + 6000, 4);
    await sleep(600);
    await p.screenshot({ path: `${OUT}/phone-instagram-2-copied.png` });
    phoneVid = await p.evaluate(() => localStorage.getItem('school-dashboard:vid'));
    // The one email.
    await p.reload({ waitUntil: 'load' });
    await p.locator('#lp-onphone-email').waitFor();
    const t2 = Date.now();
    await p.locator('#lp-onphone-email').tap();
    await p.locator('#lp-onphone-email').fill(testEmail);
    await p.locator('.lp-onphone-mail button[type="submit"]').tap();
    await p.locator('.lp-onphone-done').waitFor({ timeout: 20000 });
    step('Phone (Instagram)', '"Email me the link": type the address, send', Date.now() - t2 + 7000, 3);
    const sent = await p.locator('.lp-onphone-done').innerText();
    check(/^Sent! Open it on your laptop and you’re 2 minutes away/.test(sent), `the email went: "${sent}"`);
    await p.screenshot({ path: `${OUT}/phone-instagram-3-emailed.png` });
    await until(async () => (await db.from('funnel_events').select('step').eq('vid', phoneVid).eq('step', 'email')).data?.length, 15000, 1000);
    const row = (await db.from('funnel_events').select('*').eq('vid', phoneVid).eq('step', 'email').maybeSingle()).data;
    check(row && row.via === 'email', 'the email step is counted by the server when the email really went');
    const kept = (await db.from('laptop_links').select('*').eq('vid', phoneVid)).data ?? [];
    check(kept.length === 1 && /^[0-9a-f]{64}$/.test(kept[0].email_hash) && !JSON.stringify(kept).includes('resend.dev'), 'only a hash of the address is kept, never the address');
    // The same address again: never twice.
    await p.reload({ waitUntil: 'load' });
    await p.locator('#lp-onphone-email').fill(testEmail.toUpperCase());
    await p.locator('.lp-onphone-mail button[type="submit"]').tap();
    await p.locator('.lp-onphone-done').waitFor({ timeout: 20000 });
    check(/^Already sent!/.test(await p.locator('.lp-onphone-done').innerText()) && ((await db.from('laptop_links').select('email_hash').eq('vid', phoneVid)).data ?? []).length === 1, 'the same address again: "Already sent!", and nothing sent');
    // A wrong address.
    await p.reload({ waitUntil: 'load' });
    await p.locator('#lp-onphone-email').fill('maya@gcu');
    await p.evaluate(() => document.querySelector('.lp-onphone-mail').noValidate = true);
    await p.locator('.lp-onphone-mail button[type="submit"]').tap();
    await p.locator('.lp-onphone-error').waitFor({ timeout: 10000 });
    check(/doesn’t look right/.test(await p.locator('.lp-onphone-error').innerText()), `a wrong address: "${await p.locator('.lp-onphone-error').innerText()}"`);
    // The app line.
    await p.reload({ waitUntil: 'load' });
    await p.locator('.lp-onphone-app a').tap();
    await p.waitForURL(/#\/start/, { timeout: 8000 });
    await until(async () => seen.some((b) => b.step === 'app'), 5000, 200);
    check(seen.some((b) => b.step === 'copy') && seen.some((b) => b.step === 'app'), `counted: ${[...new Set(seen.map((b) => b.step))].join(', ')}`);
    for (const pg of ctx.pages()) await remember(pg);
    await ctx.close();
  }

  // ——— A signed-in phone, and a desktop: the landing as before ———
  {
    const ctx = await wk.newContext({ ...iphone });
    await ctx.route('https://haloplus.app/**', site);
    await ctx.addInitScript((key) => localStorage.setItem(key, '{"access_token":"x"}'), `sb-${ref}-auth-token`);
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/', { waitUntil: 'load' });
    await sleep(1500);
    check(!(await p.locator('.lp-onphone').isVisible()), 'a signed-in phone never sees the phone screen');
    for (const pg of ctx.pages()) await remember(pg);
    await ctx.close();
  }
  const cr = await chromium.launch();
  {
    const ctx = await cr.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route('https://haloplus.app/**', site);
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/?src=ig', { waitUntil: 'load' });
    await sleep(1500);
    check(!(await p.locator('.lp-onphone').isVisible()) && (await p.locator('.lp-head .btn.primary').isVisible()) && !(await p.locator('video').count()), 'desktop: no phone screen, no video, the landing as before');
    await p.screenshot({ path: `${OUT}/desktop-landing.png` });
    for (const pg of ctx.pages()) await remember(pg);
    await ctx.close();
  }
  // Cell data: the phone screen under Slow 4G (1.6 Mbps down, 150 ms), from a real server (the preview of dist).
  {
    const ctx = await cr.newContext({ ...devices['iPhone 13'], userAgent: iphone.userAgent });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    let bytes = 0;
    p.on('response', async (r) => {
      try {
        bytes += (await r.body()).length;
      } catch {
        /* streamed */
      }
    });
    const t0 = Date.now();
    await p.goto('http://localhost:4174/school-dashboard/?src=ig', { waitUntil: 'commit' });
    await p.locator('.lp-onphone-title').waitFor({ state: 'visible', timeout: 30000 });
    const first = Date.now() - t0;
    await p.waitForFunction(() => document.querySelector('.lp-onphone-mail button')?.textContent && document.querySelector('.lp-onphone-reel video'), null, { timeout: 60000 });
    const ready = Date.now() - t0;
    await p.waitForFunction(() => (document.querySelector('.lp-onphone-reel video')?.readyState ?? 0) >= 2, null, { timeout: 60000 }).catch(() => undefined);
    const playing = Date.now() - t0;
    console.log(`CELL Slow 4G: phone screen visible ${(first / 1000).toFixed(1)} s, buttons ready ${(ready / 1000).toFixed(1)} s, reel playing ${(playing / 1000).toFixed(1)} s, ${(bytes / 1024).toFixed(0)} KB`);
    check(first < 4000, `on Slow 4G the phone screen shows in ${(first / 1000).toFixed(1)} s`);
    for (const pg of ctx.pages()) await remember(pg);
    await ctx.close();
  }
  await cr.close();
  await wk.close();

  // ——— Laptop: the emailed link in a fresh Chrome ———
  const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/halo-snap-fixture.ts'], { encoding: 'utf8' }));
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
  const classes = { getCourseClassesForUser: { courseClasses: [{ id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as1', sequence: 1, title: 'Topic 5 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] }] } };
  const L = await launch('chrome', 'igpath', ['--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36']);
  browserL = L.browser;
  procL = L.proc;
  const ctx = L.ctx;
  const seen = [];
  watchFunnel(ctx, seen);
  await ctx.route('https://haloplus.app/**', site);
  await ctx.route('https://chromewebstore.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Chrome Web Store</title><h1>Halo+ (Chrome Web Store stand-in)</h1><button>Add to Chrome</button>' }));
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) });
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'text/html', body: haloPage(fx, u.href) });
  });
  await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  const lp = await ctx.newPage();
  await lp.setViewportSize({ width: 1280, height: 860 });
  let t = Date.now();
  await lp.goto(`https://haloplus.app/laptop/?src=ig&via=email&t=${phoneVid}`, { waitUntil: 'load' });
  step('Laptop (Chrome)', 'open the email, click "Open Halo+ on my laptop": the laptop page', Date.now() - t + 4000, 2);
  const lpText = await text(lp);
  check(/You’re 2 minutes away/.test(lpText) && /Add to Chrome, it’s free/.test(lpText) && (await lp.locator('#store').getAttribute('href')).startsWith('https://chromewebstore.google.com/detail/'), `the laptop page: "${lpText.slice(0, 120)}"`);
  await lp.screenshot({ path: `${OUT}/laptop-1-page.png` });
  check(await lp.evaluate(() => localStorage.getItem('school-dashboard:src')) === 'ig', 'the laptop page leaves the Instagram source on haloplus.app (for the welcome tab and the sign-up)');
  t = Date.now();
  // Chrome opens the Web Store itself (a test cannot follow it there): the click is made, the store address checked.
  await lp.evaluate(() => document.getElementById('store').addEventListener('click', (e) => e.preventDefault()));
  await lp.locator('#store').click();
  await until(async () => seen.some((b) => b.step === 'laptop-store'), 5000, 200);
  // The button opens the store in the same tab, so no haloplus.app tab is left when the install finishes.
  await lp.goto('about:blank');
  // The store's own two clicks (Add to Chrome, Add extension) cannot run in a test: the extension is loaded the way Chrome installs it.
  const { worker } = await L.load(resolve('extension'));
  step('Laptop (Chrome)', '"Add to Chrome, it’s free", then the Web Store\'s Add to Chrome and Add extension', Date.now() - t + 8000, 3);
  t = Date.now();
  const welcome = await until(async () => ctx.pages().find((p) => p.url().startsWith('https://haloplus.app/') && p !== lp) ?? null, 30000, 300);
  check(!!welcome, `the welcome tab opened by itself (${welcome?.url()})`);
  await welcome.setViewportSize({ width: 1280, height: 860 });
  await welcome.reload({ waitUntil: 'load' });
  await welcome.waitForFunction(() => /One step left/.test(document.body.innerText), null, { timeout: 30000 });
  step('Laptop (Chrome)', 'the welcome tab opens by itself: "One step left"', Date.now() - t, 0);
  await welcome.screenshot({ path: `${OUT}/laptop-2-welcome.png` });
  deviceId = await until(async () => (await worker.evaluate(() => chrome.storage.local.get('deviceId'))).deviceId ?? null, 10000);
  kit.device(deviceId);
  // A student who reads for a while first: past the extension's first minute of quick checks on this page (the race
  // Loop 294 found: a key written then took up to 30 s to reach the extension, and "Open Halo" at once lost it).
  await sleep(62000);
  // One-step sign-up, as a student types it (a throwaway address).
  const email = `e2e-audit-igpath-${Date.now()}@example.invalid`;
  t = Date.now();
  await welcome.fill('form.signin[data-step="email"] input[name="email"]', email);
  await welcome.click('form.signin[data-step="email"] button[type="submit"]');
  await welcome.waitForSelector('form.signin input[name="password"]', { timeout: 8000 });
  if (await welcome.$('.signin[data-step="google"]')) await welcome.click('.signin-instead');
  await welcome.fill('form.signin input[name="password"]', 'Throwaway-pass-2026!');
  await welcome.click('form.signin button[type="submit"]');
  const ok = await welcome.waitForFunction(() => /You're set/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true, () => false);
  const signupText = await text(welcome);
  step('Laptop (Chrome)', 'one-step sign-up: email, Continue, password, Create', Date.now() - t + 9000, 4);
  check(ok, `signed up from the welcome tab: "${signupText.slice(0, 140)}"`);
  signedUp = await welcome.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.user?.id ?? null, `sb-${ref}-auth-token`);
  await welcome.screenshot({ path: `${OUT}/laptop-3-signed-up.png` });
  if (signedUp) {
    const src = await until(async () => (await db.from('profiles').select('signup_source').eq('user_id', signedUp).single()).data?.signup_source ?? null, 15000, 1000);
    check(src === 'ig', `the account's source is Instagram (${src})`);
  }
  check(seen.some((b) => b.step === 'laptop' && b.via === 'email') && seen.some((b) => b.step === 'laptop-store') && seen.some((b) => b.step === 'welcome'), `counted on the laptop: ${[...new Set(seen.map((b) => b.step))].join(', ')}`);
  // Open Halo the moment "You're set" shows (what a student does): the first sync, This week on Halo.
  const keyAt = Date.now();
  void until(async () => (await worker.evaluate(() => chrome.storage.local.get('syncKey'))).syncKey ?? null, 30000, 100).then((k) => console.log(`the extension had the account's key ${k ? `${((Date.now() - keyAt) / 1000).toFixed(1)} s` : 'never (30 s)'} after "You're set"`));
  t = Date.now();
  await welcome.locator('a:has-text("Open Halo")').first().click();
  await welcome.waitForURL(/halo\.gcu\.edu/, { timeout: 15000 });
  const hp = welcome;
  await hp.setViewportSize({ width: 1280, height: 860 });
  await hp.waitForLoadState('load');
  const t0 = new Date(Date.now() - 5000).toISOString();
  const landed = await until(async () => (signedUp ? (await db.from('pending_syncs').select('created_at').eq('user_id', signedUp).gte('created_at', t0).limit(1)).data?.[0] ?? null : null), 60000, 1000);
  step('Laptop (Chrome)', '"Open Halo": the first sync runs on its own', Date.now() - t, 1);
  check(!!landed, 'the first sync landed in the account');
  t = Date.now();
  await hp.reload({ waitUntil: 'load' });
  const week = await until(async () => (await hp.locator('[data-haloplus="week"]').count()) > 0, 60000, 1000);
  step('Laptop (Chrome)', 'This week shows on Halo', Date.now() - t, 0);
  check(week, 'This week shows on Halo');
  await sleep(1500);
  await hp.screenshot({ path: `${OUT}/laptop-4-this-week-on-halo.png` });

  // Safari and Firefox on the laptop page.
  for (const [name, ua] of [
    ['Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'],
    ['Firefox', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0'],
  ]) {
    const b = name === 'Safari' ? await webkit.launch() : await chromium.launch();
    const c = await b.newContext({ userAgent: ua, viewport: { width: 1280, height: 860 } });
    await c.route('https://haloplus.app/**', site);
    await c.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await c.newPage();
    await p.goto('https://haloplus.app/laptop/?src=ig&via=share', { waitUntil: 'load' });
    await remember(p);
    const s = await text(p);
    check(new RegExp(`needs Chrome or Edge \\(you’re in ${name}\\)`).test(s) && (await p.locator('a:has-text("Download Chrome")').isVisible()), `${name} on the laptop page: "${s.match(/Halo\+ needs[^.]+\./)?.[0]}"`);
    await p.screenshot({ path: `${OUT}/laptop-${name.toLowerCase()}.png` });
    await b.close();
  }

  // Admin's Instagram funnel (an admin throwaway; the steps above are in it until they are removed).
  const admin = await kit.persona('admin');
  const { c: ac } = await kit.signIn(admin.email);
  const { data: f, error } = await ac.rpc('admin_ig_funnel', { p_days: 1 });
  check(!error && f.visits >= 2 && f.share >= 1 && f.copy >= 1 && f.email >= 1 && f.app >= 1 && f.laptop >= 1 && f.laptop_store >= 1 && f.installed >= 1, `Admin's Instagram funnel counts every step (${error?.message ?? JSON.stringify(f)})`);
  const ab = await chromium.launch();
  const actx = await ab.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await actx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
  await actx.route('https://haloplus.app/**', site);
  await actx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const ap = await actx.newPage();
  await ap.goto('https://haloplus.app/#/admin', { waitUntil: 'load' });
  for (const pg of ctx.pages()) await remember(pg);
  const card = ap.locator('.admin-ig-funnel');
  await card.locator('.ig-drop').waitFor({ timeout: 30000 });
  await card.scrollIntoViewIfNeeded();
  await sleep(800);
  await card.screenshot({ path: `${OUT}/admin-ig-funnel.png` });
  check(true, 'Admin shows the Instagram funnel card');
  await ab.close();
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  // Remove everything this run made: the funnel rows (test browsers), the one-email ledger row, the install, the throwaway.
  for (const v of vids) {
    await db.from('funnel_events').delete().eq('vid', v);
    await db.from('laptop_links').delete().eq('vid', v);
  }
  if (deviceId) await db.from('ext_installs').delete().eq('device_id', deviceId);
  if (signedUp) {
    await assertThrowaways(db, [signedUp], 'the Instagram path throwaway');
    await db.from('ext_installs').delete().eq('user_id', signedUp);
    for (const t of ['pending_syncs', 'sync_keys', 'courses', 'items', 'settings', 'announcements', 'usage_events', 'onboarding_events', 'notification_prefs', 'trial_days']) await db.from(t).delete().eq('user_id', signedUp);
    await db.auth.admin.deleteUser(signedUp);
  }
  await browserL?.close().catch(() => undefined);
  procL?.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
  console.log('WALKTHROUGH', JSON.stringify(steps));
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
