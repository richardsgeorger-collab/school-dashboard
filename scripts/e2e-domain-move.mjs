// The move to haloplus.app (2026-09-29), end to end with an OLD bookmark, on the real backend with a throwaway
// account. Inside the test browser both addresses are served from local builds (github.io from ./dist-e2e, built
// with SITE_BASE=/school-dashboard/; haloplus.app from ./dist-site, built with SITE_BASE=/), and Halo is faked.
//   A. Before haloplus.app is live: an old bookmark syncs to the github.io tab exactly as today; no move screen.
//   B. haloplus.app goes live: the github.io tab shows the move screen; one tap moves the planner, the sign-in and a
//      library file to haloplus.app, which opens signed in with the same classes and the file.
//   C. After the move: the same old bookmark (it loads its script from github.io and opens github.io) hands off to
//      haloplus.app, and Halo says "Sent to the dashboard".
//   D. Someone with nothing saved who opens the old address is forwarded straight to haloplus.app.
//   KEYS_ENV=... node scripts/e2e-domain-move.mjs
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const OLD = 'https://richardsgeorger-collab.github.io/school-dashboard/';
const OUT = 'docs/screens/domain-move';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml' };
const serve = (dist, prefix) => (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(prefix, '');
  let file = join(dist, path || 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(file) });
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const CLASSES = { getCourseClassesForUser: { courseClasses: [{ id: 'cc1', classCode: 'CHM-113-O500', slugId: 'chm-113-o500', startDate: '2026-09-01', endDate: '2026-12-15', name: 'General Chemistry I', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113',
  units: [{ id: 'u1', title: 'Topic 3', sequence: 3, startDate: '2026-09-21', endDate: '2026-10-04', assessments: [
    { id: 'as1', sequence: 1, title: 'Topic 3 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false },
  ] }] }] } };
const setup = async (ctx, live) => {
  await ctx.route('https://richardsgeorger-collab.github.io/school-dashboard/**', serve('dist-e2e', /^\/school-dashboard\/?/));
  await ctx.route('https://haloplus.app/**', live ? serve('dist-site', /^\//) : (r) => r.abort('namenotresolved'));
  await ctx.route('https://halo.gcu.edu/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Halo</title><h1>Halo (fake)</h1>' });
  });
  await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': 'https://halo.gcu.edu', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? CLASSES : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': 'https://halo.gcu.edu' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
};
const runBookmark = (page, href) => page.addScriptTag({ content: decodeURIComponent(href.replace(/^javascript:/, '')) });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const made = [];
try {
  const email = `e2e-move-${Date.now()}@example.invalid`;
  const { data: cu } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(cu.user.id);
  await admin.from('profiles').update({ tier: 'plus' }).eq('user_id', cu.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });

  // ---- A. Before haloplus.app is live.
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await setup(ctx, false);
  const old = await ctx.newPage();
  await old.goto(`${OLD}#/now`, { waitUntil: 'load' });
  await old.evaluate(({ s, key }) => { localStorage.setItem(key, JSON.stringify(s)); }, { s: s.session, key: `sb-${ref}-auth-token` });
  await old.reload({ waitUntil: 'load' });
  await old.waitForTimeout(2500);
  await old.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null, path: 'desktop', screen: 'drag' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  await old.reload({ waitUntil: 'load' });
  await old.waitForTimeout(2500);
  // The bookmark as every student saved it before today: loader for github.io's halo-sync.js, github.io as the dashboard.
  const href = await old.$eval('.halo-drag', (a) => a.getAttribute('href'));
  check(decodeURIComponent(href).includes('https://richardsgeorger-collab.github.io/school-dashboard/halo-sync.js'), 'the old bookmark loads its script from the github.io address');
  const halo = await ctx.newPage();
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  await runBookmark(halo, href);
  await halo.waitForFunction(() => /Sent to the dashboard/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => undefined);
  check(/Sent to the dashboard/.test(await text(halo, 'body')), 'A. before the new address is live, the old bookmark syncs to the github.io tab as always');
  check(!(await old.$('.legacy-move')), 'A. and nobody sees a move screen while haloplus.app is not up');
  await halo.close();
  // Something that lives only in this browser: a slide deck and its file in the library.
  await old.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('school-dashboard-library', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('decks', { keyPath: 'id' }).createIndex('byCourse', 'courseId'); d.createObjectStore('files', { keyPath: 'id' }); d.createObjectStore('pages', { keyPath: ['deckId', 'n'] }).createIndex('byDeck', 'deckId'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const t = db.transaction(['decks', 'files'], 'readwrite');
    t.objectStore('decks').put({ id: 'deck-e2e', courseId: 'x', title: 'Topic 3 Slides', date: '2026-09-22' });
    t.objectStore('files').put({ id: 'deck-e2e', blob: new Blob(['%PDF-1.4 slides'], { type: 'application/pdf' }) });
    await new Promise((r) => (t.oncomplete = r));
    db.close();
  });
  await ctx.close();

  // ---- B. haloplus.app is live; the student has not moved yet.
  const ctxB = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await setup(ctxB, true);
  // The same student's old-address storage, in place before any page script runs (as it is in their browser).
  await ctxB.addInitScript(({ sess, key }) => {
    if (location.origin === 'https://richardsgeorger-collab.github.io' && !localStorage.getItem(key)) localStorage.setItem(key, sess);
  }, { sess: JSON.stringify(s.session), key: `sb-${ref}-auth-token` });
  const oldB = await ctxB.newPage();
  await oldB.goto(`${OLD}#/now`, { waitUntil: 'load' });
  await oldB.waitForTimeout(3000);
  await oldB.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('school-dashboard-library', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('decks', { keyPath: 'id' }).createIndex('byCourse', 'courseId'); d.createObjectStore('files', { keyPath: 'id' }); d.createObjectStore('pages', { keyPath: ['deckId', 'n'] }).createIndex('byDeck', 'deckId'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const t = db.transaction(['decks', 'files'], 'readwrite');
    t.objectStore('decks').put({ id: 'deck-e2e', courseId: 'x', title: 'Topic 3 Slides', date: '2026-09-22' });
    t.objectStore('files').put({ id: 'deck-e2e', blob: new Blob(['%PDF-1.4 slides'], { type: 'application/pdf' }) });
    await new Promise((r) => (t.oncomplete = r));
    db.close();
  });
  await oldB.reload({ waitUntil: 'load' });
  await oldB.waitForSelector('.legacy-move', { timeout: 20000 }).catch(() => undefined);
  await oldB.waitForTimeout(800);
  await oldB.screenshot({ path: `${OUT}/1-move-screen.png` });
  check(/Halo\+ now lives at haloplus\.app/.test(await text(oldB, '.legacy-move')), 'B. once haloplus.app is up, the old address says where Halo+ lives now');
  const itemsBefore = await oldB.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1') ?? '{"items":[]}').items.length);
  const [fresh] = await Promise.all([ctxB.waitForEvent('page', { timeout: 15000 }), oldB.click('.legacy-move .onboard-big')]);
  await fresh.waitForURL(/haloplus\.app\/#\/now/, { timeout: 30000 }).catch(() => undefined);
  await fresh.waitForTimeout(3500);
  await fresh.screenshot({ path: `${OUT}/2-new-address.png` });
  const after = await fresh.evaluate(async () => {
    const v1 = JSON.parse(localStorage.getItem('school-dashboard:v1') ?? '{"items":[]}');
    const session = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
    const deck = await new Promise((res) => { const r = indexedDB.open('school-dashboard-library'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('files')) return res(null); const g = db.transaction('files').objectStore('files').get('deck-e2e'); g.onsuccess = async () => res(g.result ? await g.result.blob.text() : null); }; r.onerror = () => res(null); });
    const idx = await new Promise((res) => { const r = indexedDB.open('school-dashboard-library'); r.onsuccess = () => res([...r.result.transaction('decks').objectStore('decks').indexNames]); });
    return { origin: location.origin, items: v1.items.length, session, deck, idx };
  });
  check(after.origin === 'https://haloplus.app' && after.session && after.items >= itemsBefore && itemsBefore > 0, `B. one tap: haloplus.app opens signed in with the same ${after.items} items`);
  check(after.deck === '%PDF-1.4 slides' && after.idx.includes('byCourse'), 'B. and the library file came too, in the same database shape the app expects');
  await oldB.waitForURL(/haloplus\.app/, { timeout: 10000 }).catch(() => undefined);
  check(/haloplus\.app/.test(oldB.url()), 'B. the old tab moves on to haloplus.app as well');

  // ---- C. After the move: the same old bookmark.
  const oldC = await ctxB.newPage();
  await oldC.goto(`${OLD}#/you`, { waitUntil: 'load' });
  await oldC.waitForURL(/haloplus\.app\/#\/you/, { timeout: 10000 }).catch(() => undefined);
  check(/^https:\/\/haloplus\.app\/#\/you/.test(oldC.url()), `C. the old address now forwards straight on, route kept (${oldC.url()})`);
  await oldC.close();
  const haloC = await ctxB.newPage();
  await haloC.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  const dashP = ctxB.waitForEvent('page', { timeout: 15000 });
  await runBookmark(haloC, href);
  const dash = await dashP.catch(() => null);
  await haloC.waitForFunction(() => /Sent to the dashboard|did not answer|Copy/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => undefined);
  const said = await text(haloC, 'body');
  await haloC.screenshot({ path: `${OUT}/3-old-bookmark-after-move.png` });
  check(/Sent to the dashboard/.test(said), `C. the old bookmark hands off to haloplus.app: "${said.match(/Sent to the dashboard[^.]*\./)?.[0] ?? said.slice(0, 120)}"`);
  if (dash) {
    await dash.waitForTimeout(2500);
    check(/^https:\/\/haloplus\.app\//.test(dash.url()), `C. the tab it opened ended up on haloplus.app (${dash.url().slice(0, 50)})`);
    await dash.screenshot({ path: `${OUT}/4-review-on-new-address.png` });
  }
  await ctxB.close();

  // ---- D. Nothing saved on the old address: straight on.
  const ctxD = await browser.newContext({ serviceWorkers: 'block' });
  await setup(ctxD, true);
  const d = await ctxD.newPage();
  await d.goto(`${OLD}#/login`, { waitUntil: 'load' });
  await d.waitForURL(/haloplus\.app/, { timeout: 15000 }).catch(() => undefined);
  check(/^https:\/\/haloplus\.app\/#\/login/.test(d.url()), `D. a visitor with nothing saved is forwarded to haloplus.app (${d.url()})`);
  await ctxD.close();
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan', 'read_ledger']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaway`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
