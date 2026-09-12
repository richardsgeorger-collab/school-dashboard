// Class management in Settings: edit meetings and instructor, mark online, reset one class's items, delete a class, grades totals.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const openClass = async (code) => {
  await page.$$eval('.course-row', (els, code) => els.find((e) => e.textContent.includes(code)).click(), code);
  await page.waitForSelector('.modal form', { timeout: 5000 });
};
const clickBtn = (text) => page.$$eval('.modal .btn', (els, text) => { const el = els.find((e) => e.textContent.trim().startsWith(text)); if (!el) throw new Error('no ' + text); el.click(); }, text);

await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
// Seed some history: one ENG item done with an award and a timing; one CHM item done with a timing.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('school-dashboard:v1'));
  const by = (code) => s.courses.find((c) => c.code === code).id;
  const eng = s.items.filter((i) => i.courseId === by('ENG-105') && i.points > 0);
  const chm = s.items.filter((i) => i.courseId === by('CHM-113') && i.points > 0);
  for (const it of [eng[0], chm[0]]) { it.status = 'done'; it.completedAt = new Date().toISOString(); it.award = { base: it.points, multiplier: 1.5, earnedAt: it.completedAt, scoreFactor: null }; it.actualMinutes = 40; it.notes = 'keep me'; }
  localStorage.setItem('school-dashboard:v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle0' });
const xpBefore = await page.evaluate(() => document.querySelector('.topbar')?.textContent && null);
let s = await state();
const chmDoneBefore = s.items.filter((i) => i.courseId === s.courses.find((c) => c.code === 'CHM-113').id && i.status === 'done').map((i) => i.id);
console.log('seeded: ENG done', s.items.filter((i) => i.courseId === s.courses.find((c) => c.code === 'ENG-105').id && i.status === 'done').length, '| CHM done', chmDoneBefore.length);

// 1. ESG-162: Mon/Wed, new instructor.
await openClass('ESG-162');
console.log('editor:', await t('.modal .modal-head h2'), '| meetings:', await page.$$eval('.meeting-edit select', (els) => els.map((e) => e.selectedOptions[0].textContent).join('/')));
await page.$$eval('.meeting-edit select[aria-label="Day"]', (els) => { const fire = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }; fire(els[0], '1'); fire(els[1], '3'); });
await page.$$eval('.meeting-edit input[aria-label="Instructor name"]', (els) => els.forEach((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'New Instructor'); el.dispatchEvent(new Event('input', { bubbles: true })); }));
await clickBtn('Save class');
await sleep(300);
s = await state();
const esg = s.courses.find((c) => c.code === 'ESG-162');
console.log('ESG after save: days', esg.meetings.map((m) => m.day).join(','), '| instructors', esg.instructors.map((p) => p.name).join(';'));

// 2. ENG-105: online.
await openClass('ENG-105');
await page.$eval('.modal input[type=checkbox]', (el) => { if (!el.checked) el.click(); });
await sleep(100);
console.log('online: meetings editor hidden', !(await page.$('.meeting-edit select[aria-label="Day"]')));
await clickBtn('Save class');
await sleep(300);
s = await state();
const eng = s.courses.find((c) => c.code === 'ENG-105');
const engItems = s.items.filter((i) => i.courseId === eng.id);
console.log('ENG after save: online', eng.online, '| meetings', eng.meetings.length, '| in-class items left', engItems.filter((i) => i.flags.inClass).length, 'of', engItems.length);

// 3. Reset ENG-105 items; XP, timings, and CHM history must survive.
await page.goto(`${BASE}#/plan`, { waitUntil: 'networkidle0' });
const xp1 = await t('.level-bar, .levelbar, [class*="level"]');
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
await openClass('ENG-105');
console.log('admin text:', await t('.class-admin .hint'));
await clickBtn('Reset items');
await sleep(100);
console.log('confirm label:', await page.$$eval('.modal .btn.danger', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
await clickBtn('Yes, delete');
await sleep(400);
console.log('after reset note:', await t('.class-admin .hint:last-of-type'));
s = await state();
const engLeft = s.items.filter((i) => i.courseId === eng.id).length;
const chmDoneAfter = s.items.filter((i) => chmDoneBefore.includes(i.id) && i.status === 'done' && i.notes === 'keep me' && i.actualMinutes === 40).length;
console.log('ENG items left:', engLeft, '| CHM done intact:', chmDoneAfter, '/', chmDoneBefore.length, '| banked awards:', (s.settings.bankedAwards ?? []).length, '| ledger:', (s.settings.timings ?? []).map((x) => `${x.minutes}m`).join(','), '| total items', s.items.length);
await page.keyboard.press('Escape');
await page.goto(`${BASE}#/plan`, { waitUntil: 'networkidle0' });
console.log('XP text before/after:', xp1, '→', await t('.level-bar, .levelbar, [class*="level"]'));

// 4. Delete UNV-106 entirely; nothing else moves.
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
const before = await state();
await openClass('UNV-106');
await clickBtn('Delete class');
await sleep(100);
console.log('delete confirm:', await page.$$eval('.modal .btn.danger', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
await clickBtn('Yes, delete UNV-106');
await sleep(400);
s = await state();
const unv = before.courses.find((c) => c.code === 'UNV-106');
console.log('UNV gone:', !s.courses.some((c) => c.id === unv.id), '| its items gone:', !s.items.some((i) => i.courseId === unv.id), '| other items unchanged:', s.items.length === before.items.filter((i) => i.courseId !== unv.id).length, '| classes:', s.courses.map((c) => c.code).join(','));
await page.screenshot({ path: process.argv[2] ?? 'classes.png', fullPage: false });

// 5. Grades: no placeholder totals.
await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle0' });
console.log('grades cards:', await page.$$eval('.grade-card', (els) => els.map((e) => (e.querySelector('.grade-empty') ?? e.querySelector('.grade-stats')).textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
await browser.close();
