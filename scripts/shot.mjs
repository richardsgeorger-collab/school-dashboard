// Screenshot a route of the preview build with real device emulation.
// usage: node scripts/shot.mjs <route> <width> <out.png> [height] [dark|light]
import puppeteer from 'puppeteer-core';

const [route = '#/home', width = '390', out = 'shot.png', height = '844', theme = 'light'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
await page.setViewport({ width: Number(width), height: Number(height), deviceScaleFactor: 2, isMobile: Number(width) < 700, hasTouch: Number(width) < 700 });
await page.goto(`${process.env.BASE ?? 'http://localhost:4173/school-dashboard/'}${route}`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const sw = await page.evaluate(() => `${document.documentElement.clientWidth}/${document.documentElement.scrollWidth}`);
await page.screenshot({ path: out, fullPage: true });
console.log(`saved ${out} (client/scroll width ${sw})`);
await browser.close();
