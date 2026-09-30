// The move to haloplus.app, checked on the LIVE sites (2026-09-30): the real github.io and haloplus.app, the real
// backend, a throwaway account; only Halo is faked. The old bookmark is the loader every student saved before the
// move: it loads halo-sync.js from github.io. Scenarios B, C, D of e2e-domain-move.mjs (A needs haloplus.app down).
//   A. Before haloplus.app is live: an old bookmark syncs to the github.io tab exactly as today; no move screen.
//   B. haloplus.app goes live: the github.io tab shows the move screen; one tap moves the planner, the sign-in and a
//      library file to haloplus.app, which opens signed in with the same classes and the file.
//   C. After the move: the same old bookmark (it loads its script from github.io and opens github.io) hands off to
//      haloplus.app, and Halo says "Sent to the dashboard".
//   D. Someone with nothing saved who opens the old address is forwarded straight to haloplus.app.
//   KEYS_ENV=... node scripts/e2e-domain-move.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const OLD = 'https://richardsgeorger-collab.github.io/school-dashboard/';
const OUT = 'docs/screens/domain-live';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const CLASSES = { getCourseClassesForUser: { courseClasses: [{ id: 'cc1', classCode: 'CHM-113-O500', slugId: 'chm-113-o500', startDate: '2026-09-01', endDate: '2026-12-15', name: 'General Chemistry I', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113',
  units: [{ id: 'u1', title: 'Topic 3', sequence: 3, startDate: '2026-09-21', endDate: '2026-10-04', assessments: [
    { id: 'as1', sequence: 1, title: 'Topic 3 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false },
  ] }] }] } };
const setup = async (ctx) => {
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
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');

// The bookmark as saved before the move (short loader, as bookmarklet.ts built it for github.io).
const OLD_LOADER = `(function(){ if(location.hostname!=="halo.gcu.edu"){alert('Open halo.gcu.edu first, then click this bookmark.');return;} var s=document.createElement('script'); s.src="https://richardsgeorger-collab.github.io/school-dashboard/halo-sync.js"+'?v='+Date.now(); s.onerror=function(){s.remove();alert('could not load');}; (document.head||document.documentElement).appendChild(s); })();`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const made = [];
try {
  const email = `e2e-move-live-${Date.now()}@example.invalid`;
  const { data: cu } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(cu.user.id);
  await admin.from('profiles').update({ tier: 'plus' }).eq('user_id', cu.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const now = new Date().toISOString();
  const v1 = { courses: [{ id: 'c-move', code: 'CHM-113', name: 'General Chemistry I', color: '#2E7D6B', credits: 3, instructors: [], meetings: [], online: false, termStart: '2026-09-01', termEnd: '2026-12-15', updatedAt: now }],
    items: [{ id: 'i-move', courseId: 'c-move', title: 'Lab 4 Report', label: 'Lab 4 Report', labelOverridden: false, type: 'assignment', points: 75, opensAt: null, dueAt: day(5), estimatedMinutes: 60, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: 'moved with me', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'manual', award: null, updatedAt: now }],
    settings: { timezone: 'America/Phoenix', onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' } } };

  // ---- B. A student with a planner on the old address.
  const ctxB = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await setup(ctxB);
  await ctxB.addInitScript(({ sess, key, v1: data }) => {
    if (location.origin !== 'https://richardsgeorger-collab.github.io' || localStorage.getItem(key)) return;
    localStorage.setItem(key, sess);
    localStorage.setItem('school-dashboard:v1', JSON.stringify(data));
  }, { sess: JSON.stringify(s.session), key: `sb-${ref}-auth-token`, v1 });
  const oldB = await ctxB.newPage();
  await oldB.goto(`${OLD}#/now`, { waitUntil: 'load' });
  await oldB.waitForSelector('.legacy-move', { timeout: 25000 }).catch(() => undefined);
  await oldB.waitForTimeout(800);
  await oldB.screenshot({ path: `${OUT}/1-move-screen.png` });
  check(/Halo\+ now lives at haloplus\.app/.test(await text(oldB, '.legacy-move')), `B. the live github.io site shows the move screen (${oldB.url().slice(0, 60)})`);
  const [fresh] = await Promise.all([ctxB.waitForEvent('page', { timeout: 15000 }), oldB.click('.legacy-move .onboard-big')]);
  await fresh.waitForURL(/haloplus\.app\/#\/now/, { timeout: 30000 }).catch(() => undefined);
  await fresh.waitForTimeout(4000);
  await fresh.screenshot({ path: `${OUT}/2-new-address.png` });
  const after = await fresh.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('school-dashboard:v1') ?? '{"items":[]}');
    return { origin: location.origin, items: v.items.map((i) => i.notes), session: Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)) };
  });
  check(after.origin === 'https://haloplus.app' && after.session && after.items.includes('moved with me'), `B. one tap: haloplus.app opens signed in, with the planner (${JSON.stringify(after)})`);
  await oldB.waitForURL(/haloplus\.app/, { timeout: 10000 }).catch(() => undefined);
  check(/haloplus\.app/.test(oldB.url()), 'B. the old tab moves on to haloplus.app too');

  // ---- C. After the move: the old address and the old bookmark.
  const oldC = await ctxB.newPage();
  await oldC.goto(`${OLD}#/you`, { waitUntil: 'load' });
  await oldC.waitForURL(/haloplus\.app\/#\/you/, { timeout: 15000 }).catch(() => undefined);
  check(/^https:\/\/haloplus\.app\/#\/you/.test(oldC.url()), `C. the old address forwards, route kept (${oldC.url()})`);
  await oldC.close();
  const haloC = await ctxB.newPage();
  await haloC.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  const dashP = ctxB.waitForEvent('page', { timeout: 20000 });
  await haloC.addScriptTag({ content: OLD_LOADER });
  const dash = await dashP.catch(() => null);
  await haloC.waitForFunction(() => /Sent to the dashboard|did not answer|Copy/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => undefined);
  const said = await text(haloC, 'body');
  await haloC.screenshot({ path: `${OUT}/3-old-bookmark.png` });
  check(/Sent to the dashboard/.test(said), `C. the old bookmark (script from github.io) syncs: "${said.match(/Sent to the dashboard[^.]*\./)?.[0] ?? said.slice(0, 160)}"`);
  if (dash) {
    await dash.waitForTimeout(3000);
    await dash.screenshot({ path: `${OUT}/4-review.png` });
    check(/^https:\/\/haloplus\.app\//.test(dash.url()), `C. the review opened on haloplus.app (${dash.url().slice(0, 60)})`);
    const review = await text(dash, 'body');
    check(/Topic 3 Homework|Chem HW 3/.test(review), "C. and the synced item is on the page (Topic 3 Homework, shown as Chem HW 3)");
  } else check(false, 'C. the bookmark opened a dashboard tab');
  await ctxB.close();

  // ---- D. Nothing saved on the old address.
  const ctxD = await browser.newContext({ serviceWorkers: 'block' });
  const d = await ctxD.newPage();
  await d.goto(`${OLD}#/login`, { waitUntil: 'load' });
  await d.waitForURL(/haloplus\.app/, { timeout: 15000 }).catch(() => undefined);
  check(/^https:\/\/haloplus\.app\/#\/login/.test(d.url()), `D. a first-time visitor is forwarded (${d.url()})`);
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
