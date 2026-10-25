// Screens with the demo student (Maya Torres, made up), the way demo mode is shown: a signed-in account (a throwaway
// Max one, scripts/lib/personas.mjs) with Maya loaded on this computer (her data never reaches the account). The demo's
// own presenter chip is hidden: students never see it. Halo+ from the local build (LOCAL_SITE).
//   - Now with her Midterm Exam six days out and homework due tomorrow (desktop, phone) and the Study tab's plan for the
//     exam, to docs/screens/now-exam/maya-*.png;
//   - the semester GPA card, 1280x800, to webstore-upload/screenshots/ (the Web Store's size).
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/screens-maya.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('docs/screens/now-exam', { recursive: true });
mkdirSync('webstore-upload/screenshots', { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

// Maya's term, as of now: the Midterm Exam six days out (8 AM, her zone), Topic 3 Homework due tomorrow night, nothing
// waiting to be celebrated (a grade-up toast would sit over the screen).
const demo = JSON.parse(execFileSync('npx', ['tsx', '-e', "import { demoStudent } from './src/demo/student'; process.stdout.write(JSON.stringify(demoStudent(new Date().toISOString())));"], { encoding: 'utf8' }));
const tz = demo.data.settings.timezone;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const local = (days, hhmm) => {
  // A wall-clock time in her zone, as an instant.
  const [y, m, dd] = today.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, dd + days, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  const shown = new Date(new Date(guess).toLocaleString('en-US', { timeZone: tz }) + ' UTC').getTime();
  return new Date(guess + (guess - shown)).toISOString();
};
const exam = demo.data.items.find((i) => i.title === 'Midterm Exam');
const hw = demo.data.items.find((i) => i.title === 'Topic 3 Homework: Cell Division');
Object.assign(exam, { dueAt: local(6, '08:00'), updatedAt: new Date().toISOString() });
Object.assign(hw, { dueAt: local(1, '23:59'), updatedAt: new Date().toISOString() });
demo.data.settings.joy = { ...(demo.data.settings.joy ?? {}), pending: null };

const kit = personaKit(env);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const who = await kit.persona('max');
  const open = async (opts, scheme = 'light') => {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme, reducedMotion: 'reduce' });
    await ctx.route('https://haloplus.app/**', (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
      let file = join(LOCAL_SITE, path || 'index.html');
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
    });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
    await ctx.addInitScript(({ ses, key, d }) => {
      if (location.hostname !== 'haloplus.app') return;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses));
      if (localStorage.getItem('school-dashboard:demo') === '1') return;
      localStorage.setItem('school-dashboard:v1:demo', JSON.stringify(d.data));
      localStorage.setItem('school-dashboard:pending:demo', '[]');
      localStorage.setItem('school-dashboard:now-snapshot:demo', JSON.stringify(d.snapshot));
      localStorage.setItem('school-dashboard:demo-seed', JSON.stringify(d.announcements));
      localStorage.setItem('school-dashboard:demo', '1');
    }, { ses: who.session, key: `sb-${ref}-auth-token`, d: demo });
    await ctx.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = '.demo-chip,.demo-tour{display:none!important}';
        document.head.appendChild(s);
      });
    });
    return ctx;
  };
  // ---- Now: the exam six days out ----
  for (const [label, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { ...devices['iPhone 14'] }]]) {
    const ctx = await open(opts);
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
    await p.waitForSelector('.now-head', { timeout: 30000 });
    await sleep(3000);
    const hero = await p.locator('.hero .hero-title').first().innerText().catch(() => '');
    const then = (await p.locator('.then').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const now = await p.locator('.now').innerText();
    if (label === 'desktop') {
      check(hero && hero !== 'Midterm Exam', `Maya's Now: the hero is what is due soonest ("${hero}"), not the exam six days out`);
      check(!/Study plan|study left|Log study|fit around it/i.test(now), 'no study plan on Now');
      check(/Then/i.test(then), `Then is there: "${then.slice(0, 140)}"`);
      check(!/Demo/.test(await p.locator('body').innerText()), 'no demo chip in the screenshot');
    }
    await p.screenshot({ path: `docs/screens/now-exam/maya-exam-6-days-${label}.png`, fullPage: label === 'desktop' });
    if (label === 'desktop') {
      // ---- Study: the plan for the exam ----
      await p.goto(`https://haloplus.app/#/practice?i=${exam.id}&k=plan`, { waitUntil: 'load' });
      await sleep(3500);
      const plan = await p.locator('main, #root').first().innerText();
      check(/Practice for Midterm Exam/.test(plan) && !/part of Max/.test(plan), 'the Study tab: the plan for her Midterm Exam (Max)');
      await p.screenshot({ path: 'docs/screens/now-exam/maya-study-plan-desktop.png', fullPage: true });
    }
    await ctx.close();
  }
  // ---- The GPA card, for the Web Store (1280x800) ----
  {
    const ctx = await open({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
    // The GPA chip beside "Add class", its sheet open over Classes.
    await p.waitForSelector('.gpa-chip', { timeout: 30000 });
    await sleep(1500);
    await p.click('.gpa-chip');
    await p.waitForSelector('.modal .gpa');
    await sleep(500);
    const gpa = (await p.locator('.gpa-head').innerText()).replace(/\s+/g, ' ');
    check(/^\d\.\d\d projected/.test(gpa), `the GPA sheet: "${gpa}"`);
    await p.screenshot({ path: 'webstore-upload/screenshots/4-gpa.png' });
    await ctx.close();
  }
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  await browser.close().catch(() => undefined);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
