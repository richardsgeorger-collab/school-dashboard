// Classes with the demo student (Maya Torres, made up), as demo mode is shown: a signed-in throwaway Max account
// (scripts/lib/personas.mjs) with Maya loaded on this computer; her presenter chip hidden. Desktop and phone, light and
// dark, to docs/screens/classes/<label>/ (e.g. before, after); with GPA=1 also the GPA panel open.
//   KEYS_ENV=... LABEL=after [GPA=1] [LOCAL_SITE=dist-site] node scripts/screens-classes.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = `docs/screens/classes/${process.env.LABEL ?? 'now'}`;
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const demo = JSON.parse(execFileSync('npx', ['tsx', '-e', "import { demoStudent } from './src/demo/student'; process.stdout.write(JSON.stringify(demoStudent(new Date().toISOString())));"], { encoding: 'utf8' }));
demo.data.settings.joy = { ...(demo.data.settings.joy ?? {}), pending: null };
const kit = personaKit(env);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const who = await kit.persona('max');
  for (const [label, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { ...devices['iPhone 14'] }]]) {
    for (const scheme of ['light', 'dark']) {
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
      await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.demo-chip,.demo-tour{display:none!important}'; document.head.appendChild(s); }));
      const p = await ctx.newPage();
      await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
      await p.waitForSelector('.classes-list', { timeout: 30000 });
      await sleep(2500);
      await p.screenshot({ path: `${OUT}/classes-${label}-${scheme}.png`, fullPage: label === 'desktop' });
      if (process.env.GPA) {
        await p.click('.gpa-chip');
        await sleep(600);
        await p.screenshot({ path: `${OUT}/gpa-${label}-${scheme}.png` });
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
