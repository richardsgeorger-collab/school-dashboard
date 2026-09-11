// Exam mode: with an exam four days out, Now reshapes to the exam hero and a study plan; logging study shrinks it; Done reverts it.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
console.log('before:', await t('.hero-eyebrow'), '|', await t('.hero-title'));
// Move the first CHM-113 exam to four days from now at 7:00 AM.
const moved = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('school-dashboard:v1'));
  const chm = s.courses.find((c) => c.code === 'CHM-113');
  const ex = s.items.filter((i) => i.courseId === chm.id && i.type === 'exam' && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const d = new Date(); d.setDate(d.getDate() + 4);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  ex.dueAt = `${day}T07:00:00-07:00`;
  localStorage.setItem('school-dashboard:v1', JSON.stringify(s));
  return { label: ex.label, day, est: ex.estimatedMinutes };
});
console.log('exam moved:', JSON.stringify(moved));
await page.reload({ waitUntil: 'networkidle0' });
console.log('exam hero:', await t('.hero-exam .hero-eyebrow'), '|', await t('.hero-exam .hero-title'), '|', await t('.hero-exam .hero-meta'));
console.log('why:', await t('.hero-exam .hero-why'));
console.log('sessions:', await page.$$eval('.exam-session', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
console.log('pressure:', await t('.pressure'));
console.log('normal then section absent:', !(await page.$('.then-group')), '| calm absent:', !(await page.$('.calm')));
await page.screenshot({ path: process.argv[2] ?? 'exam.png', fullPage: false });
const logBtn = await page.$('.exam-session .btn');
if (logBtn) await logBtn.evaluate((e) => e.click());
else {
  await page.$$eval('.hero-exam .hero-skip', (els) => els[0]?.click());
  await sleep(150);
  await page.$$eval('.hero-exam .hero-snooze .btn', (els) => els.find((e) => e.textContent.trim() === '1h')?.click());
}
{
  await sleep(300);
  console.log('after log:', await t('.hero-exam .hero-meta'), '| sessions:', await page.$$eval('.exam-session', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
}
if (await page.$('.pressure-link')) {
  await page.click('.pressure-link');
  await sleep(300);
  console.log('before-exam sheet rows:', await page.$$eval('.modal .item-list > *', (els) => els.length));
  await page.keyboard.press('Escape');
}
await page.$$eval('.hero-exam .btn', (els) => els.find((e) => e.textContent.includes('Done')).click());
await sleep(2200);
console.log('after done:', (await t('.hero-exam .hero-title')) ?? 'exam hero gone', '| normal hero:', await t('.hero:not(.hero-exam) .hero-title'), '| time ask:', !!(await page.$('.time-ask')));
await browser.close();
