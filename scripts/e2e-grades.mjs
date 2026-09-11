// Grade what-if on the Grades tab: weights, a hypothetical score, and the reverse question.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle0' });
// Score two small CHM-113 items so there is an average to project from.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('school-dashboard:v1'));
  const chm = s.courses.find((c) => c.code === 'CHM-113');
  const mine = s.items.filter((i) => i.courseId === chm.id && i.type !== 'participation' && i.points > 0).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  mine[0].score = mine[0].points * 0.9; mine[0].status = 'done'; mine[0].completedAt = new Date().toISOString();
  mine[1].score = mine[1].points * 0.8; mine[1].status = 'done'; mine[1].completedAt = new Date().toISOString();
  localStorage.setItem('school-dashboard:v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle0' });
console.log('CHM card:', await t('.grade-card:first-child .grade-pct'), '|', await t('.grade-card:first-child .grade-stats'));
await page.$$eval('.grade-card:first-child .btn', (els) => els.find((e) => e.textContent.trim() === 'What if').click());
await page.waitForSelector('.whatif', { timeout: 5000 });
console.log('weights:', await page.$$eval('.whatif-weights li', (els) => els.slice(0, 3).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await page.type('.whatif-block:nth-of-type(2) .whatif-num', '120');
await sleep(200);
console.log('if I score:', await t('.whatif-block:nth-of-type(2) .whatif-out'));
console.log('need for 90:', await t('.whatif-block:nth-of-type(3) .whatif-out'));
await page.$$eval('.whatif-targets .btn', (els) => els.find((e) => e.textContent.trim() === '70%').click());
await sleep(150);
console.log('need for 70:', await t('.whatif-block:nth-of-type(3) .whatif-out'));
await page.select('.whatif-block:nth-of-type(3) select[aria-label="Assumption for the rest"]', 'perfect');
await sleep(150);
console.log('need, rest perfect:', await t('.whatif-block:nth-of-type(3) .whatif-out'));
console.log('scores untouched by what-if:', await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('school-dashboard:v1')); return s.items.filter((i) => i.score !== null).length; }));
await page.screenshot({ path: process.argv[2] ?? 'grades.png', fullPage: false });
await browser.close();
