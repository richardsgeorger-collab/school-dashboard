// The end of the free trial, then life on Free (George, 2026-10-25, Loop 268), on the real backend with throwaways only:
// a student on the last day of the trial with a synced term (scripts/lib/personas.mjs), ended by Admin's "End a test
// account's free week now" (admin_end_trial, from a throwaway admin), then Halo+ from the local build (LOCAL_SITE) and
// this repo's extension in a fresh Chrome, Halo faked (the stand-in). Desktop, phone width, and the extension.
// Checks: the trial-end screen is one calm screen (Free, Plus and Max as three equal choices, Stay on Free a button like
// the others, the $2.99 first month said with "then $7.99 a month", nothing red or scary); Stay on Free goes to Now with
// no "paused" banner and nothing gone; Classes; a Halo visit syncs Free and it applies; reloading Halo does not sync again
// within 30 minutes; This week and the live pill on Halo; the popup says Free syncs on Halo; an announcement's change
// shows as the kind only, "see it with Plus" (a real kinds-only AI call on Free's small budget).
//   KEYS_ENV=... [LOCAL_SITE=dist-site] [EXT_DIR=extension] node scripts/e2e-trial-end-free.mjs
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { haloPage, launch, sleep, until } from './lib/haloStandIn.mjs';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/trial-end-free';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const SCARY = /expired|you lost|you'll lose|you will lose|deleted|frozen|paused|last chance|hurry|act now|don't miss/i;
const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/halo-snap-fixture.ts'], { encoding: 'utf8' }));
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const classes = { getCourseClassesForUser: { courseClasses: [{ id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as1', sequence: 1, title: 'Topic 5 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] }] } };
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 900000);
const text = async (p, sel = 'body') => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const counts = async (uid) => ({
  items: (await db.from('items').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('deleted_at', null)).count,
  courses: (await db.from('courses').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('deleted_at', null)).count,
});

let proc = null;
let browser = null;
try {
  // The student on the trial's last day, and the admin who ends it.
  const who = await kit.persona('trial-1d');
  const boss = await kit.persona('admin');
  const before = await counts(who.id);
  const ac = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await ac.auth.setSession({ access_token: boss.session.access_token, refresh_token: boss.session.refresh_token });
  const { data: ended, error } = await ac.rpc('admin_end_trial', { p_email: who.email });
  check(!error && ended?.ok, `Admin ended the throwaway's free week (${error?.message ?? JSON.stringify(ended)})`);

  const l = await launch('chrome', 'trialend');
  ({ proc, browser } = l);
  const { ctx, load } = l;
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
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });

  // ---- Phone width first: the trial-end screen is seen once, so both widths look before it is answered ----
  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await phone.waitForSelector('.trial-ended', { timeout: 40000 }).catch(() => undefined);
  await sleep(2500);
  await phone.screenshot({ path: `${OUT}/phone-1-trial-end.png`, fullPage: true });
  await phone.close();

  // ---- Desktop: the trial-end screen ----
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.trial-ended', { timeout: 40000 });
  await sleep(3000);
  const screen = await text(p, '.trial-ended');
  const cards = await p.locator('.trial-end-choices .plan-choice').count();
  const btnClasses = await p.locator('.trial-end-choices .plan-choice button, .trial-end-choices .plan-choice a.btn').evaluateAll((els) => els.map((e) => e.className));
  check(/Your free week is over\. Everything you have stays\./.test(screen), 'the trial-end screen: "Your free week is over. Everything you have stays."');
  check(cards === 3 && /Free · \$0[\s\S]*You keep/.test(screen) && /Plus · \$4\.99 a month[\s\S]*Adds/.test(screen), `three choices: Free (what you keep), Plus (what it adds), Max (${cards} cards)`);
  check(btnClasses.length === 3 && new Set(btnClasses).size === 1 && /Stay on Free/.test(screen), `Stay on Free is a button like the other two (${btnClasses.join(' | ')})`);
  const intro = /\$2\.99 the first month/.test(screen);
  check(intro ? /\$2\.99 the first month[\s\S]{0,20}then \$7\.99 a month/.test(screen) : /Max · \$7\.99 a month/.test(screen), intro ? 'the $2.99 first month, with "then $7.99 a month" right under it' : 'Max at $7.99 a month (no intro offer for this account)');
  check(!SCARY.test(screen) && (await p.locator('.trial-ended [data-tone="red"]').count()) === 0, 'calm: nothing red, no scary words');
  await p.screenshot({ path: `${OUT}/desk-1-trial-end.png` });

  // ---- Stay on Free: the first open after ----
  await p.click('.trial-end-choices button:has-text("Stay on Free")');
  await sleep(2500);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup', '.ext-setup-sheet button.btn:has-text("Skip for now")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  await sleep(800);
  const now = await text(p, 'main');
  check((await p.locator('.trial-ended').count()) === 0 && (await p.locator('.frozen-banner').count()) === 0 && !SCARY.test(now), `Stay on Free: Now, no "sync paused" banner, nothing scary ("${now.slice(0, 90)}")`);
  const after = await counts(who.id);
  check(after.items >= before.items && after.courses >= before.courses, `nothing disappeared: items ${before.items} → ${after.items}, classes ${before.courses} → ${after.courses}`);
  await p.screenshot({ path: `${OUT}/desk-2-now-after.png` });
  await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
  await sleep(2500);
  const cls = await text(p, 'main');
  check(!/part of Plus|sync(ing)? is part/i.test(cls) && !SCARY.test(cls), 'Classes: no "sync is part of Plus", nothing scary');
  await p.screenshot({ path: `${OUT}/desk-3-classes.png` });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await sleep(1500);

  // ---- The extension on Free: a Halo visit syncs, and it applies ----
  const { id, worker } = await load(EXT);
  await sleep(4000);
  kit.device((await worker.evaluate(() => chrome.storage.local.get('deviceId'))).deviceId);
  const t0 = new Date().toISOString();
  const halo = await ctx.newPage();
  await halo.setViewportSize({ width: 1280, height: 860 });
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  const landed = await until(async () => (await db.from('pending_syncs').select('id, created_at, payload->>visit').eq('user_id', who.id).gte('created_at', t0).limit(1)).data?.[0] ?? null, 90000, 2000);
  check(!!landed && landed.visit === 'true', `Free: a Halo visit synced on its own (${landed ? `${Math.round((Date.parse(landed.created_at) - Date.parse(t0)) / 1000)} s` : 'no'})`);
  const applied = await until(async () => {
    const at = (await db.from('settings').select('data->lastPull->>at').eq('user_id', who.id).single()).data?.at ?? null;
    return at && at >= t0 ? at : null;
  }, 60000, 2000);
  check(!!applied, `Free: the sync applied in Halo+ (last sync ${applied ?? 'unchanged'})`);
  await p.bringToFront();
  await sleep(1500);
  await p.screenshot({ path: `${OUT}/desk-4-now-after-sync.png` });
  // No loop: reloading Halo four times in a row syncs nothing more (one try per 30 minutes).
  await halo.bringToFront();
  for (let i = 0; i < 4; i++) {
    await halo.reload({ waitUntil: 'load' });
    await sleep(5000);
  }
  const n = (await db.from('pending_syncs').select('id', { count: 'exact', head: true }).eq('user_id', who.id).gte('created_at', t0)).count;
  check(n === 1, `no sync loop: four more Halo visits, still one sync (${n})`);
  // This week and the pill, live.
  await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  await sleep(4000);
  // The panel lives in a shadow root: its words are read from there.
  const week = ((await halo.locator('[data-haloplus="week"]').first().evaluate((e) => e.shadowRoot?.querySelector('.root')?.textContent ?? '').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const pill = await text(halo, '.pill');
  check(!!week && !/as of /i.test(week), `This week on Halo, live ("${week.slice(0, 80)}")`);
  check(!!pill && !/^Halo\+ · synced/.test(pill), `the pill is the live one ("${pill.slice(0, 60)}")`);
  check(!/part of Plus|upgrade|see plans/i.test(await text(halo)), 'no upsell on the Halo page');
  await halo.screenshot({ path: `${OUT}/ext-1-halo-home.png` });
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 360, height: 520 });
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await sleep(1500);
  const popText = await text(pop);
  check(/Syncs whenever you're on Halo/.test(popText) && !/part of Plus/.test(popText), `the popup on Free: "${popText.slice(0, 140)}"`);
  await pop.screenshot({ path: `${OUT}/ext-2-popup.png` });
  await pop.close();

  // ---- An announcement's change, as the kind only ----
  const locked = await until(async () => {
    const { data } = await db.from('items').select('id, data').eq('user_id', who.id);
    return (data ?? []).find((r) => r.data?.lockedChange?.kinds?.length) ?? null;
  }, 150000, 4000);
  check(!!locked, `the kinds-only check marked an assignment (${locked ? `${locked.data.title}: ${locked.data.lockedChange.kinds.join(', ')}` : 'none'})`);
  if (locked) {
    check(!locked.data.dateChange && !(locked.data.requirements ?? []).some((r) => r.source?.kind === 'announcement'), 'no details reached the account: no moved date, no announcement steps');
    await p.goto(`https://haloplus.app/#/class?c=${locked.data.courseId}&i=${locked.id}`, { waitUntil: 'load' });
    await p.waitForSelector('.locked-change', { timeout: 30000 }).catch(() => undefined);
    await sleep(800);
    const line = await text(p, '.locked-change');
    check(/^An announcement (changed the due date|added a step|changed the due date and added a step) · See it with Plus$/.test(line), `the assignment note: "${line}"`);
    await p.screenshot({ path: `${OUT}/desk-5-locked-line.png` });
  }
  // ---- Phone width after ----
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await sleep(2500);
  await p.screenshot({ path: `${OUT}/phone-2-now.png` });
  await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
  await sleep(2000);
  await p.screenshot({ path: `${OUT}/phone-3-classes.png` });
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  await browser?.close().catch(() => undefined);
  proc?.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
