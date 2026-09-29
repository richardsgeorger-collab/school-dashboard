// Edge cases a stressed freshman will hit: a class with nothing in it, a fresh account before any sync, empty
// Inbox/Grades/Library/Load, a brand-new user's Sync sheet. Screenshots to docs/screens/edge/, phone size, light.
//   node scripts/edge.mjs
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/edge';
mkdirSync(OUT, { recursive: true });
const done = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' };
const SCENES = [
  ['empty-class', async (page) => {
    await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
    await page.evaluate((ob) => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = ob; d.courses.push({ id: 'empty1', code: 'PHY-111', name: 'Physics I', color: '#3a7bd5', credits: 4, instructors: [], meetings: [], online: true, termStart: d.courses[0].termStart, termEnd: d.courses[0].termEnd, updatedAt: new Date().toISOString() }); localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }, done);
    await page.goto(`${BASE}#/class?c=empty1`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
  }],
  ['empty-classes-card', async (page) => { await page.goto(`${BASE}#/classes`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-now', async (page) => { await page.evaluate(() => localStorage.clear()); await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.click('.onboard button:has-text("Skip for now")'); }],
  ['fresh-sync-sheet', async (page) => { await page.click('.empty button:has-text("Sync Halo")'); await page.waitForTimeout(500); }],
  ['fresh-calendar', async (page) => { await page.goto(`${BASE}#/calendar`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-classes', async (page) => { await page.goto(`${BASE}#/classes`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-grades', async (page) => { await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-library', async (page) => { await page.goto(`${BASE}#/library`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-load', async (page) => { await page.goto(`${BASE}#/load`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-you', async (page) => { await page.goto(`${BASE}#/you`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-study', async (page) => { await page.goto(`${BASE}#/study`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); }],
  ['fresh-add', async (page) => { await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.click('button[aria-label="Add something"]'); await page.waitForTimeout(400); }],
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await ctx.newPage();
for (const [name, act] of SCENES) {
  await act(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (wide > 2) console.log(`${name}: overflows by ${wide}px`);
}
await browser.close();
console.log(`wrote ${SCENES.length} shots to ${OUT}/`);
