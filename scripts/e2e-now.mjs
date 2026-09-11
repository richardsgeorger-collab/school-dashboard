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
console.log('time ask:', await t('.time-ask'));
await page.$$eval('.time-ask .btn', (els) => els.find((e) => e.textContent.trim() === '30m')?.click());
await new Promise((r) => setTimeout(r, 200));
console.log('logged 30m on', first, '→', await page.evaluate((label) => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.label === label)?.actualMinutes, first), '| prompt gone:', !(await page.$('.time-ask')));
console.log('after done (1.9s):', (await t('.hero-title')) ?? (await t('.calm-title')), '| first was:', first);
console.log('footer:', await t('.term-progress .mono'));
// "Not this one" opens a day chooser; picking a day records snooze + start-by on the item.
const heroTitle = await t('.hero-title');
await page.$$eval('.hero-skip', (els) => els[0]?.click());
await new Promise((r) => setTimeout(r, 200));
const opts = await page.$$eval('.hero-snooze .btn', (els) => els.map((e) => e.textContent.trim()));
console.log('snooze options:', opts.join(' | ') || (await t('.hero-snooze')));
await page.screenshot({ path: out.replace(/\.png$/, '-snooze.png'), fullPage: false });
if (opts.length) {
  await page.$$eval('.hero-snooze .btn', (els) => els[0].click());
  await new Promise((r) => setTimeout(r, 300));
  const rec = await page.evaluate((label) => { const s = JSON.parse(localStorage.getItem('school-dashboard:v1')); const it = s.items.find((i) => i.label === label); return it ? { snoozedUntil: it.snoozedUntil, startByOverride: it.startByOverride } : null; }, heroTitle);
  console.log('after pick:', heroTitle, JSON.stringify(rec), '| new hero:', await t('.hero-title'));
}
await browser.close();
