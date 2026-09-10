// Check-off feedback and anti-farming: complete, undo, redo; XP must not double.
import puppeteer from 'puppeteer-core';
const out = process.argv[2] ?? 'burst.png';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const xp = async () => {
  await page.goto('http://localhost:4173/school-dashboard/#/plan', { waitUntil: 'networkidle0' });
  const v = await page.$eval('.progress-xp .mono', (el) => el.textContent.trim());
  await page.goto('http://localhost:4173/school-dashboard/#/calendar?v=agenda', { waitUntil: 'networkidle0' });
  return v;
};
await page.goto('http://localhost:4173/school-dashboard/#/calendar?v=agenda', { waitUntil: 'networkidle0' });
console.log('start:', await xp());
await page.click('.day-group .item-row .check');
await new Promise((r) => setTimeout(r, 250));
const burst = await page.$eval('.xp-float', (el) => el.textContent).catch(() => 'none');
console.log('burst shown:', burst);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 390, height: 700 } });
await new Promise((r) => setTimeout(r, 900));
console.log('after done:', await xp());
await page.click('.day-group .item-row .check'); // undo
await new Promise((r) => setTimeout(r, 200));
console.log('after undo:', await xp());
await page.click('.day-group .item-row .check'); // redo
await new Promise((r) => setTimeout(r, 200));
console.log('after redo:', await xp());
await page.goto('http://localhost:4173/school-dashboard/#/plan', { waitUntil: 'networkidle0' });
console.log('plan streak:', await page.$eval('.streaks', (el) => el.textContent.replace(/\s+/g, ' ').trim()));
await browser.close();
