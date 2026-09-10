// Smoke test against the preview build: complete an item on the agenda, reload, import a PDF through the UI.
import puppeteer from 'puppeteer-core';
const pdf = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const base = 'http://localhost:4173/school-dashboard/';
const text = (sel) => page.$eval(sel, (el) => el.textContent.trim());

await page.goto(base, { waitUntil: 'networkidle0' });
console.log('default route hero:', await text('.hero-title'), '| then rows:', await page.$$eval('.then-row', (els) => els.length), '| pressure:', await page.$('.pressure') ? await text('.pressure') : 'none');

await page.goto(base + '#/calendar?v=agenda', { waitUntil: 'networkidle0' });
const firstLabel = await text('.day-group .item-row .item-title');
await page.click('.day-group .item-row .check');
await new Promise((r) => setTimeout(r, 300));
console.log('completed:', firstLabel, '| row done =', await page.$eval('.day-group .item-row', (el) => el.dataset.done));
await page.reload({ waitUntil: 'networkidle0' });
console.log('done rows after reload:', await page.$$eval('.item-row[data-done="true"]', (els) => els.length));

await page.goto(base + '#/settings', { waitUntil: 'networkidle0' });
for (const b of await page.$$('button')) if ((await b.evaluate((e) => e.textContent)).includes('Import syllabus')) { await b.click(); break; }
await page.waitForSelector('.dropzone input[type=file]');
await (await page.$('.dropzone input[type=file]')).uploadFile(pdf);
await page.waitForSelector('.preview', { timeout: 30000 });
console.log('import header:', await text('.modal h3'), '|', await text('.modal .hint.mono'));
console.log('preview rows:', await page.$$eval('.preview tbody tr', (els) => els.length), '| first label:', await text('.preview tbody tr .preview-title'));
const importBtn = (await page.$$('.modal .btn.primary'))[0];
console.log('import button:', await importBtn.evaluate((e) => e.textContent));
await importBtn.click();
await new Promise((r) => setTimeout(r, 400));
console.log('data summary:', await page.$$eval('.settings-card .hint', (els) => els.map((e) => e.textContent).find((t) => t.includes('classes,'))));
await page.goto(base + '#/calendar?v=agenda', { waitUntil: 'networkidle0' });
console.log('done rows after merge import:', await page.$$eval('.item-row[data-done="true"]', (els) => els.length));
await browser.close();
