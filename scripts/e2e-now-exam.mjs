// Now is only about what is due (George, 2026-10-24: "exam mode" took Now over with a study plan). A throwaway Max
// account with the made-up term (scripts/lib/personas.mjs), Halo+ from the local build at haloplus.app in Chrome.
//   A. A 150-point exam six days out and homework due tomorrow: the homework is the hero; Then is there, the exam in
//      it by its date; no study plan, no "study left", no "Log study time", no "fit around it" anywhere on Now.
//   B. The exam tomorrow: it is the hero, with Practice, Done and Open in Halo and nothing else.
//   C. The exam's sheet has one quiet "Make a study plan", which opens the Study tab's plan for that exam; the plan
//      never names participation or a discussion post.
// Desktop and phone, to docs/screens/now-exam/.
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/e2e-now-exam.mjs
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/now-exam';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const DAY = 86_400_000;
const phxToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date());
const due = (n, hhmm = '23:59') => new Date(Date.parse(`${phxToday()}T${hhmm}:00-07:00`) + n * DAY).toISOString();
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 480000);
const STUDY = /Study plan|study left|Log study|fit around it|still fit|inside your hours|Reading announcement \d+ of|where you lost points/i;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function open(who, opts = {}) {
  const ctx = await browser.newContext(opts.phone ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.now-head', { timeout: 30000 });
  await sleep(2500);
  return { ctx, p };
}
/** Everything open due before `beforeIso` done, except `keep`: the scene is just the two items being compared. */
async function clearBefore(who, beforeIso, keep) {
  const { data } = await db.from('items').select('id, data').eq('user_id', who.id);
  for (const r of data) {
    if (!r.data.dueAt || r.data.status === 'done' || r.data.title === keep || r.data.title === 'Midterm Exam' || r.data.dueAt >= beforeIso) continue;
    const next = { ...r.data, status: 'done', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await db.from('items').update({ data: next, updated_at: next.updatedAt }).eq('id', r.id);
  }
}
/** Move one of the account's items by title. */
async function patch(who, title, fields) {
  const { data } = await db.from('items').select('id, data').eq('user_id', who.id);
  const row = data.find((r) => r.data.title === title);
  const next = { ...row.data, ...fields, updatedAt: new Date().toISOString() };
  await db.from('items').update({ data: next, updated_at: next.updatedAt }).eq('id', row.id);
}
const nowText = (p) => p.locator('.now').innerText();

try {
  const who = await kit.persona('max');
  await db.from('profiles').update({ test_override: true }).eq('user_id', who.id);

  // ---- A. Exam six days out, homework due tomorrow ----
  await patch(who, 'Midterm Exam', { dueAt: due(6, '08:00'), estimatedMinutes: 420 });
  await patch(who, 'Topic 3 Homework: Cell Division', { dueAt: due(1), points: 80 });
  await clearBefore(who, due(6, '08:00'), 'Topic 3 Homework: Cell Division');
  for (const phone of [false, true]) {
    const { ctx, p } = await open(who, { phone });
    const hero = await p.locator('.hero .hero-title').first().innerText().catch(() => '');
    const all = await nowText(p);
    const then = await p.locator('.then').first().innerText().catch(() => '');
    if (!phone) {
      check(hero === 'Topic 3 Homework: Cell Division', `due tomorrow beats an exam six days out: the hero is "${hero}"`);
      check(/^Midterm Exam/m.test(then.replace(/^THEN\n?/i, '')), `Then is there, the exam first in it by its date: "${then.replace(/\s+/g, ' ').slice(0, 90)}"`);
      check(!STUDY.test(all), `no study plan, study hours or "fit around it" on Now${STUDY.test(all) ? `: "${all.match(STUDY)[0]}"` : ''}`);
    }
    await p.screenshot({ path: `${OUT}/exam-6-days-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    await ctx.close();
  }

  // ---- B. The exam tomorrow ----
  await patch(who, 'Midterm Exam', { dueAt: due(1, '08:00') });
  await patch(who, 'Topic 3 Homework: Cell Division', { dueAt: due(3) });
  await clearBefore(who, due(1, '08:00'), '');
  for (const phone of [false, true]) {
    const { ctx, p } = await open(who, { phone });
    const hero = await p.locator('.hero .hero-title').first().innerText().catch(() => '');
    const buttons = (await p.locator('.hero .hero-actions').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const more = await p.locator('.hero .hero-more').count();
    if (!phone) {
      check(hero === 'Midterm Exam', `the exam tomorrow is the hero ("${hero}")`);
      check(buttons === 'Practice Done Open in Halo ↗' && more === 0, `its buttons: "${buttons}"${more ? ' and a second row' : ''}`);
      check(!STUDY.test(await nowText(p)), 'still no study plan on Now');
    }
    await p.screenshot({ path: `${OUT}/exam-tomorrow-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    if (!phone) {
      // ---- C. Make a study plan, in the Study tab ----
      // The exam's sheet, from its class page (the address Halo+'s own links use).
      const { data: rows } = await db.from('items').select('id, data').eq('user_id', who.id);
      const ex = rows.find((r) => r.data.title === 'Midterm Exam');
      await p.goto(`https://haloplus.app/#/class?c=${ex.data.courseId}&i=${ex.id}`, { waitUntil: 'load' });
      const link = p.locator('a:has-text("Make a study plan")');
      await link.waitFor({ timeout: 8000 });
      check((await link.getAttribute('href'))?.includes('k=plan'), 'the sheet: one quiet "Make a study plan"');
      await link.click();
      await p.waitForURL(/#\/practice\?/, { timeout: 10000 });
      await sleep(2500);
      const study = await p.locator('main, #root').first().innerText();
      check(/Midterm Exam/.test(study) && !/participation|DQ|discussion/i.test(study.split('\n').filter((l) => /^(Today|Tomorrow|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(l)).join('\n')), 'the Study tab plan for the exam, no participation or discussion sessions');
      await p.screenshot({ path: `${OUT}/study-plan-desktop.png`, fullPage: true });
    }
    await ctx.close();
  }
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.message.split('\n')[0]);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
