// Smoke test against the preview build: complete an item, reload, import a PDF through the UI.
import puppeteer from 'puppeteer-core';
const pdf = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const base = 'http://localhost:4173/school-dashboard/';
const text = (sel) => page.$eval(sel, (el) => el.textContent.trim());
const pills = async () => page.$$eval('.status-pill', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

await page.goto(base + '#/home', { waitUntil: 'networkidle0' });
console.log('pills before:', await pills());
const firstTitle = await text('.day-group .item-row .item-title');
await page.click('.day-group .item-row .check');
await new Promise((r) => setTimeout(r, 300));
console.log('completed:', firstTitle, '| row done =', await page.$eval('.day-group .item-row', (el) => el.dataset.done));
console.log('pills after:', await pills());

await page.reload({ waitUntil: 'networkidle0' });
console.log('after reload done pill:', (await pills()).find((p) => p.includes('done')));
const doneRows = await page.$$eval('.item-row[data-done="true"]', (els) => els.length);
console.log('done rows rendered after reload:', doneRows);

await page.goto(base + '#/settings', { waitUntil: 'networkidle0' });
const buttons = await page.$$('button');
for (const b of buttons) if ((await b.evaluate((e) => e.textContent)).includes('Import syllabus')) { await b.click(); break; }
await page.waitForSelector('.dropzone input[type=file]');
const input = await page.$('.dropzone input[type=file]');
await input.uploadFile(pdf);
await page.waitForSelector('.preview', { timeout: 30000 });
console.log('import header:', await text('.modal h3'), '|', await text('.modal .hint.mono'));
const rows = await page.$$eval('.preview tbody tr', (els) => els.length);
console.log('preview rows:', rows);
const modeButtons = await page.$$('.modal .segmented button');
console.log('merge/replace choice shown:', modeButtons.length);
const importBtn = (await page.$$('.modal .btn.primary'))[0];
console.log('import button:', await importBtn.evaluate((e) => e.textContent));
await importBtn.click();
await new Promise((r) => setTimeout(r, 400));
console.log('data summary:', await page.$$eval('.settings-card .hint', (els) => els.map((e) => e.textContent).find((t) => t.includes('classes,'))));
await page.goto(base + '#/home', { waitUntil: 'networkidle0' });
console.log('pills after import:', await pills());
await browser.close();
