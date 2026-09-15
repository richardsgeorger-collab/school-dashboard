// Check Halo, auto-apply edition: safe changes go in on their own and the screen says "Applied N changes. K things need you:";
// gating deadlines, late flags, overdue rows, removals, and schedule changes wait for a person; undo puts the batch back;
// nothing applies when the paste is unreadable or a class's coverage came back short; the weekly nudge on Now.
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
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const setState = (s) => page.evaluate((v) => localStorage.setItem('school-dashboard:v1', JSON.stringify(v)), s);
const setText = (sel, v) => page.$eval(sel, (el, val) => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const closeHaloTabs = async () => {
  for (const tg of browser.targets()) if (tg.url().includes('halo.gcu.edu')) { const p = await tg.page(); if (p) await p.close(); }
  await page.bringToFront();
  await sleep(300);
};
const openPaste = async (courseIds) => {
  await page.evaluate((ids) => localStorage.setItem('school-dashboard:halo-check', JSON.stringify({ at: new Date().toISOString(), courseIds: ids, resume: null })), courseIds);
  await page.click('button[aria-label="Check Halo"]');
  await page.waitForSelector('.modal textarea', { timeout: 5000 });
};
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const toolReply = (name, input) => ({ status: 200, body: JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'tu_1', name, input }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
const seen = [];
const queue = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  seen.push(JSON.parse(req.postData() ?? '{}'));
  const next = queue.shift() ?? { status: 500, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'no canned reply' } }) };
  return req.respond({ status: next.status, headers: { ...cors, 'content-type': 'application/json' }, body: next.body });
});

// 1. The weekly nudge on Now: never checked → "Time to check Halo." copies the all-classes prompt in one click.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
console.log('nudge:', await t('.verify-nudge'), '| verify line:', await t('.verify'));
await page.$eval('.verify-nudge', (e) => e.click());
await sleep(800);
await closeHaloTabs();
const clip = await page.evaluate(() => navigator.clipboard.readText());
const s0 = await state();
console.log('nudge copied:', clip.startsWith('Audit my GCU Halo account'), '| classes:', clip.split('\n').filter((l) => /^\d\. [A-Z]{3}-\d{3}/.test(l)).length, '| pending:', (await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:halo-check')))).courseIds.length);
const codeOf = (s, id) => s.courses.find((c) => c.id === id)?.code;
const chm = s0.courses.find((c) => c.code === 'CHM-113');
const eng = s0.courses.find((c) => c.code === 'ENG-105');
const esgl = s0.courses.find((c) => c.code === 'ESG-162L');
const esg = s0.courses.find((c) => c.code === 'ESG-162');

// 2. No key, pipe rows: a plain date change on an untouched item applies on its own; a started item's move waits.
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
let s = await state();
const quiz = s.items.filter((i) => i.courseId === chm.id && i.type === 'quiz' && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
const hw = s.items.filter((i) => i.courseId === chm.id && i.type === 'homework' && i.status === 'todo').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
s.items = s.items.map((i) => (i.id === hw.id ? { ...i, status: 'in_progress' } : i));
await setState(s);
await page.reload({ waitUntil: 'networkidle0' });
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
await setText('.modal textarea', ['=== CLASS: CHM-113 ===', 'COVERAGE PLAN — CHM-113 — 3 pages', 'VISITED — Topic 1 — 2 items found', `CHM-113 | ${quiz.title} | changed | 2026-10-02 23:59 | was ${quiz.dueAt.slice(0, 10)}`, `CHM-113 | ${hw.title} | changed | 2026-10-03 23:59 | was ${hw.dueAt.slice(0, 10)}`, 'VISITED — Gradebook — 0 items found', 'VISITED — Mission Statement — 0 items found', 'COVERAGE — CHM-113 — visited 3 of 3 pages', 'END OF FINDINGS — 2 items'].join('\n'));
await page.waitForSelector('.halo-verdict', { timeout: 5000 });
console.log('no key:', await t('.halo-verdict'), '| needs:', (await all('.halo-needs-list li > span:first-child')).join(' || '));
s = await state();
console.log('quiz moved on its own:', s.items.find((i) => i.id === quiz.id).dueAt.slice(0, 10), '| hw untouched:', s.items.find((i) => i.id === hw.id).dueAt === hw.dueAt, '| undo batch:', JSON.parse(await page.evaluate(() => localStorage.getItem('school-dashboard:undo')))?.count);
await page.$$eval('.halo-needs-list .btn', (els) => els.find((e) => e.textContent.trim() === 'Move it').click());
await sleep(200);
s = await state();
console.log('after Move it:', s.items.find((i) => i.id === hw.id).dueAt.slice(0, 10), '| headline:', await t('.halo-verdict'));
await page.$$eval('.modal .modal-actions .btn', (els) => els.find((e) => e.textContent.trim() === 'Undo this sync').click());
await sleep(300);
s = await state();
console.log('after undo:', s.items.find((i) => i.id === quiz.id).dueAt.slice(0, 10), s.items.find((i) => i.id === hw.id).dueAt.slice(0, 10), '| hint:', await t('.halo-banner'));

// 3. With a key: the real shape. Grades and the ENG-105 import apply; the claim, the late flags, the overdue row, and the schedule line wait.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
s = await state();
const prereq = s.items.filter((i) => i.courseId === chm.id && /Prerequisite/i.test(i.title))[0];
const lab1 = s.items.filter((i) => i.courseId === esgl.id && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
const lab2 = s.items.filter((i) => i.courseId === esgl.id && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[1];
const mk = (id, courseId, title, label, due, points) => ({ id, courseId, title, label, labelOverridden: true, type: 'project', points, opensAt: null, dueAt: due, estimatedMinutes: 120, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false }, source: 'manual', award: null, updatedAt: new Date().toISOString() });
s.items = s.items.map((i) => (i.id === lab1.id || i.id === lab2.id ? { ...i, status: 'done', completedAt: new Date().toISOString(), points: 0 } : i));
s.items.push(mk('e2e-pres', chm.id, 'Chemistry Connections Presentation', 'Chem Presentation', '2026-09-27T23:59:00-07:00', 75), mk('e2e-essay', chm.id, 'Chemistry Connections Essay', 'Chem Essay', '2026-10-09T23:59:00-07:00', 100));
s.items = s.items.filter((i) => i.courseId !== eng.id);
s.settings.haloChecks = [];
await setState(s);
await page.reload({ waitUntil: 'networkidle0' });
const engRows = Array.from({ length: 28 }, (_, i) => ({ class_code: 'ENG-105-ONL4', title: `Topic ${Math.floor(i / 5) + 1} Item ${i + 1}`, status: 'new', due: `2026-10-${String(i + 1).padStart(2, '0')} 23:59`, points: 10, score: null, note: '', confidence: 'high', quote: `ENG-105-ONL4 | Topic ${Math.floor(i / 5) + 1} Item ${i + 1} | new | 2026-10-${String(i + 1).padStart(2, '0')} 23:59 | 10 pts`, gates: [] }));
const findings = [
  { class_code: 'CHM-113', title: prereq.title, status: 'grade', due: null, points: prereq.points, score: 19.66, note: '19.66/20', confidence: 'high', quote: `CHM-113 | ${prereq.title} | grade | | 19.66/20`, gates: [] },
  { class_code: 'CHM-113', title: 'Chemistry Connections Topic selection', status: 'announce', due: '2026-09-20 23:59', points: 0, score: null, note: 'prerequisite for Presentation 9/27 & Essay 10/9', confidence: 'medium', quote: 'CHM-113 | Chemistry Connections Topic selection | announce | 2026-09-20 23:59 | prerequisite for Presentation 9/27 & Essay 10/9', gates: ['Chemistry Connections Presentation', 'Chemistry Connections Essay'] },
  ...engRows,
  { class_code: 'ESG-162L', title: lab1.title, status: 'overdue', due: null, points: 0, score: null, note: 'Halo flags Late (submitted 9/9, 0 pts)', confidence: 'high', quote: `ESG-162L | ${lab1.title} | overdue | | Halo flags Late (submitted 9/9, 0 pts)`, gates: [] },
  { class_code: 'ESG-162L', title: lab2.title, status: 'overdue', due: null, points: 0, score: null, note: 'Halo flags Late (submitted 9/10, 0 pts)', confidence: 'high', quote: `ESG-162L | ${lab2.title} | overdue | | Halo flags Late (submitted 9/10, 0 pts)`, gates: [] },
  { class_code: 'ESG-162', title: 'Software Installation', status: 'overdue', due: '2026-09-13 23:59', points: null, score: null, note: 'never submitted', confidence: 'high', quote: 'ESG-162 | Software Installation | overdue | 2026-09-13 23:59 | never submitted', gates: [] },
  { class_code: 'ENG-105', title: 'Participation days/week requirement', status: 'schedule', due: null, points: null, score: null, note: 'Syllabus says 4 participation days, announcement says 3', confidence: 'high', quote: 'ENG-105 | Participation days/week requirement | schedule | — | Syllabus says 4; Week 1 announcement says 3', gates: [] },
];
const cls = (code, n) => ({ code, planned_pages: n + 7, visited_pages: n, coverage_visited: n, coverage_planned: n + 7, skipped: ['Mission Statement', 'Doctrinal Statement', 'Library', 'Student Success Center', 'Student AI Resources', 'Learning Support', 'Classroom Policies'], generic_pages_planned: 7, stopped_at: null, reported_findings: null, notes: '' });
queue.push(toolReply('audit_findings', { classes: [cls('CHM-113', 15), cls('ENG-105', 15), cls('ESG-162L', 13), cls('ESG-162', 15)], findings, all_match: false, stopped: null, unread: [] }));
queue.push(toolReply('needs_you', { lines: [{ id: 'n1', text: 'Two ESG-162L items flagged late in Halo, both at 0 pts.' }, { id: 'n2', text: 'ESG-162 Software Installation is overdue and unsubmitted.' }, { id: 'n3', text: 'CHM-113 Chem Connections topic claim due Sep 20 — gates your Sep 27 presentation.' }, { id: 'n4', text: 'ENG-105 syllabus says 4 participation days, announcement says 3.' }] }));
await openPaste([chm.id, eng.id, esgl.id, esg.id]);
await setText('.modal textarea', 'Used Claude in Chrome (41 actions)\nMessy real-shaped paste; the canned reader answers.');
await page.waitForFunction(() => /^Applied/.test(document.querySelector('.halo-verdict')?.textContent ?? ''), { timeout: 10000 });
await page.waitForFunction(() => !document.querySelector('.halo-summary')?.textContent.includes('Wording these'), { timeout: 8000 });
console.log('headline:', await t('.halo-verdict'));
console.log('needs:', (await all('.halo-needs-list li > span:first-child')).join(' || '));
console.log('actions:', (await all('.halo-needs-list .btn')).join(' | '));
console.log('coverage warnings shown:', (await all('.halo-partial')).join(' || ') || 'none', '| details open:', !!(await page.$('.halo-details')));
await page.screenshot({ path: process.argv[2] ?? 'check.png', fullPage: false });
s = await state();
console.log('applied: ENG items', s.items.filter((i) => i.courseId === eng.id).length, '| prereq score', s.items.find((i) => i.id === prereq.id)?.score, s.items.find((i) => i.id === prereq.id)?.scoreSource, '| presentation still Sep 27:', s.items.find((i) => i.id === 'e2e-pres').dueAt.slice(0, 10), '| claim added yet:', s.items.some((i) => /Topic selection/.test(i.title)));
console.log('recorded:', s.settings.haloChecks.map((c) => `${codeOf(s, c.courseId)}:${c.clean ? 'clean' : c.partial ? 'partial' : c.findings + ' findings'}`).join(' '));
// Add the claim from its line; note the late flags.
await page.$$eval('.halo-needs-list .btn', (els) => els.find((e) => e.textContent.trim() === 'Add it').click());
await sleep(300);
s = await state();
const claim = s.items.find((i) => /Topic selection/.test(i.title));
console.log('claim added:', !!claim, '| gates:', claim?.blocks?.map((id) => s.items.find((i) => i.id === id)?.label).join(' + '), '| headline now:', await t('.halo-verdict'));
await page.$$eval('.halo-needs-list .btn', (els) => els.find((e) => e.textContent.trim() === 'Note it').click());
await sleep(300);
s = await state();
console.log('late noted:', [lab1.id, lab2.id].map((id) => !!s.items.find((i) => i.id === id)?.haloLate).join(','), '| still done:', s.items.find((i) => i.id === lab1.id)?.status);
await page.$$eval('.halo-needs-list .btn', (els) => els.filter((e) => ['OK', 'Skip'].includes(e.textContent.trim())).forEach((e) => e.click()));
await sleep(200);
console.log('all handled:', await t('.halo-verdict'));
await page.$eval('.halo-summary .diff-toggle', (e) => e.click());
await sleep(200);
console.log('details:', (await all('.halo-details .rev-group-title')).join(' | '), '| applied lines:', (await all('.halo-details .diff-list li')).length);
await page.screenshot({ path: (process.argv[2] ?? 'check.png').replace(/\.png$/, '-details.png'), fullPage: false });
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(300);
console.log('verify line:', await t('.verify'), '| nudge gone:', !(await page.$('.verify-nudge')));

// 4. Coverage short → nothing applies for that class, and it says so.
queue.push(toolReply('audit_findings', { classes: [{ ...cls('CHM-113', 9), coverage_planned: 22, planned_pages: 22, generic_pages_planned: 7 }], findings: [{ class_code: 'CHM-113', title: quiz.title, status: 'changed', due: '2026-10-05 23:59', points: null, score: null, note: 'was 2026-10-02', confidence: 'high', quote: 'row', gates: [] }], all_match: false, stopped: null, unread: [] }));
queue.push(toolReply('needs_you', { lines: [] }));
await openPaste([chm.id]);
await setText('.modal textarea', 'short coverage paste');
await page.waitForFunction(() => /^(Applied|Nothing applied)/.test(document.querySelector('.halo-verdict')?.textContent ?? ''), { timeout: 10000 });
console.log('short coverage:', await t('.halo-verdict'), '|', (await all('.halo-partial')).join(' || '), '| needs:', (await all('.halo-needs-list li > span:first-child')).join(' || '));
s = await state();
console.log('quiz not moved:', s.items.find((i) => i.id === quiz.id).dueAt.slice(0, 10) !== '2026-10-05', '| recorded partial:', s.settings.haloChecks.at(-1).partial);
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(200);

// 5. Unreadable → nothing applied, nothing recorded.
const before = (await state()).settings.haloChecks.length;
queue.push(toolReply('audit_findings', { classes: [], findings: [], all_match: false, stopped: null, unread: [] }));
await openPaste([chm.id]);
await setText('.modal textarea', 'Used Claude in Chrome (12 actions)\nEverything looks fine to me!');
await page.waitForFunction(() => !!document.querySelector('.halo-unreadable'), { timeout: 10000 });
console.log('unreadable:', await t('.halo-unreadable .halo-verdict'), '| record count unchanged:', (await state()).settings.haloChecks.length === before, '| undo offered:', (await all('.modal .modal-actions .btn')).includes('Undo this sync'));
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(200);

// 6. Settings: the undo button and the class page.
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
console.log('settings undo:', (await all('.settings-card .btn')).includes('Undo this sync'));
await page.goto(`${BASE}#/class?c=${chm.id}`, { waitUntil: 'networkidle0' });
console.log('class page:', await t('.lib-class-title'), '| next:', await t('.class-next-title'), '| stats:', await t('.class-stats'), '| sections:', (await all('.section-title')).join(' | ').slice(0, 120));
await page.screenshot({ path: (process.argv[2] ?? 'check.png').replace(/\.png$/, '-class.png'), fullPage: false });
await browser.close();
