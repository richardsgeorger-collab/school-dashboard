// The peace-of-mind layer: "Am I okay" from the top bar and the status line; Halo submission facts from a bookmark
// sync feeding the confirmation line and a mismatch; the grade floor on Grades; steps inside a big item with the bar on
// its row and the hero; the term shape in the calendar; the pileup line on Now.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const setState = (s) => page.evaluate((v) => localStorage.setItem('school-dashboard:v1', JSON.stringify(v)), s);
const out = (process.argv[2] ?? 'peace.png').replace(/\.png$/, '');

// 1. Am I okay: from the top bar, one paragraph, ending in the thing to handle first (the seed has overdue items).
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.click('button[aria-label="Am I okay"]');
await page.waitForSelector('.okay', { timeout: 5000 });
console.log('okay (overdue seed):', await t('.okay-text'));
console.log('verdict:', await page.$eval('.okay', (e) => e.dataset.verdict), '| open button:', (await all('.okay .btn')).join(' | '));
await page.screenshot({ path: `${out}-okay.png`, fullPage: false });
await page.$$eval('.okay .btn.primary', (els) => els[0].click());
await sleep(200);
// Same card from the status line.
await page.$eval('.now-status-btn', (e) => e.click());
await page.waitForSelector('.okay', { timeout: 5000 });
console.log('status line opens it:', !!(await page.$('.okay-text')));
await page.$$eval('.okay .btn.primary', (els) => els[0].click());
await sleep(200);

// 2. Clear everything overdue, mark this week's items done with Halo facts: the confirmation line, then a mismatch.
let s = await state();
const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }));
const dayShift = (d, n) => { const x = new Date(`${d}T12:00:00-07:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); };
const checked = new Date().toISOString();
const past = s.items.filter((i) => i.type !== 'participation' && i.points > 0 && i.dueAt.slice(0, 10) < today);
for (const i of past) { i.status = 'done'; i.completedAt = i.dueAt; i.halo = { status: 'SUBMITTED', submittedAt: i.dueAt, checkedAt: checked }; }
s.settings.haloChecks = [{ at: checked, clean: true, findings: 0, courseId: s.courses[0].id }];
await setState(s);
await page.reload({ waitUntil: 'networkidle0' });
console.log('confirmation line:', await t('.verify'), '| level:', await page.$eval('.verify', (e) => e.dataset.level));
await page.click('button[aria-label="Am I okay"]');
await page.waitForSelector('.okay', { timeout: 5000 });
console.log('okay (clear):', await t('.okay-text'), '| verdict:', await page.$eval('.okay', (e) => e.dataset.verdict));
await page.$$eval('.okay .btn.primary', (els) => els[0].click());
await sleep(200);
s = await state();
const weekDone = s.items.filter((i) => i.status === 'done' && i.halo && i.dueAt.slice(0, 10) >= dayShift(today, -7) && i.dueAt.slice(0, 10) < today);
const victim = weekDone[0];
s.items = s.items.map((i) => (i.id === victim.id ? { ...i, halo: { status: 'ACTIVE', submittedAt: null, checkedAt: checked } } : i));
await setState(s);
await page.reload({ waitUntil: 'networkidle0' });
console.log('mismatch line:', await t('.verify'), '| level:', await page.$eval('.verify', (e) => e.dataset.level));
await page.click('button[aria-label="Am I okay"]');
await page.waitForSelector('.okay', { timeout: 5000 });
console.log('okay (mismatch) starts:', (await t('.okay-text')).slice(0, 90), '| first:', (await all('.okay .btn')).find((x) => x.startsWith('Open')));
await page.$$eval('.okay .btn.primary', (els) => els[0].click());
await sleep(200);

// 3. A bookmark sync writes Halo facts on matched items without asking. Reuse the halo e2e payload shape minimally.
const chm = s.courses.find((c) => c.code === 'CHM-113');
const target = s.items.filter((i) => i.courseId === chm.id && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
const payload = { kind: 'halo-export', version: 1, exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [{ id: 'e2e-chm', slugId: 'x', classCode: 'CHM-113-101', courseCode: 'CHM-113', name: chm.name, stage: 'CURRENT', modality: 'ONGROUND', credits: 4, startDate: null, endDate: null, assessments: [{ id: 'e2e-t', title: target.title, description: '', unit: 'Topic 1', sequence: 1, startDate: null, dueDate: new Date(target.dueAt).toISOString(), points: target.points, type: 'ASSIGNMENT', tags: [], inPerson: false, isGroupEnabled: false, requiresLopesWrite: false, status: 'IN_PROGRESS', submittedAt: null, score: null }] }] };
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
await page.waitForSelector('.modal .diff-section', { timeout: 5000 });
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await page.waitForFunction(() => document.querySelector('.modal')?.textContent.includes('Applied'), { timeout: 5000 });
s = await state();
console.log('halo fact written:', JSON.stringify(s.items.find((i) => i.id === target.id)?.halo?.status));
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(200);

// 4. Grades: the floor lines, once something is graded.
s = await state();
const scored = s.items.filter((i) => i.courseId === chm.id && i.status === 'done').slice(0, 2);
s.items = s.items.map((i) => (scored.some((x) => x.id === i.id) ? { ...i, score: Math.round(i.points * 0.6), scoreSource: 'halo' } : i));
await setState(s);
await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
console.log('floor lines:', (await all('.grade-floor')).slice(0, 2).join(' || '));

// 5. A big paper: steps inside it, a bar on its row and on the hero when it leads, the pileup line on Now.
s = await state();
const eng = s.courses.find((c) => c.code === 'ENG-105');
const due = dayShift(today, 20);
const mk = (id, courseId, title, label, d, points, type, minutes) => ({ id, courseId, title, label, labelOverridden: true, type, points, opensAt: null, dueAt: `${d}T23:59:00-07:00`, estimatedMinutes: minutes, estimateOverridden: true, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: 'Write a 1,200-word rhetorical analysis of the artifact you chose. Identify the audience, the purpose, and the appeals (ethos, pathos, logos) and explain how they work. Cite the artifact and at least two sources in APA.', topic: null, flags: { inClass: false, group: false, lopesWrite: false }, source: 'manual', award: null, updatedAt: new Date().toISOString() });
s.items = s.items.filter((i) => i.status !== 'done' || i.halo);
s.items.push(mk('e2e-ra', eng.id, 'Final Draft of a Rhetorical Analysis', 'Eng Rhetorical Analysis', due, 175, 'paper', 300), mk('e2e-op', eng.id, 'First Draft of an Op-Ed', 'Eng Op-Ed Draft', dayShift(today, 22), 100, 'paper', 200), mk('e2e-q4', chm.id, 'Quiz 4', 'Chem Quiz 4', dayShift(today, 19), 50, 'quiz', 45), mk('e2e-h5', chm.id, 'HW 5', 'Chem HW 5', dayShift(today, 21), 40, 'homework', 60), mk('e2e-dq', eng.id, 'Topic 4 DQ 1', 'Eng DQ 4', dayShift(today, 23), 35, 'discussion', 30));
await setState(s);
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
console.log('pace/pileup line:', await t('.pace'));
await page.goto(`${BASE}#/plan`, { waitUntil: 'networkidle0' });
await page.goto(`${BASE}#/class?c=${eng.id}`, { waitUntil: 'networkidle0' });
await page.evaluate(() => { const row = [...document.querySelectorAll('.item-row')].find((r) => /Rhetorical Analysis/.test(r.textContent)); row?.querySelector('.item-main').click(); });
await page.waitForSelector('.modal .work', { timeout: 5000 });
await sleep(500);
console.log('work panel:', (await t('.modal .work')).slice(0, 160));
console.log('steps:', (await all('.work-steps li')).join(' | '));
await page.$$eval('.work-steps input', (els) => { els[0].click(); els[1].click(); });
await sleep(300);
console.log('steps summary:', await t('.work-steps summary'));
await page.screenshot({ path: `${out}-work.png`, fullPage: false });
await page.$$eval('.modal .modal-actions .btn, .modal-close', (els) => (els.find((e) => /Cancel|Close/.test(e.textContent)) ?? els[0]).click());
await sleep(300);
s = await state();
console.log('steps saved:', s.items.find((i) => i.id === 'e2e-ra')?.steps?.filter((x) => x.done).length, 'of', s.items.find((i) => i.id === 'e2e-ra')?.steps?.length);
await page.reload({ waitUntil: 'networkidle0' });
console.log('row bar:', !!(await page.$('.item-steps-bar')));

// 6. Term shape.
await page.goto(`${BASE}#/calendar?v=term`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.term-weeks', { timeout: 5000 });
console.log('term:', await t('.term > .hint'), '| weeks:', await page.$$eval('.term-week', (els) => els.length), '| brutal:', await page.$$eval('.term-week[data-brutal="true"]', (els) => els.length), '| stakes:', await page.$$eval('.stake', (els) => els.length));
await page.screenshot({ path: `${out}-term.png`, fullPage: false });
await browser.close();
