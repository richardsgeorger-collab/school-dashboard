// The .ics path end to end: build an export from the seed, upload it, confirm the class mapping, review the diff, apply,
// then re-import a stale export without one item. A done item must stay done with its award intact.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'ics.png').replace(/\.png$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seed = JSON.parse(fs.readFileSync(new URL('../src/data/seed.json', import.meta.url), 'utf8'));
const chm = seed.courses.find((c) => c.code === 'CHM-113');
const esg = seed.courses.find((c) => c.code === 'ESG-162');
const items = seed.items.filter((i) => i.courseId === chm.id && i.type !== 'participation' && i.points > 0).slice(0, 3);
const [A, B, C] = items;
const esgItem = seed.items.find((i) => i.courseId === esg.id && i.type !== 'participation' && i.points > 0);
const wall = (iso, plusDays = 0) => {
  const [d, t] = iso.slice(0, 19).split('T');
  const day = new Date(`${d}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + plusDays);
  return `${day.toISOString().slice(0, 10).replace(/-/g, '')}T${t.replace(/:/g, '')}`;
};
const stampOf = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const ev = (uid, code, title, location, dueIso, points, plusDays = 0) => [
  'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stampOf(4)}`, `DTSTART:${wall(dueIso, plusDays).replace(/(\d{2})(\d{2})$/, (m, a) => `${String(Number(a) - 15).padStart(2, '0')}00`)}`, `DTEND:${wall(dueIso, plusDays)}`,
  `SUMMARY:${code} ${title}`, `LOCATION:${location}`, `DESCRIPTION:Points: ${points}\\nType: Assignment`, `URL:https://halo.gcu.edu/courses/x/assessments/${uid}`, 'END:VEVENT',
];
const ics = (daysAgo, withNew) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BetterHalo//EN',
  ...ev('e2e-a', 'CHM113', A.title, chm.name, A.dueAt, A.points),
  ...ev('e2e-b', 'CHM113', B.title, chm.name, B.dueAt, B.points + 5, 2),
  ...ev('e2e-c', 'CHM113', C.title, chm.name, C.dueAt, C.points, 1),
  ...(withNew ? ev('e2e-new', 'CHM113', 'Halo Only Reading', chm.name, A.dueAt, 15, 5) : []),
  ...ev('e2e-esg', 'ESG162', esgItem.title, esg.name, esgItem.dueAt, esgItem.points),
  'END:VCALENDAR'].join('\r\n').replace(new RegExp(stampOf(4).slice(0, 8), 'g'), stampOf(daysAgo).slice(0, 8));
const dir = path.dirname(out);
const f1 = path.join(dir, 'e2e-fresh.ics');
const f2 = path.join(dir, 'e2e-stale.ics');
fs.writeFileSync(f1, ics(4, true));
fs.writeFileSync(f2, ics(12, false));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const heads = () => page.$$eval('.diff-section h3', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').replace(/(hide|show|all|none)/g, '').trim()));
const click = (sel, text) => page.$$eval(sel, (els, text) => { const el = els.find((e) => e.textContent.includes(text)); if (!el) throw new Error('no ' + text); el.click(); }, text);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));

await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
// C is done before the import; the import must leave that alone.
await page.evaluate((id) => { const s = JSON.parse(localStorage.getItem('school-dashboard:v1')); const it = s.items.find((i) => i.id === id); it.status = 'done'; it.completedAt = new Date().toISOString(); it.score = 8; it.award = { base: it.points, multiplier: 1.5, earnedAt: it.completedAt, scoreFactor: 0.8 }; it.notes = 'kept'; localStorage.setItem('school-dashboard:v1', JSON.stringify(s)); }, C.id);
await page.reload({ waitUntil: 'networkidle0' });

await page.click('.topbar-sync');
await page.waitForSelector('.sync-drop', { timeout: 5000 });
console.log('drop zone:', await t('.sync-drop'));
const input = await page.$('input[type=file]');
await input.uploadFile(f1);
await page.waitForSelector('.sync-map', { timeout: 5000 });
console.log('stale line:', await t('.stale'));
const rows = await page.$$eval('.sync-map tbody tr', (trs) => trs.map((tr) => `${tr.querySelector('td div').textContent.trim()} → ${tr.querySelector('select').selectedOptions[0].textContent.trim()}`));
console.log('mapping:', rows.join(' || '));
await click('.modal .modal-actions .btn', 'Continue');
await page.waitForSelector('.diff-section', { timeout: 5000 });
console.log('sections:', (await heads()).join(' | '));
console.log('trust:', await page.$eval('.diff-zone', (e) => e.textContent.replace(/\s+/g, ' ').trim()));
console.log('changed rows:', await page.$$eval('.diff-section:nth-of-type(2) .diff-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
await page.screenshot({ path: `${out}-diff.png`, fullPage: false });
await click('.modal .modal-actions .btn.primary', 'Apply');
await page.waitForFunction(() => document.querySelector('.modal')?.textContent.includes('Applied'), { timeout: 5000 });
console.log('applied:', await t('.modal .diff-list'));
await click('.modal .modal-actions .btn.primary', 'Close');
let s = await state();
const by = (id) => s.items.find((i) => i.id === id);
const added = s.items.find((i) => i.title === 'Halo Only Reading');
console.log('new item:', added ? `${added.source} · ${added.points} pts · url ${!!added.url} · uid ${added.icsUid}` : 'MISSING');
console.log('B moved:', by(B.id).dueAt, 'was', B.dueAt, '| points', by(B.id).points, '| source', by(B.id).source, '| uid', by(B.id).icsUid);
console.log('C untouched:', by(C.id).status, '| award', JSON.stringify(by(C.id).award), '| score', by(C.id).score, '| notes', by(C.id).notes, '| moved to', by(C.id).dueAt);
console.log('settings:', JSON.stringify({ map: s.settings.icsClassMap, syncedAt: !!s.settings.syncedAt, stamp: s.settings.syncStamp }));
console.log('now footer:', await t('.term-progress .mono'));

// Second import: stale, and without the new item. Mapping is remembered, so it goes straight to the diff.
await page.click('.topbar-sync');
await page.waitForSelector('.sync-drop', { timeout: 5000 });
await (await page.$('input[type=file]')).uploadFile(f2);
await page.waitForSelector('.diff-section', { timeout: 5000 });
console.log('second: stale', await page.$eval('.stale', (e) => e.dataset.level + ' · ' + e.textContent.trim()));
console.log('second: sections', (await heads()).join(' | '));
console.log('second: missing row', await t('.diff-section:nth-of-type(3) .diff-row'));
await page.screenshot({ path: `${out}-stale.png`, fullPage: false });
await click('.modal .modal-actions .btn', 'Cancel');

// Staleness on Now when the last sync is old.
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('school-dashboard:v1')); s.settings.syncedAt = new Date(Date.now() - 12 * 86_400_000).toISOString(); localStorage.setItem('school-dashboard:v1', JSON.stringify(s)); });
await page.reload({ waitUntil: 'networkidle0' });
console.log('now footer stale:', await t('.term-progress .mono'));
await page.screenshot({ path: `${out}-now.png`, fullPage: false });
await browser.close();
