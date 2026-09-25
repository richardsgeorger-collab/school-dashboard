// Phone-width screenshots of the landing, privacy and terms pages against a running preview (npm run preview).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = process.env.OUT ?? '/tmp/landing';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const [name, path] of [['landing', 'landing/'], ['privacy', 'privacy.html'], ['terms', 'terms.html']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name, ':', await page.title(), '|', await page.evaluate(() => document.body.innerText.split(/\s+/).length), 'words |', await page.evaluate(() => document.documentElement.scrollWidth), 'px wide');
}
await browser.close();
