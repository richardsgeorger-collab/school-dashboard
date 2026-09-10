// Now screen: hero Done advances the queue without reload; counts agree; tags present.
import puppeteer from 'puppeteer-core';
const out = process.argv[2] ?? 'now.png';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://localhost:4173/school-dashboard/', { waitUntil: 'networkidle0' });
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
console.log('status:', await t('.now-status'));
console.log('next class:', await t('.nextclass-text'));
console.log('hero:', await t('.hero-title'), '| why:', await t('.hero-why'), '| source:', await t('.hero-source'));
console.log('then heads:', await page.$$eval('.then-day', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
await page.screenshot({ path: out, fullPage: true });
const first = await t('.hero-title');
for (const b of await page.$$('.hero .btn')) if ((await b.evaluate((e) => e.textContent)).includes('Done')) { await b.click(); break; }
await new Promise((r) => setTimeout(r, 400));
console.log('after done (0.4s):', (await t('.hero-title')) ?? (await t('.calm-title')), '| calm:', await t('.calm-text'));
await new Promise((r) => setTimeout(r, 1500));
console.log('after done (1.9s):', (await t('.hero-title')) ?? (await t('.calm-title')), '| first was:', first);
console.log('footer:', await t('.term-progress .mono'));
await browser.close();
