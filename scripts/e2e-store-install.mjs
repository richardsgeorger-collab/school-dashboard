// A Chrome Web Store install (George, 2026-10-25, Loop 268): someone finds the extension in the store and installs it
// without ever visiting haloplus.app. A fresh Chrome profile, this repo's extension loaded the way Chrome installs it,
// Halo+ from the local build (LOCAL_SITE), Halo faked (the stand-in), the account a throwaway; the real backend.
// Checks: a short welcome tab opens by itself ("One step left", the sign-up form); the popup says the one step instead of
// a Sync now; a Halo page shows only the small "Set up Halo+" pill and nothing broken; the install is counted as from the
// store; signed up from the welcome tab ("You're set", source 'store', the extension linked to the account); the first
// sync happens on its own on the next Halo visit and lands in the account; opening Halo+ starts the 7-day trial at it.
// BEFORE=1 only records what the build in use does (screens under before/).
//   KEYS_ENV=... [LOCAL_SITE=dist-site] [EXT_DIR=extension] [BEFORE=1] node scripts/e2e-store-install.mjs
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { haloPage, launch, sleep, until } from './lib/haloStandIn.mjs';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const BEFORE = process.env.BEFORE === '1';
const OUT = `docs/screens/store-install/${BEFORE ? 'before' : 'after'}`;
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/halo-snap-fixture.ts'], { encoding: 'utf8' }));
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const classes = { getCourseClassesForUser: { courseClasses: [{ id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as1', sequence: 1, title: 'Topic 5 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] }] } };
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 600000);

// A student's Chrome, not a headless one: a headless install is left out of Admin's count (the test wants the row).
const { browser, ctx, proc, load } = await launch('chrome', 'store', ['--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36']);
let deviceId = null;

try {
  // LOCAL_SITE=live: the site as it is deployed (the "before" run).
  if (LOCAL_SITE !== 'live')
    await ctx.route('https://haloplus.app/**', (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
      let file = join(LOCAL_SITE, path || 'index.html');
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
    });
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

  // 1. Install from the store: no Halo+ tab anywhere.
  const before = ctx.pages().length;
  const { id, worker } = await load(EXT);
  const welcome = await until(async () => ctx.pages().find((p) => p.url().startsWith('https://haloplus.app/')) ?? null, 30000, 300);
  if (!welcome) console.log('pages:', ctx.pages().map((p) => p.url()), await worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url || t.pendingUrl)));
  check(!!welcome, `a Halo+ tab opened by itself after the install (${welcome ? welcome.url() : 'none'}; ${ctx.pages().length - before} new tab)`);
  if (welcome) {
    await welcome.setViewportSize({ width: 1280, height: 860 });
    await welcome.waitForLoadState('load');
    // The extension opens this tab before the test's routing is attached to it, so its first load went to the live site:
    // load it again from the build under test (a student's tab loads the deployed site, which has the welcome screen).
    if (LOCAL_SITE !== 'live') await welcome.reload({ waitUntil: 'load' });
    // A tab the extension opened loads in the background: wait for the screen itself, not a fixed time.
    await welcome.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, { timeout: 30000 }).catch(() => undefined);
    await sleep(800);
    const text = (await welcome.locator('body').innerText()).replace(/\s+/g, ' ');
    if (!BEFORE) check(/#\/welcome\?src=store/.test(welcome.url()) && /One step left/.test(text) && (await welcome.locator('form input[type="email"]').count()) > 0, `the welcome tab: "${text.slice(0, 160)}"`);
    else console.log(`before: ${welcome.url()} · "${text.slice(0, 200)}"`);
    await welcome.screenshot({ path: `${OUT}/1-after-install.png` });
  }
  deviceId = await until(async () => (await worker.evaluate(() => chrome.storage.local.get('deviceId'))).deviceId ?? null, 10000);
  kit.device(deviceId);

  // 2. The popup before an account.
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 360, height: 480 });
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await sleep(1200);
  const popText = (await pop.locator('body').innerText()).replace(/\s+/g, ' ');
  if (!BEFORE) check(/One step left/.test(popText) && /Make your free account/.test(popText) && !(await pop.locator('#sync').isVisible()), `the popup before an account: "${popText.slice(0, 140)}"`);
  else console.log(`before popup: "${popText.slice(0, 200)}"`);
  await pop.screenshot({ path: `${OUT}/2-popup-no-account.png` });
  await pop.close();

  // 3. A Halo page before an account: the small pill only.
  const halo = await ctx.newPage();
  await halo.setViewportSize({ width: 1280, height: 860 });
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  await sleep(3000);
  const setupPill = halo.locator('.pill-setup');
  const pillText = (await setupPill.count()) ? await setupPill.innerText() : '';
  const others = await halo.locator('[data-haloplus="week"], [data-haloplus="class"]').count();
  if (!BEFORE) check(pillText.trim() === 'Set up Halo+' && others === 0 && (await setupPill.getAttribute('href'))?.endsWith('#/welcome?src=store'), `Halo before an account: the pill says "${pillText.trim()}", nothing else Halo+ on the page (${others})`);
  else console.log(`before Halo page: setup pill ${await setupPill.count()}, Halo+ elements ${others}`);
  await halo.screenshot({ path: `${OUT}/3-halo-before-account.png` });

  if (!BEFORE) {
    // 4. Counted as from the store.
    const inst = await until(async () => (await db.from('ext_installs').select('*').eq('device_id', deviceId).maybeSingle()).data, 20000, 1000);
    check(inst && inst.source === 'store' && !inst.user_id, `the install is counted as from the Chrome Web Store (${inst ? inst.source : 'no row'})`);

    // 5. Sign up from the welcome tab (the throwaway stands in for the form's new account).
    const who = await kit.persona('new');

    await welcome.evaluate(({ ses, key }) => localStorage.setItem(key, JSON.stringify(ses)), { ses: who.session, key: `sb-${ref}-auth-token` });
    await welcome.reload({ waitUntil: 'load' });
    await sleep(4000);
    const done = (await welcome.locator('body').innerText()).replace(/\s+/g, ' ');
    check(/You're set/.test(done) && /Open Halo/.test(done), `signed up: "${done.slice(0, 160)}"`);
    await welcome.screenshot({ path: `${OUT}/4-signed-up.png` });
    const src = await until(async () => (await db.from('profiles').select('signup_source').eq('user_id', who.id).single()).data?.signup_source ?? null, 15000, 1000);
    check(src === 'store', `the account's source is the store (${src})`);
    const linked = await until(async () => (await db.from('ext_installs').select('user_id').eq('device_id', deviceId).maybeSingle()).data?.user_id ?? null, 20000, 1000);
    check(linked === who.id, 'the extension is linked to the new account');

    // 6. The next Halo visit: the first sync happens on its own.
    const t0 = new Date().toISOString();
    await halo.reload({ waitUntil: 'load' });
    const landed = await until(async () => (await db.from('pending_syncs').select('created_at, payload->>source, payload->>visit').eq('user_id', who.id).gte('created_at', t0).limit(1)).data?.[0] ?? null, 90000, 2000);
    check(!!landed && landed.source === 'extension' && landed.visit === 'true', `the first sync ran on the Halo visit and landed in the account (${landed ? `${Math.round((Date.parse(landed.created_at) - Date.parse(t0)) / 1000)} s` : 'no'})`);
    await sleep(2000);
    check((await halo.locator('.pill-setup').count()) === 0, 'the "Set up Halo+" pill is gone once there is an account');
    await halo.screenshot({ path: `${OUT}/5-halo-after-first-sync.png` });

    // 7. Halo+ opened: the sync applied, the trial clock started at it.
    const app = await ctx.newPage();
    await app.setViewportSize({ width: 1280, height: 860 });
    await app.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
    const started = await until(async () => (await db.from('profiles').select('trial_synced_at, trial_ends_at').eq('user_id', who.id).single()).data?.trial_synced_at ?? null, 60000, 2000);
    check(!!started && Math.abs(Date.parse(started) - Date.parse(landed?.created_at ?? started)) < 120000, `the 7-day trial started at the first sync (${started})`);
    await sleep(2000);
    await app.screenshot({ path: `${OUT}/6-halo-plus-after.png` });
  }
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  if (deviceId) await db.from('ext_installs').delete().eq('device_id', deviceId);
  await browser.close().catch(() => undefined);
  proc.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
if (!BEFORE) console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(BEFORE || checks.every(Boolean) ? 0 : 1);
