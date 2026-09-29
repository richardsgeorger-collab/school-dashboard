// The Sync Halo bookmark on iPad and phones (2026-09-28), end to end on the real backend with throwaway accounts.
// Halo itself is faked (its page, session and GraphQL gateway are answered by Playwright) so no real Halo account is
// touched; everything else is real: the bookmark the app builds, the sync script the site serves, the sync-drop
// function, the pending slot, and the review. Also checks the desktop flow is unchanged with the switch off, and the
// kill switch. Screens to docs/screens/ipad-sync/.
//   KEYS_ENV=/path/to/keys.env node scripts/e2e-ipad-sync.mjs  (serves ./dist-e2e, a real-backend build)
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
// The app is served at the real site's https address inside the test browser only (from the local dist-e2e build), so
// the fake https Halo can load the sync script exactly as it does in real life: no mixed content, no local-network
// blocks, and nothing on the internet is touched.
const BASE = 'https://richardsgeorger-collab.github.io/school-dashboard/';
const DIST = process.env.DIST ?? 'dist-e2e';
const SCHEME = process.env.SCHEME ?? 'light';
const SFX = SCHEME === 'light' ? '' : `-${SCHEME}`;
const ONLY = process.env.ONLY?.split(',');
const OUT = 'docs/screens/ipad-sync';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const newUser = async (serverSync) => {
  const email = `e2e-ipad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  // A student on Plus (Halo sync), so the sync is theirs to take; the server path only where asked.
  await admin.from('profiles').update({ tier: 'plus', server_sync: !!serverSync }).eq('user_id', data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, email, session: s.session };
};
const pendingRows = async (id) => (await admin.from('pending_syncs').select('id, consumed_at').eq('user_id', id)).data ?? [];

// ---- A fake Halo: the page, the session, and a gateway that knows one class.
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const CLASSES = { getCourseClassesForUser: { courseClasses: [{ id: 'cc1', classCode: 'CHM-113-O500', slugId: 'chm-113-o500', startDate: '2026-09-01', endDate: '2026-12-15', name: 'General Chemistry I', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113',
  units: [{ id: 'u1', title: 'Topic 3', sequence: 3, startDate: '2026-09-21', endDate: '2026-10-04', assessments: [
    { id: 'as1', sequence: 1, title: 'Topic 3 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false },
    { id: 'as2', sequence: 2, title: 'Quiz 2', description: '', startDate: day(-3), dueDate: day(5), points: 50, type: 'QUIZ', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false },
  ] }] }] } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const serveApp = (ctx) => ctx.route('https://richardsgeorger-collab.github.io/school-dashboard/**', (route) => {
  let path = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/school-dashboard\/?/, ''));
  let file = join(DIST, path || 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(file) });
});
const fakeHalo = async (ctx) => {
  await serveApp(ctx);
  await ctx.route('https://halo.gcu.edu/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Halo</title></head><body style="font:16px system-ui;margin:0"><div style="background:#522398;color:#fff;padding:14px 18px;font-weight:700">Halo · Grand Canyon University (fake, for testing)</div><p style="padding:18px">Your classes</p></body></html>' });
  });
  await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': 'https://halo.gcu.edu', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? CLASSES : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': 'https://halo.gcu.edu' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
};
const signIn = async (page, u, hash = '#/now') => {
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.evaluate(({ s, key }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(s)); }, { s: u.session, key: `sb-${ref}-auth-token` });
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
};
/** Runs a bookmark (its javascript: address) on the Halo page, the way tapping it does. */
// Adds the bookmark's code as a script on the page, which is what tapping it does.
const runBookmark = (page, href) => page.addScriptTag({ content: decodeURIComponent(href.replace(/^javascript:/, '')) });

const IPAD_CHROME_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ipad = (ua, landscape) => ({ ...devices['iPad Pro 11'], userAgent: ua, viewport: landscape ? { width: 1194, height: 834 } : { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const DEVICES = [
  ['ipad-chrome-portrait', ipad(IPAD_CHROME_UA, false), 5],
  ['ipad-chrome-landscape', ipad(IPAD_CHROME_UA, true), 5],
  ['ipad-safari-portrait', ipad(IPAD_SAFARI_UA, false), 5],
  ['ipad-safari-landscape', ipad(IPAD_SAFARI_UA, true), 5],
  ['iphone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }, 5],
  ['android', { ...devices['Pixel 7'], deviceScaleFactor: 2 }, 5],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // ---- Touch devices, with the switch on for the test account: the whole sync, via the server.
  for (const [name, device, touch] of DEVICES) {
    if (ONLY && !ONLY.includes(name)) continue;
    console.log(`--- ${name}`);
    const u = await newUser(true);
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...device, colorScheme: SCHEME, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript((n) => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => n }); }, touch);
    await fakeHalo(ctx);
    const page = await ctx.newPage();
    page.on('dialog', (d) => { console.log(`  alert: ${d.message()}`); void d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error') console.log(`  console: ${m.text().slice(0, 160)}`); });
    const opened = [];
    ctx.on('page', (p) => opened.push(p));
    // Onboarding as this student would see it: the touch steps, with the bookmark copied from the app itself.
    await signIn(page, u);
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null, path: 'phone', screen: 'p-copy' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    let n = 0;
    const shot = async (label, p = page) => { n += 1; await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${name}-${String(n).padStart(2, '0')}-${label}${SFX}.png` }); };
    await shot('copy');
    const steps = await page.$eval('.onboard', (e) => e.innerText).catch(() => '');
    check(!/⌘|Ctrl \+|Drag this/.test(steps), `${name}: touch steps, no keyboard shortcut or drag`);
    await page.click('.onboard button:has-text("Copy it")');
    await page.waitForTimeout(600);
    const href = await page.evaluate(() => navigator.clipboard.readText());
    check(/^javascript:/.test(href) && /%26k%3D[a-f0-9]{48}|&k=[a-f0-9]{48}/.test(decodeURIComponent(href)) || /k='\+|'&k='/.test(decodeURIComponent(href)), `${name}: the copied bookmark carries the account's sync key`);
    await shot('save');
    const pics = await page.$$eval('.tp', (e) => e.length);
    check(pics === 1, `${name}: the save step has its picture`);
    await page.click('.onboard button:has-text("Done")');
    await shot('edit');
    await page.click('.onboard button:has-text("Done")');
    await page.click('.onboard button:has-text("Open Halo")').catch(() => undefined);
    await page.waitForTimeout(600);
    await shot('run-instructions');
    // In the Halo tab: tap Sync Halo.
    for (const p of opened) await p.close().catch(() => undefined);
    await page.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await shot('halo');
    const nav = page.waitForURL(/pending=1/, { timeout: 45000 }).then(() => true).catch(() => false);
    await runBookmark(page, href);
    await page.waitForTimeout(700);
    await shot('sending');
    const arrived = await nav;
    check(arrived, `${name}: after the upload, the same tab opens Halo+ (no second tab needed)`);
    check(opened.every((p) => p.isClosed()), `${name}: no tab was opened before the upload`);
    await page.waitForSelector('.diff-sheet, .sync-review, [aria-label="What Halo sent"], .modal', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await shot('review');
    const txt = await page.$eval('body', (e) => e.innerText).catch(() => '');
    const rows = await pendingRows(u.id);
    check(/Topic 3 Homework|Quiz 2|CHM-113/.test(txt), `${name}: Halo+ shows the sync it picked up`);
    check(rows.length === 1 && !!rows[0].consumed_at, `${name}: the pending sync was taken once (${rows.length} row, taken ${!!rows[0]?.consumed_at})`);
    await ctx.close();
  }

  if (!ONLY || ONLY.includes('desktop')) {
    // ---- A computer, switch off: exactly as before. The bookmark has no key; the tab handoff delivers; nothing on the server.
    console.log('--- desktop (switch off)');
    const u = await newUser(false);
    const ctx = await browser.newContext({ serviceWorkers: 'block', colorScheme: SCHEME, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await fakeHalo(ctx);
    const page = await ctx.newPage();
    await signIn(page, u);
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null, path: 'desktop', screen: 'drag' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const href = await page.$eval('.halo-drag', (a) => a.getAttribute('href'));
    check(!/&k=|k='/.test(decodeURIComponent(href)), 'desktop, switch off: the bookmark carries no key (the old bookmark)');
    const halo = await ctx.newPage();
    await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    const popup = ctx.waitForEvent('page', { timeout: 15000 });
    await runBookmark(halo, href);
    const dash = await popup.catch(() => null);
    check(!!dash, 'desktop: the bookmark opens the Halo+ tab first, as always');
    await halo.waitForFunction(() => /Sent to the dashboard/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => undefined);
    const said = await halo.$eval('body', (e) => e.innerText);
    check(/Sent to the dashboard\. Review the changes there\./.test(said), 'desktop: the tab handoff delivers and says so, word for word as before');
    await halo.screenshot({ path: `${OUT}/desktop-halo-sent${SFX}.png` });
    if (dash) { await dash.waitForTimeout(2500); await dash.screenshot({ path: `${OUT}/desktop-review${SFX}.png` }); }
    check((await pendingRows(u.id)).length === 0, 'desktop: nothing went to the server');
    await ctx.close();

    // ---- A computer with the switch on: still the tab first; the server is not touched when the tab answers.
    console.log('--- desktop (switch on)');
    const v = await newUser(true);
    const ctx2 = await browser.newContext({ serviceWorkers: 'block', colorScheme: SCHEME, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await fakeHalo(ctx2);
    const p2 = await ctx2.newPage();
    await signIn(p2, v);
    await p2.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null, path: 'desktop', screen: 'drag' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
    await p2.reload({ waitUntil: 'load' });
    await p2.waitForTimeout(2500);
    const href2 = await p2.$eval('.halo-drag', (a) => a.getAttribute('href'));
    const halo2 = await ctx2.newPage();
    await halo2.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await runBookmark(halo2, href2);
    await halo2.waitForFunction(() => /Sent to the dashboard/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => undefined);
    check(/Sent to the dashboard/.test(await halo2.$eval('body', (e) => e.innerText)) && (await pendingRows(v.id)).length === 0, 'desktop, switch on: the tab handoff still delivers first, the server untouched');
    await ctx2.close();
  }

  if (!ONLY || ONLY.includes('kill')) {
    // ---- The kill switch: a keyed bookmark on an iPad gets a clear message and the Copy box, never silence.
    console.log('--- kill switch');
    const u = await newUser(true);
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...ipad(IPAD_CHROME_UA, false), colorScheme: SCHEME, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); });
    await fakeHalo(ctx);
    const page = await ctx.newPage();
    await signIn(page, u);
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null, path: 'phone', screen: 'p-copy' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await page.click('.onboard button:has-text("Copy it")');
    await page.waitForTimeout(500);
    const href = await page.evaluate(() => navigator.clipboard.readText());
    await admin.from('app_switches').update({ enabled: true }).eq('name', 'server_sync_kill');
    try {
      await page.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
      await runBookmark(page, href);
      await page.waitForFunction(() => /Copy this/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => undefined);
      const said = await page.$eval('body', (e) => e.innerText);
      await page.screenshot({ path: `${OUT}/kill-switch-ipad${SFX}.png` });
      check(/not switched on/.test(said) && /Copy this/.test(said) && /halo\.gcu\.edu/.test(page.url()), 'kill switch: a clear reason, the Copy box, and the Halo tab stays put');
      check((await pendingRows(u.id)).length === 0, 'kill switch: nothing stored');
    } finally {
      await admin.from('app_switches').update({ enabled: false }).eq('name', 'server_sync_kill');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events', 'notification_plan', 'pending_syncs']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  const sw = (await admin.from('app_switches').select('name, enabled')).data;
  console.log(`removed ${made.length} throwaways; switches: ${JSON.stringify(sw)}`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
