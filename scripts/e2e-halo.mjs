// Halo sync end to end against the preview build: postMessage handoff → diff → apply, then the paste path with a removal.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const seed = JSON.parse(fs.readFileSync(new URL('../src/data/seed.json', import.meta.url), 'utf8'));
const chm = seed.courses.find((c) => c.code === 'CHM-113');
const items = seed.items.filter((i) => i.courseId === chm.id && i.type !== 'participation' && i.points > 0).slice(0, 3);
const [A, B, C] = items;
const iso = (s, plusDays = 0) => new Date(new Date(s).getTime() + plusDays * 86400000).toISOString();
const mk = (id, it, extra = {}) => ({
  id, title: it.title, description: '<p>from halo</p>', unit: 'Topic 1', unitSequence: 1, sequence: 1,
  startDate: it.opensAt ? iso(it.opensAt) : null, dueDate: iso(it.dueAt), points: it.points, type: 'ASSIGNMENT', tags: [],
  inPerson: false, isGroupEnabled: false, requiresLopesWrite: false, status: 'ACTIVE', submittedAt: null, score: null, ...extra,
});
const cls = (assessments) => ({ id: 'e2e-chm', slugId: 'e2e-slug', classCode: 'CHM-113-O500', courseCode: 'CHM-113', name: chm.name, startDate: '2026-09-08 07:00:00', endDate: '2026-12-21 06:59:00', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments });
const payload1 = { kind: 'halo-export', version: 1, exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [cls([
  mk('e2e-a', A),
  mk('e2e-b', B, { dueDate: iso(B.dueAt, 2), points: B.points + 5 }),
  mk('e2e-c', C, { status: 'PUBLISHED', submittedAt: iso(C.dueAt, -1), score: Math.max(1, C.points - 1) }),
  mk('e2e-new', { title: 'Halo Only Quiz', opensAt: null, dueAt: iso(A.dueAt, 5), points: 15 }, { type: 'QUIZ' }),
])] };
const payload2 = { ...payload1, exportedAt: new Date().toISOString(), classes: [cls([mk('e2e-a', A), mk('e2e-b', B, { dueDate: iso(B.dueAt, 2), points: B.points + 5 }), mk('e2e-c', C, { status: 'PUBLISHED', submittedAt: iso(C.dueAt, -1), score: C.points - 1 })])] };

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(`${BASE}#/now?halo=1`, { waitUntil: 'networkidle0' });
console.log('banner:', await page.$eval('.halo-banner', (e) => e.textContent.trim()).catch(() => 'none'));

// 1. Handoff path: synthetic message with Halo's origin.
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload1);
await page.waitForSelector('.modal .diff-section', { timeout: 5000 });
const heads = async () => page.$$eval('.diff-section h3', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').replace(/(hide|show|all|none)/g, '').trim()));
console.log('sections:', (await heads()).join(' | '));
console.log('trust:', await page.$eval('.diff-trust', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => 'none'));
console.log('changed row:', await page.$eval('.diff-section:nth-of-type(2) .diff-row', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => 'none'));
await page.screenshot({ path: process.argv[2] ?? 'halo-diff.png', fullPage: false });
// Spoofed origin must be rejected.
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { ...p, exportedAt: 'SPOOF' }, source: window })), payload1);
console.log('spoof ignored:', !(await page.$eval('.modal', (e) => e.textContent.includes('SPOOF'))));
const applyBtn = (await page.$$('.modal .modal-actions .btn.primary'))[0];
console.log('apply label:', await applyBtn.evaluate((e) => e.textContent.trim()));
await applyBtn.click();
await page.waitForFunction(() => document.querySelector('.modal')?.textContent.includes('Applied'), { timeout: 5000 });
console.log('applied:', await page.$eval('.modal .diff-list', (e) => e.textContent.replace(/\s+/g, ' ').trim()));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
let s = await state();
const by = (t) => s.items.find((i) => i.title === t);
console.log('new item:', by('Halo Only Quiz') ? `${by('Halo Only Quiz').source}/${by('Halo Only Quiz').type}/${by('Halo Only Quiz').points}pts` : 'MISSING');
console.log('B moved:', by(B.title).dueAt, 'was', B.dueAt, '| haloId', by(B.title).haloId, '| points', by(B.title).points);
console.log('C done:', by(C.title).status, by(C.title).score, by(C.title).award?.multiplier, '| A linked:', by(A.title).haloId, by(A.title).source);
console.log('course linked:', s.courses.find((c) => c.code === 'CHM-113').haloClassId);
console.log('last sync:', await page.evaluate(() => localStorage.getItem('school-dashboard:halo-last-sync')));
await (await page.$('.modal .modal-actions .btn.primary')).click();

// 2. Paste path from Settings, second export lacks the new item → removal proposed.
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
await page.screenshot({ path: (process.argv[2] ?? 'halo-diff.png').replace(/\.png$/, '-settings.png'), fullPage: true });
await page.screenshot({ path: (process.argv[2] ?? 'halo-diff.png').replace(/\.png$/, '-settings.png'), fullPage: true });
console.log('halo card:', await page.$eval('.halo-steps', (e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)));
console.log('bookmark href ok:', await page.$eval('.halo-drag', (e) => e.getAttribute('href')?.startsWith('javascript:') && decodeURIComponent(e.getAttribute('href')).includes('var D="http://localhost:4173"')));
await page.$$eval('.settings-actions .btn', (els) => els.find((e) => e.textContent.includes('Paste Halo export')).click());
await page.waitForSelector('.halo-paste');
await page.evaluate((json) => { const ta = document.querySelector('.halo-paste'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, json); ta.dispatchEvent(new Event('input', { bubbles: true })); }, JSON.stringify(payload2));
await page.$$eval('.modal .modal-actions .btn', (els) => els.find((e) => e.textContent.includes('Read export')).click());
await page.waitForSelector('.modal .diff-section', { timeout: 5000 });
console.log('sections 2:', (await heads()).join(' | '));
console.log('missing row:', await page.$eval('.diff-section:nth-of-type(4) .diff-row', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => 'none'));
const apply2 = (await page.$$('.modal .modal-actions .btn.primary'))[0];
console.log('apply label 2:', await apply2.evaluate((e) => e.textContent.trim()));
await apply2.click();
await page.waitForFunction(() => document.querySelector('.modal')?.textContent.includes('Applied'), { timeout: 5000 });
s = await state();
console.log('removed:', !s.items.some((i) => i.title === 'Halo Only Quiz'), '| items total', s.items.length, '(seed', seed.items.length + ')');
// Bad paste
await (await page.$('.modal .modal-actions .btn.primary')).click();
await page.$$eval('.settings-actions .btn', (els) => els.find((e) => e.textContent.includes('Paste Halo export')).click());
await page.waitForSelector('.halo-paste');
await page.type('.halo-paste', 'not json');
await page.$$eval('.modal .modal-actions .btn', (els) => els.find((e) => e.textContent.includes('Read export')).click());
console.log('bad paste:', await page.$eval('.modal .hint[style]', (e) => e.textContent.trim()).catch(() => 'no error shown'));
await browser.close();
