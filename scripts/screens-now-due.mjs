// George's Chem HW 4 card on Now (2026-11-04), rebuilt with the demo student (Maya Torres, made up) and checked on the
// rendered screen: a homework due this Sunday that Halo+ plans to finish Saturday, whose estimate (1.5h) is not her
// own pace for that class's homework (three done at 45m), with an announcement line that only restates its due date.
// Now must say "due Sunday, best finished by Saturday" (never "due Saturday"), one time everywhere (the card's chip,
// the why line and the "Next worth starting" sentence), and no "Also required" line for the restatement.
// A throwaway Max account (personas.mjs), Maya on this computer only, the local build (LOCAL_SITE).
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/screens-now-due.mjs
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
const OUT = 'docs/screens/now-due';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

const demo = JSON.parse(execFileSync('npx', ['tsx', '-e', "import { demoStudent } from './src/demo/student'; process.stdout.write(JSON.stringify(demoStudent(new Date().toISOString())));"], { encoding: 'utf8' }));
const tz = demo.data.settings.timezone;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const local = (days, hhmm) => {
  const [y, m, dd] = today.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, dd + days, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  const shown = new Date(new Date(guess).toLocaleString('en-US', { timeZone: tz }) + ' UTC').getTime();
  return new Date(guess + (guess - shown)).toISOString();
};
// This coming Sunday, at least two days out.
const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
let toSun = (7 - dow) % 7;
if (toSun < 2) toSun += 7;
const sunday = local(toSun, '23:59');
// Everything else out of the way: Now is the calm "You're good" with the homework as the next thing worth starting.
for (const i of demo.data.items) if (i.status !== 'done') Object.assign(i, { status: 'done', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const hw = demo.data.items.find((i) => i.type === 'homework') ?? demo.data.items[0];
const when = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(sunday));
Object.assign(hw, {
  title: 'Homework 4', label: 'Chem HW 4', type: 'homework', status: 'todo', completedAt: null, score: null, dueAt: sunday, estimatedMinutes: 90, estimateOverridden: false, points: 30, updatedAt: new Date().toISOString(),
  requirements: [{ id: 'req-restate', text: `Submit Homework 4 by ${when}, 11:59 pm`, dueAt: sunday, done: false, doneAt: null, gradedOn: true, scope: 'instance', addedAt: new Date().toISOString(), source: { kind: 'announcement', id: 'ann-1', title: 'Homework 4 reminder', quote: `Submit Homework 4 by ${when}, 11:59 pm`, at: new Date().toISOString() } }],
});
// Her own pace for this class's homework: three done at 45 minutes.
let k = 0;
for (const i of demo.data.items) {
  if (i.id === hw.id || i.courseId !== hw.courseId || k >= 3) continue;
  Object.assign(i, { type: 'homework', status: 'done', actualMinutes: 45, completedAt: new Date(Date.now() - (k + 2) * 864e5).toISOString() });
  k++;
}
demo.data.settings.joy = { ...demo.data.settings.joy, pending: null };

const kit = personaKit(env);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const who = await kit.persona('max');
  for (const [label, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { ...devices['iPhone 14'] }]]) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
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
      localStorage.setItem('school-dashboard:demo-seed', '[]');
      localStorage.setItem('school-dashboard:demo', '1');
    }, { ses: who.session, key: `sb-${ref}-auth-token`, d: demo });
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.demo-chip,.demo-tour{display:none!important}'; document.head.appendChild(s); }));
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
    await p.waitForSelector('.now-head', { timeout: 30000 });
    await sleep(3000);
    // "Show what's next anyway" if Now says the day is done.
    const more = p.locator('.calm-more');
    if (await more.count()) await more.first().click().catch(() => undefined);
    await sleep(800);
    const body = (await p.locator('.now').innerText()).replace(/\s+/g, ' ');
    const chips = (await p.locator('.hero').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const times = [...body.matchAll(/~?(\d+(?:\.\d+)?h(?: \d+m)?|\d+m)\b/g)].map((m) => m[1]);
    if (label === 'desktop') {
      console.log(`  Now: ${body.slice(0, 400)}`);
      check(!/due Saturday/i.test(body), 'never "due Saturday" for work due Sunday');
      check(/due Sunday/i.test(body), 'says it is due Sunday');
      check(!/best finished/i.test(body) || /best finished by Saturday/i.test(body), 'Saturday only as "best finished by"');
      check(/45m/.test(chips) && !/1\.5h|1h 30m|90m/.test(body), `one time everywhere: her 45m (times on Now: ${[...new Set(times)].join(', ')})`);
      check(!/Also required/i.test(body) && !/Submit Homework 4 by/i.test(body), 'no "Also required" restating the due date');
    }
    await p.screenshot({ path: `${OUT}/chem-hw4-${label}.png`, fullPage: label === 'desktop' });
    await ctx.close();
  }
} finally {
  await browser.close();
  await kit.cleanup?.();
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
