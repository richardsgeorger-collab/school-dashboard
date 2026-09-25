// Screenshots of every screen at iPhone size, light and dark, against a running preview (npm run preview).
//   node scripts/screens.mjs <label>            → docs/screens/<label>/<screen>-<light|dark>.png
// Populated screens use the sample term (#/now?seed=1); onboarding and empty states use a fresh profile.
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const label = process.argv[2] ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = `docs/screens/${label}`;
mkdirSync(OUT, { recursive: true });
const SEEDED = [
  ['now', '#/now'],
  ['now-done', '#/now', async (page) => { await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); for (const i of d.items) if (i.dueAt.slice(0, 10) <= today && i.status !== 'done') { i.status = 'done'; i.completedAt = new Date().toISOString(); } localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500); }],
  ['calendar', '#/calendar'],
  ['calendar-month', '#/calendar?v=month'],
  ['classes', '#/classes'],
  ['class', '#/classes', async (page) => { await page.click('.classes-list a'); await page.waitForTimeout(500); }],
  ['inbox', '#/inbox'],
  ['you', '#/you'],
  ['plans', '#/you?s=plan'],
  ['ai', '#/ai'],
  ['load', '#/load'],
  ['item', '#/now', async (page) => { await page.click('.hero-title-btn'); await page.waitForTimeout(500); }],
];
const FRESH = [
  ['onboarding-1', '#/now'],
  ['onboarding-halo', '#/now', async (page) => { for (const t of ['Next', 'Next', 'Get started']) { await page.click(`.onboard button:has-text("${t}")`); await page.waitForTimeout(250); } }],
  ['onboarding-prefs', '#/now', async (page) => { for (const t of ['Next', 'Next', 'Get started', 'do this later']) { await page.click(`.onboard button:has-text("${t}")`); await page.waitForTimeout(250); } }],
  ['now-empty', '#/now', async (page) => { await page.click('.onboard button:has-text("Skip for now")'); await page.waitForTimeout(400); }],
  ['landing', 'landing/'],
  ['landing-full', 'landing/', null, true],
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const scheme of ['light', 'dark']) {
  for (const [group, list] of [['seeded', SEEDED], ['fresh', FRESH]]) {
    const ctx = await browser.newContext({ ...devices['iPhone 14'], colorScheme: scheme, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    if (group === 'seeded') {
      await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
      await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.theme = 'system'; d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
    }
    for (const [name, route, act, full] of list) {
      // Every fresh screen starts from nothing: onboarding progress must not carry over between shots.
      if (group === 'fresh') await page.evaluate(() => localStorage.clear()).catch(() => undefined);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      if (act) await act(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${name}-${scheme}.png`, fullPage: !!full });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`wrote ${(SEEDED.length + FRESH.length) * 2} screenshots to ${OUT}/`);
