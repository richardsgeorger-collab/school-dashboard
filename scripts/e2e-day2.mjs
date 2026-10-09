// The rest of a normal day (2026-10-08, quality-of-life round 2): Classes, one class page, an announcement opened in
// Inbox, Study, the Add sheet, and You → Halo connection, on desktop and phone, with the same measures as e2e-day.mjs.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-day2.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/day';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const notes = [];
const note = (line) => { notes.push(line); console.log(`note ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const DEV = { desk: { viewport: { width: 1280, height: 860 } }, phone: { ...devices['iPhone 14'] } };

async function screen(p, dev, name, hash, ready) {
  const t0 = Date.now();
  await p.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await p.waitForSelector(ready, { timeout: 30000 });
  const drawn = Date.now() - t0;
  await sleep(2000);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup', '.ext-setup-sheet button.btn:has-text("Skip for now")', '.time-ask .diff-toggle']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  console.log(`${dev} ${name}: drawn in ${drawn} ms${wide ? ', SIDEWAYS SCROLL' : ''}`);
  if (drawn > 2500) note(`${dev} ${name} took ${drawn} ms to draw`);
  if (wide) note(`${dev} ${name} scrolls sideways`);
  await p.screenshot({ path: `${OUT}/${dev}-${name}.png` });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const dev of ['desk', 'phone']) {
    const s = await kit.persona('max');
    const ctx = await browser.newContext({ ...DEV[dev], colorScheme: 'light' });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await screen(p, dev, '13-classes', '#/classes', '.class-card');
    const first = Object.values(s.courseIds)[0];
    await screen(p, dev, '14-class-page', `#/class?c=${first}`, 'main');
    await screen(p, dev, '15-inbox', '#/inbox', '.news-item');
    await p.locator('.news-item').first().click();
    await sleep(1200);
    await p.screenshot({ path: `${OUT}/${dev}-16-announcement-open.png` });
    const opened = await text(p, '.news-item[data-open="true"]');
    console.log(`${dev} announcement opened: "${opened.slice(0, 160)}"`);
    await screen(p, dev, '17-study', '#/study', 'main');
    await p.locator('.topbar [aria-label="Add something"]').first().click();
    await sleep(1000);
    await p.screenshot({ path: `${OUT}/${dev}-18-add.png` });
    const add = await text(p, '.modal, .capture, .palette');
    console.log(`${dev} add sheet: "${add.slice(0, 160)}"`);
    await p.keyboard.press('Escape');
    await sleep(400);
    await screen(p, dev, '19-you-halo', '#/you?s=halo', 'main');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(`\n${notes.length} notes:\n${notes.map((n) => `- ${n}`).join('\n')}`);
