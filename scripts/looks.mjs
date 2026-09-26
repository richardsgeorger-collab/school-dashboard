// Screenshots of the three visual directions on the Now screen: docs/screens/looks/<look>-<laptop|phone>.png
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/looks';
mkdirSync(OUT, { recursive: true });
const LOOKS = ['ink', 'paper', 'pop'];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [size, device] of [['laptop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
  for (const look of LOOKS) {
    for (const scheme of look === 'ink' ? ['dark'] : ['light', 'dark']) {
      const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
      await page.evaluate((s) => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.theme = s; d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }, scheme);
      await page.goto(`${BASE}#/looks?d=${look}`, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${look}-${scheme}-${size}.png`, fullPage: false });
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`wrote screenshots to ${OUT}/`);
