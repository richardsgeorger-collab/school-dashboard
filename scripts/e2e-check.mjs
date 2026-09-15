// Check Halo, one class at a time: the button shows the class list; picking one copies that class's prompt and opens Halo;
// the next press opens the paste box for it; coverage decides clean vs partial; Now names the weakest class; Settings keeps
// per-class history and the editable prompt.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(new URL(BASE).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const setText = (sel, v) => page.$eval(sel, (el, val) => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const closeHaloTabs = async () => {
  for (const tg of browser.targets()) if (tg.url().includes('halo.gcu.edu')) { const p = await tg.page(); if (p) await p.close(); }
  await page.bringToFront();
  await sleep(300);
};
const opened = [];
browser.on('targetcreated', (tg) => opened.push(tg.url()));

// 1. First press: the class list, weakest first, nothing copied yet.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.halo-pick', { timeout: 5000 });
console.log('picker rows:', await page.$$eval('.halo-pick-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
console.log('tabs opened before picking:', opened.filter((u) => u.includes('halo.gcu.edu')).length);
await page.$$eval('.halo-pick-row', (els) => els.find((e) => e.textContent.includes('CHM-113')).click());
await sleep(800);
console.log('hint:', await t('.halo-banner'));
console.log('opened tab:', opened.find((u) => u.includes('halo.gcu.edu')) ?? 'none');
await closeHaloTabs();
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log('clipboard starts:', JSON.stringify(clip.slice(0, 40)), '| class line:', clip.split('\n').find((l) => l.startsWith('CLASS TO AUDIT:')), '| chm lines:', clip.split('\n').filter((l) => /^CHM-113 \|/.test(l)).length, '| other classes:', clip.split('\n').filter((l) => /^(ESG|ENG|UNV)-\d+ \|/.test(l)).length, '| slots left:', /\[(CLASS|DATE|PLANNER DUMP FOR THAT CLASS)\]/.test(clip));
console.log('pending:', await page.evaluate(() => localStorage.getItem('school-dashboard:halo-check')));

// 2. Second press: the paste box for that class. Full coverage plus findings → review, recorded as verified with findings.
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
console.log('paste title:', await t('.modal h2'));
const s0 = await state();
const chm = s0.courses.find((c) => c.code === 'CHM-113');
const quiz = s0.items.filter((i) => i.courseId === chm.id && i.type === 'quiz' && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
const full = [
  'COVERAGE PLAN — 4 pages',
  '- Topic 1', '- Topic 2', '- Gradebook', '- Announcements',
  'VISITED — Topic 1 — 3 items found',
  `CHM-113 | ${quiz.title} | changed | 2026-10-02 23:59 | was ${quiz.dueAt.slice(0, 10)}`,
  'VISITED — Topic 2 — 2 items found',
  'CHM-113 | Lab Safety Rubric | rubric | 2026-10-05 23:59 | found in Lab1_Rubric.pdf',
  'VISITED — Gradebook — 1 items found',
  'CHM-113 | Section 2.4 Worksheet | new | 2026-09-30 08:00 | 15 pts',
  'VISITED — Announcements — 0 items found',
  'this line means nothing',
  'COVERAGE — visited 4 of 4 pages',
  'END OF FINDINGS — 3 items',
].join('\n');
await setText('.modal textarea', full);
await sleep(200);
console.log('read line:', await t('.modal .hint.mono'));
console.log('coverage:', await t('.halo-coverage'), '| partial:', await page.$eval('.halo-coverage', (e) => e.dataset.partial));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await page.waitForSelector('.rev-mention', { timeout: 5000 });
console.log('review groups:', await page.$$eval('.rev-group-title', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
console.log('review rows:', await page.$$eval('.rev-mention', (els) => els.map((e) => `${e.querySelector('.rev-badge').textContent} ${e.querySelector('.chip')?.textContent.trim() ?? '?'}: ${e.querySelector('.rev-proposal').textContent.replace(/\s+/g, ' ').trim().slice(0, 70)}`).join(' || ')));
await page.screenshot({ path: process.argv[2] ?? 'check.png', fullPage: false });
await page.$$eval('.rev-mention:first-child .rev-actions .btn', (els) => els[0].click());
await sleep(300);
const after = await page.evaluate((id) => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.id === id).dueAt, quiz.id);
console.log('after approve:', quiz.title, quiz.dueAt, '→', after);
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(200);
let s = await state();
console.log('pending cleared:', await page.evaluate(() => localStorage.getItem('school-dashboard:halo-check')) === null, '| recorded:', JSON.stringify(s.settings.haloChecks.at(-1), ['courseId', 'clean', 'partial', 'findings', 'coverage', 'visited', 'planned', 'skipped']).replace(chm.id, 'CHM'));
console.log('verify line:', await t('.verify'), '|', await page.$eval('.verify', (e) => e.dataset.level));

// 3. A second class with short coverage and ALL MATCH → recorded partial, never clean.
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.halo-pick', { timeout: 5000 });
await page.$$eval('.halo-pick-row', (els) => els.find((e) => e.textContent.includes('ESG-162')).click());
await sleep(500);
await closeHaloTabs();
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
console.log('paste title 2:', await t('.modal h2'));
await setText('.modal textarea', 'COVERAGE PLAN — 4 pages\nVISITED — Topic 1 — 2 items found\nVISITED — Topic 2 — 1 items found\nVISITED — Gradebook — 0 items found\nCOVERAGE — visited 3 of 4 pages\nSkipped: Announcements — page would not load\nALL MATCH');
await sleep(200);
console.log('coverage 2:', await t('.halo-coverage'), '| skipped:', await page.$$eval('.halo-skipped li', (els) => els.map((e) => e.textContent.trim()).join(' | ')), '| button:', await t('.modal .btn.primary'));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await sleep(300);
s = await state();
const esg = s.courses.find((c) => c.code === 'ESG-162');
console.log('hint 2:', await t('.halo-banner'));
console.log('recorded 2:', JSON.stringify(s.settings.haloChecks.at(-1), ['courseId', 'clean', 'partial', 'findings', 'coverage', 'visited', 'planned', 'skipped']).replace(esg.id, 'ESG'));
console.log('verify line 2:', await t('.verify'), '|', await page.$eval('.verify', (e) => e.dataset.level));

// 4. Full clean check on that class → clean; the picker shows it.
await page.evaluate((id) => localStorage.setItem('school-dashboard:halo-check', JSON.stringify({ at: new Date().toISOString(), courseId: id })), esg.id);
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
await setText('.modal textarea', 'COVERAGE PLAN — 2 pages\nVISITED — Topic 1 — 2 items found\nVISITED — Gradebook — 0 items found\nCOVERAGE — visited 2 of 2 pages\nALL MATCH');
await sleep(200);
console.log('button 3:', await t('.modal .btn.primary'));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await sleep(300);
s = await state();
console.log('recorded 3:', JSON.stringify(s.settings.haloChecks.at(-1), ['clean', 'partial', 'findings']), '| verify line 3:', await t('.verify'));
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.halo-pick', { timeout: 5000 });
console.log('picker after:', await page.$$eval('.halo-pick-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
await page.$eval('.modal .modal-close, .modal button[aria-label="Close"]', (e) => e.click()).catch(() => page.keyboard.press('Escape'));
await sleep(200);

// 5. Settings: per-class history, editable prompt, copy for a chosen class.
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
console.log('history rows:', await page.$$eval('.verify-table li', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
await setText('textarea[aria-label="Check Halo prompt"]', 'My own audit words');
await sleep(200);
console.log('prompt saved:', await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.haloAuditPrompt));
await page.select('select[aria-label="Class for the copied prompt"]', esg.id);
await page.$$eval('.settings-card .btn', (els) => els.find((e) => e.textContent.trim() === 'Copy full prompt').click());
await sleep(200);
const custom = await page.evaluate(() => navigator.clipboard.readText());
console.log('copied custom:', custom.startsWith('My own audit words\n\nCLASS TO AUDIT: ESG-162'), '| only esg lines:', custom.split('\n').filter((l) => /^[A-Z]{3}-\d{3} \|/.test(l)).every((l) => l.startsWith('ESG-162 |')));
await page.screenshot({ path: (process.argv[2] ?? 'check.png').replace(/\.png$/, '-settings.png'), fullPage: false });
await browser.close();
