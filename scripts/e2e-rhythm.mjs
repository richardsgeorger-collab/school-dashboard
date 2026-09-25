// Pace line in place of pressure, welcome back after days away, the Sunday review from Settings, the weak line on Grades,
// and the study block on an item, all against the preview build.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'rhythm.png').replace(/\.png$/, '');
const dir = out.slice(0, out.lastIndexOf('/') + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const setState = (s) => page.evaluate((v) => localStorage.setItem('school-dashboard:v1', JSON.stringify(v)), s);

// 1. Pace line replaces the pressure line.
await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.term-progress', { timeout: 5000 });
console.log('pace:', await t('.pace'), '| pressure present:', !!(await page.$('.pressure')));
console.log('now lines: hero', !!(await page.$('.hero')), '| pace', !!(await page.$('.pace')), '| progress', !!(await page.$('.term-progress')), '| verify', !!(await page.$('.verify')));
await page.screenshot({ path: `${out}-now.png`, fullPage: false });

// 2. Welcome back after six days away.
const sixAgo = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
await page.evaluate((d) => localStorage.setItem('school-dashboard:last-seen', d), sixAgo);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.welcome', { timeout: 8000 });
console.log('welcome:', await t('.welcome .calm-title'), '|', await t('.welcome .calm-text'), '| first:', await t('.welcome-first'), '| missed rows:', await page.$$eval('.welcome-list .item-row, .welcome-list li', (els) => els.length));
console.log('hidden behind it: hero', !!(await page.$('.hero')), '| next class', !!(await page.$('.next-class')), '| pace', !!(await page.$('.pace')), '| progress still there', !!(await page.$('.term-progress')));
await page.screenshot({ path: `${out}-welcome.png`, fullPage: false });
await page.$eval('.welcome .calm-more', (el) => el.click());
await sleep(200);
console.log('after show everything: welcome', !!(await page.$('.welcome')), '| hero or calm', !!(await page.$('.hero, .calm')), '| pace', !!(await page.$('.pace')), '| last seen stamped today:', await page.evaluate(() => localStorage.getItem('school-dashboard:last-seen') === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' })));

// 3. Sunday review from Settings, any day.
await page.goto(`${BASE}#/you`, { waitUntil: 'networkidle0' });
console.log('sunday row:', await t('.sunday-settings'));
await page.$$eval('.sunday-settings .btn', (els) => els.find((e) => e.textContent.includes('Review the week')).click());
await page.waitForSelector('.sunday', { timeout: 5000 });
console.log('sentence:', await t('.sunday-sentence'));
console.log('sections:', await page.$$eval('.sunday .section-title', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await page.screenshot({ path: `${out}-sunday.png`, fullPage: false });
const slippedBefore = await page.$$eval('.sunday-slipped .sunday-row', (els) => els.length);
if (slippedBefore > 0) {
  const label = await page.$eval('.sunday-slipped .sunday-row', (e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40));
  await page.$$eval('.sunday-slipped .sunday-row:first-child .sunday-actions .btn', (els) => els.find((e) => e.textContent.includes('Push')).click());
  await sleep(200);
  const s = await state();
  const tomorrow = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); });
  console.log('pushed:', label, '→', s.items.some((i) => i.snoozedUntil === tomorrow && i.startByOverride === tomorrow), '| button now:', await t('.sunday-slipped .sunday-row:first-child .sunday-actions .btn:last-child'));
}
await page.$$eval('.sunday .modal-actions .btn', (els) => els.find((e) => e.textContent.includes('my week')).click());
await sleep(200);
let s = await state();
console.log('finished:', JSON.stringify(s.settings.sundayReview), '| row:', await t('.sunday-settings'));
await page.$$eval('.sunday-settings .btn', (els) => els.find((e) => e.textContent.includes('Turn off')).click());
await sleep(150);
console.log('turned off:', await t('.sunday-settings'));
await page.$$eval('.sunday-settings .btn', (els) => els.find((e) => e.textContent.includes('Turn on')).click());
await sleep(150);
s = await state();
console.log('turned on:', s.settings.sundayReview.off, s.settings.sundayReview.skips);

// 4. Grades: a low score brings one calm line and a Quiz me link.
s = await state();
const chm = s.courses.find((c) => c.code === 'CHM-113');
const quiz = s.items.filter((i) => i.courseId === chm.id && i.type === 'quiz').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
s.items = s.items.map((i) => (i.id === quiz.id ? { ...i, status: 'done', completedAt: new Date().toISOString(), score: Math.round(quiz.points * 0.6), scoreSource: 'halo' } : i));
await setState(s);
await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.grade-card', { timeout: 5000 });
const weak = await page.$$eval('.grade-weak', (els) => els.map((e) => [e.textContent.replace(/\s+/g, ' ').trim(), e.querySelector('a')?.getAttribute('href')]));
console.log('weak lines:', JSON.stringify(weak));
console.log('score source shown:', await page.evaluate(() => { document.querySelector('.grade-card .settings-actions .btn').click(); return true; }) && (await sleep(150), await t('.score-list .score-cell .hint')));
await page.screenshot({ path: `${out}-grades.png`, fullPage: false });

// 5. Study block on an item: syllabus on file for CHM-113, then open a Chem item from Plan.
const syl = `${dir}CHM113_syllabus.txt`;
fs.writeFileSync(syl, 'CHM-113 General Chemistry I\n\nThe prerequisite concept assignment reviews high-school chemistry and is due the first week.\n\nPractice quizzes cover the topic of the week and are open for three days.\n\nLate work loses ten percent a day.\n' + 'Attendance is expected. '.repeat(10));
await page.goto(`${BASE}#/library?c=${chm.id}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.lib-drop input[type=file]', { timeout: 5000 });
await (await page.$('.lib-drop input[type=file]')).uploadFile(syl);
await page.waitForFunction(() => [...document.querySelectorAll('.lib-notes li')].some((li) => /syllabus/i.test(li.textContent)), { timeout: 30000 });
s = await state();
const hw = s.items.filter((i) => i.courseId === chm.id && i.status === 'todo' && /Prerequisite|Homework|ALEKS/i.test(i.title)).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
s.items = s.items.map((i) => (i.id === hw.id ? { ...i, status: 'in_progress' } : i));
await setState(s);
await page.goto(`${BASE}#/load`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.item-row', { timeout: 5000 });
const opened = await page.evaluate((id) => { const row = [...document.querySelectorAll('.item-row')].find((r) => r.querySelector('.item-main')?.getAttribute('title') === id); if (!row) return null; row.querySelector('.item-main').click(); return row.querySelector('.item-title').textContent; }, hw.title);
await page.waitForSelector('.modal', { timeout: 5000 });
await sleep(600);
console.log('opened:', opened, '| modal title:', await t('.modal h2, .modal .modal-title'), '| study present:', !!(await page.$('.modal .study')));
if (!(await page.$('.modal .study'))) console.log('modal text:', (await t('.modal')).slice(0, 400));
console.log('study block for', opened, ':', await t('.modal .study'), '| quiz href:', await page.$eval('.modal .study a[href^="#/quiz"]', (e) => e.getAttribute('href')).catch(() => null));
await page.screenshot({ path: `${out}-study.png`, fullPage: false });
await browser.close();
