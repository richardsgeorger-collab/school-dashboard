// Reads the numbers each screen shows for the same days, so cross-screen disagreements are visible, not inferred.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const tab = async (label) => { await page.$$eval('button', (els, label) => els.find((e) => e.textContent.trim() === label)?.click(), label); await new Promise((r) => setTimeout(r, 300)); };

await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
console.log('NOW status      :', await t('.now-status'));
console.log('NOW then heads  :', (await all('.then-day')).join(' || '));
const allBtn = await page.$('.then-all');
if (allBtn) {
  await allBtn.evaluate((e) => e.click());
  await page.waitForSelector('.modal', { timeout: 3000 });
  console.log('NOW "all" sheet :', await t('.modal .modal-head h2'), '→', (await all('.modal .section-title')).join(' / '));
  await page.keyboard.press('Escape');
}

await page.goto(`${BASE}#/calendar`, { waitUntil: 'networkidle0' });
console.log('CAL focus pills :', (await all('.status-pill')).join(' | '));
await tab('Week');
const rows = await page.$$eval('.week-row', (els) => els.map((e) => `${e.querySelector('.week-row-date b')?.textContent.trim()} ${e.querySelector('.week-row-date .mono')?.textContent.trim()}: ${e.querySelectorAll('.week-item').length ? e.querySelectorAll('.week-item').length + ' shown' : (e.querySelector('.week-count')?.textContent.replace(/\s+/g, ' ').trim() ?? '—')}`));
console.log('CAL week rows   :', rows.join(' || '));
await tab('Month');
const cells = await page.$$eval('.month-grid button', (els) => els.map((e) => e.getAttribute('aria-label')).filter((l) => l && !/, 0 open/.test(l)).slice(0, 10));
console.log('CAL month cells :', cells.join(' || '));
await tab('Agenda');
console.log('CAL agenda heads:', (await all('.day-group-head')).slice(0, 6).join(' || '));
await browser.close();
