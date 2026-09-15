// Check Halo with Claude reading the paste: the class list, the all-classes prompt, the pipe-row fallback without a key,
// the model path with a messy freeform paste (sections, prose, noise), a whole-class import in one press, a late flag that
// is noted but never resolved, gating from an announcement, a posted score landing in Grades, an unreadable paste that is
// never called clean, a failed read that falls back, a clean result with no review, resume, and Settings.
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
const opened = [];
browser.on('targetcreated', (tg) => opened.push(tg.url()));
const openPaste = async (courseIds) => {
  await page.evaluate((ids) => localStorage.setItem('school-dashboard:halo-check', JSON.stringify({ at: new Date().toISOString(), courseIds: ids, resume: null })), courseIds);
  await page.click('button[aria-label="Check Halo"]');
  await page.waitForSelector('.modal textarea', { timeout: 5000 });
};

// api.anthropic.com answers from a queue: audit_findings first, then audit_summary.
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const toolReply = (name, input) => ({ status: 200, body: JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'tu_1', name, input }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
const seen = [];
const queue = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  seen.push(body);
  const next = queue.shift() ?? { status: 500, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'no canned reply' } }) };
  return req.respond({ status: next.status, headers: { ...cors, 'content-type': 'application/json' }, body: next.body });
});

// 1. Picker and the all-classes prompt.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.halo-pick', { timeout: 5000 });
await page.$eval('.halo-pick-all', (e) => e.click());
await sleep(800);
await closeHaloTabs();
const clip = await page.evaluate(() => navigator.clipboard.readText());
const s0 = await state();
console.log('prompt: classes', clip.split('\n').filter((l) => /^\d\. [A-Z]{3}-\d{3}/.test(l)).length, 'of', s0.courses.length, '| skip list:', clip.includes('Mission Statement, Doctrinal Statement, Library'), '| pipe rule:', clip.includes('every finding must be one'), '| slots left:', /\[(CLASS LIST|RESUME|DATE|PLANNER DUMP BY CLASS)\]/.test(clip));
const codeOf = (s, id) => s.courses.find((c) => c.id === id)?.code;
const chm = s0.courses.find((c) => c.code === 'CHM-113');
const eng = s0.courses.find((c) => c.code === 'ENG-105');
const esgl = s0.courses.find((c) => c.code === 'ESG-162L');

// 2. No key: the pipe-row fallback still works and says so.
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
const quiz = s0.items.filter((i) => i.courseId === chm.id && i.type === 'quiz' && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
await setText('.modal textarea', ['=== CLASS: CHM-113 ===', 'COVERAGE PLAN — CHM-113 — 2 pages', 'VISITED — Topic 1 — 2 items found', `CHM-113 | ${quiz.title} | changed | 2026-10-02 23:59 | was ${quiz.dueAt.slice(0, 10)}`, 'VISITED — Gradebook — 0 items found', 'COVERAGE — CHM-113 — visited 2 of 2 pages', 'END OF FINDINGS — 1 items'].join('\n'));
await sleep(300);
console.log('no key: source', await page.$eval('.halo-summary', (e) => e.dataset.source), '| note:', (await all('.modal .hint.mono')).find((x) => /No key/.test(x))?.slice(0, 60), '| verdict:', await t('.halo-verdict'));
await page.$$eval('.modal .modal-actions .btn', (els) => els.find((e) => e.textContent.trim() === 'Not now').click());
await sleep(200);

// 3. With a key: a messy freeform paste, read by Claude. Planner: the presentation and essay exist so the claim can gate them.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
let s = await state();
const prereq = s.items.filter((i) => i.courseId === chm.id && /Prerequisite/i.test(i.title))[0];
const lab = s.items.filter((i) => i.courseId === esgl.id && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
const mk = (id, courseId, title, label, due, points) => ({ id, courseId, title, label, labelOverridden: true, type: 'project', points, opensAt: null, dueAt: due, estimatedMinutes: 120, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false }, source: 'manual', award: null, updatedAt: new Date().toISOString() });
s.items = s.items.map((i) => (i.id === lab.id ? { ...i, status: 'done', completedAt: new Date().toISOString() } : i));
s.items.push(mk('e2e-pres', chm.id, 'Chemistry Connections Presentation', 'Chem Presentation', '2026-09-27T23:59:00-07:00', 50), mk('e2e-essay', chm.id, 'Chemistry Connections Essay', 'Chem Essay', '2026-10-09T23:59:00-07:00', 100));
s.items = s.items.filter((i) => i.courseId !== eng.id);
await setState(s);
await page.reload({ waitUntil: 'networkidle0' });
const messy = [
  'Used Claude in Chrome (41 actions)',
  'I audited each class in order. Here is what I found.',
  '## CHM-113-TR101 General Chemistry I',
  'Coverage plan: 11 pages (Topics 1-8, Gradebook, Announcements, Syllabus)',
  'Visited all of them. The Sept 12 announcement says Chemistry Connections topics must be claimed by 9/20 11:59 PM, before the 9/27 presentation and the 10/9 essay.',
  `CHM-113 | ${prereq.title} | grade | | 19.66/20`,
  'COVERAGE — CHM-113 — visited 11 of 11 pages',
  '## ENG-105-ONL4',
  'This class now shows 28 items; the planner lists none. Listing them all as new:',
  ...Array.from({ length: 28 }, (_, i) => `ENG-105-ONL4 | Topic ${Math.floor(i / 5) + 1} Item ${i + 1} | new | 2026-10-${String(i + 1).padStart(2, '0')} 23:59 | 10 pts`),
  'COVERAGE — ENG-105 — visited 9 of 9 pages',
  '## ESG-162L',
  `ESG-162L | ${lab.title} | overdue | | Halo shows Late even though it was submitted`,
  'COVERAGE — ESG-162L — visited 6 of 6 pages',
  'END OF FINDINGS — 31 items',
].join('\n');
const findings = [
  { class_code: 'CHM-113', title: prereq.title, status: 'grade', due: null, points: prereq.points, score: 19.66, note: '19.66/20', confidence: 'high', quote: `CHM-113 | ${prereq.title} | grade | | 19.66/20`, gates: [] },
  { class_code: 'CHM-113-TR101', title: 'Claim your Chemistry Connections topic', status: 'announce', due: '2026-09-20 23:59', points: 0, score: null, note: 'from the Sept 12 announcement; gates the presentation and essay', confidence: 'medium', quote: 'The Sept 12 announcement says Chemistry Connections topics must be claimed by 9/20 11:59 PM, before the 9/27 presentation and the 10/9 essay.', gates: ['Chemistry Connections Presentation', 'Chemistry Connections Essay'] },
  ...Array.from({ length: 28 }, (_, i) => ({ class_code: 'ENG-105-ONL4', title: `Topic ${Math.floor(i / 5) + 1} Item ${i + 1}`, status: 'new', due: `2026-10-${String(i + 1).padStart(2, '0')} 23:59`, points: 10, score: null, note: '', confidence: 'high', quote: `ENG-105-ONL4 | Topic ${Math.floor(i / 5) + 1} Item ${i + 1} | new | 2026-10-${String(i + 1).padStart(2, '0')} 23:59 | 10 pts`, gates: [] })),
  { class_code: 'ESG-162L', title: lab.title, status: 'overdue', due: null, points: null, score: null, note: 'Halo shows Late even though it was submitted', confidence: 'high', quote: `ESG-162L | ${lab.title} | overdue | | Halo shows Late even though it was submitted`, gates: [] },
];
const classes = [
  { code: 'CHM-113', planned_pages: 11, visited_pages: 11, coverage_visited: 11, coverage_planned: 11, skipped: [], stopped_at: null, notes: '' },
  { code: 'ENG-105', planned_pages: 9, visited_pages: 9, coverage_visited: 9, coverage_planned: 9, skipped: [], stopped_at: null, notes: '' },
  { code: 'ESG-162L', planned_pages: 6, visited_pages: 6, coverage_visited: 6, coverage_planned: 6, skipped: [], stopped_at: null, notes: '' },
];
queue.push(toolReply('audit_findings', { classes, findings, all_match: false, stopped: null, unread: [] }));
queue.push(toolReply('audit_summary', { verdict: "Mostly clean — ENG-105 just isn't in your planner yet, plus one thing to claim and one score.", matters: ['Claim your Chemistry Connections topic by Sep 20; it gates the Sep 27 presentation and the Oct 9 essay.', 'Your chem prereq is graded: 19.66 of 20.', 'Halo says an ESG-162L lab is late even though you turned it in.'], plan: "I'll add all 28 ENG-105 items, add the topic claim for Sep 20, and record the prereq at 19.66 of 20.", needs_you: ['Halo says the ESG-162L lab is late — check it in Halo.'], partial: [], decisions: [{ id: 'a1', action: 'apply' }, { id: 'a2', action: 'apply' }, { id: 'a31', action: 'ask' }] }));
await openPaste(s.courses.map((c) => c.id));
await setText('.modal textarea', messy);
await page.waitForFunction(() => document.querySelector('.halo-summary')?.dataset.source === 'claude', { timeout: 10000 });
const readReq = seen.find((b) => b.tool_choice?.name === 'audit_findings');
console.log('read request: tool', readReq?.tool_choice?.name, '| paste verbatim:', readReq?.messages?.[0]?.content?.includes('Used Claude in Chrome (41 actions)'), '| classes given:', /ENG-105 — English/.test(readReq?.messages?.[0]?.content ?? ''), '| planner given:', /Chem Presentation/.test(readReq?.messages?.[0]?.content ?? ''));
console.log('verdict:', await t('.halo-verdict'));
console.log('matters:', (await all('.halo-matters li')).join(' || '));
console.log('bulk button:', await t('.halo-bulk .btn'), '| needs you:', (await all('.halo-needs li')).join(' || '));
console.log('recognized:', await t('.halo-rawwrap summary'));
await page.screenshot({ path: process.argv[2] ?? 'check.png', fullPage: false });
await page.$eval('.halo-bulk .btn', (e) => e.click());
await sleep(500);
s = await state();
console.log('after bulk:', await t('.halo-bulk'), '| ENG items now:', s.items.filter((i) => i.courseId === eng.id).length, '| source halo:', s.items.filter((i) => i.courseId === eng.id).every((i) => i.source === 'manual' || i.source === 'halo'));
await page.$$eval('.modal .btn.primary', (els) => els.find((e) => /^Review/.test(e.textContent.trim())).click());
await page.waitForSelector('.rev-mention', { timeout: 5000 });
console.log('rows:', await page.$$eval('.rev-mention', (els) => els.map((e) => `${e.querySelector('.rev-badge').textContent} [${e.dataset.plan}/${e.dataset.decided}]`).filter((x, i, a) => a.indexOf(x) === i).join(' | ')));
console.log('late row:', (await all('.rev-mention[data-plan="ask"] .rev-proposal'))[0]?.slice(0, 120));
await page.$eval('.rev-apply-all .btn', (e) => e.click());
await sleep(500);
s = await state();
const claim = s.items.find((i) => /Claim your Chemistry Connections topic/i.test(i.title));
console.log('claim added:', !!claim, '| gates:', claim?.blocks?.map((id) => s.items.find((i) => i.id === id)?.label).join(' + '), '| prereq score:', s.items.find((i) => i.id === prereq.id)?.score, s.items.find((i) => i.id === prereq.id)?.scoreSource);
await page.$$eval('.rev-mention[data-plan="ask"] .rev-actions .btn', (els) => els.find((e) => /Note it/.test(e.textContent)).click());
await sleep(300);
s = await state();
console.log('late noted:', s.items.find((i) => i.id === lab.id)?.haloLate, '| still done:', s.items.find((i) => i.id === lab.id)?.status);
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(300);
s = await state();
console.log('recorded:', s.settings.haloChecks.map((c) => `${codeOf(s, c.courseId)}:${c.clean ? 'clean' : c.partial ? 'partial' : c.findings + ' findings'}`).join(' '));
await page.screenshot({ path: (process.argv[2] ?? 'check.png').replace(/\.png$/, '-review.png'), fullPage: false });

// 4. Now: the claim gates bigger work, so it leads with that reason; Grades shows the score.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
console.log('hero:', await t('.hero .hero-title, .hero h1'), '| why:', (await t('.hero .why, .hero .hero-why'))?.slice(0, 120));
await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle0' });
await page.$$eval('.grade-card', (els) => els.find((e) => e.textContent.includes('CHM-113')).querySelector('.settings-actions .btn').click());
await sleep(200);
console.log('grades row:', (await all('.score-list li')).find((x) => /Prerequisite/.test(x))?.slice(0, 90));

// 5. An unreadable paste is never called clean; a failed read falls back to pipe rows.
queue.push(toolReply('audit_findings', { classes: [], findings: [], all_match: false, stopped: null, unread: [] }));
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await openPaste([chm.id]);
await setText('.modal textarea', 'Used Claude in Chrome (12 actions)\nEverything looks fine to me!');
await page.waitForFunction(() => !!document.querySelector('.halo-unreadable'), { timeout: 10000 });
console.log('unreadable:', await t('.halo-unreadable .halo-verdict'), '| record offered:', (await all('.modal .modal-actions .btn')).some((x) => /^Record/.test(x)), '| read again:', (await all('.modal .modal-actions .btn')).includes('Read again'), '| recognized:', await t('.halo-rawwrap summary'));
await page.$$eval('.modal .modal-actions .btn', (els) => els.find((e) => e.textContent.trim() === 'Not now').click());
await sleep(200);
await openPaste([chm.id]);
await setText('.modal textarea', ['=== CLASS: CHM-113 ===', 'COVERAGE PLAN — CHM-113 — 1 pages', 'VISITED — Topic 1 — 1 items found', `CHM-113 | ${quiz.title} | changed | 2026-10-05 23:59 | was 2026-10-02`, 'COVERAGE — CHM-113 — visited 1 of 1 pages'].join('\n'));
await page.waitForFunction(() => !!document.querySelector('.halo-summary'), { timeout: 10000 });
console.log('failed read:', (await all('.modal .hint.mono')).find((x) => /couldn't read this/.test(x))?.slice(0, 70), '| source:', await page.$eval('.halo-summary', (e) => e.dataset.source), '| verdict:', await t('.halo-verdict'));
await page.$$eval('.modal .modal-actions .btn', (els) => els.find((e) => e.textContent.trim() === 'Not now').click());
await sleep(200);

// 6. Clean: complete coverage, nothing different, nothing unread → no review; unread lines → not clean.
queue.push(toolReply('audit_findings', { classes: [{ code: 'CHM-113', planned_pages: 3, visited_pages: 3, coverage_visited: 3, coverage_planned: 3, skipped: [], stopped_at: null, notes: '' }], findings: [], all_match: true, stopped: null, unread: [] }));
await openPaste([chm.id]);
await setText('.modal textarea', 'CHM-113: planned 3 pages, visited all three, nothing differs. COVERAGE — CHM-113 — visited 3 of 3 pages. ALL MATCH');
await page.waitForFunction(() => /Nothing to fix|not a clean|not complete/.test(document.querySelector('.halo-verdict')?.textContent ?? ''), { timeout: 10000 });
console.log('clean:', await t('.halo-verdict'), '| button:', await t('.modal .btn.primary'), '| review:', !!(await page.$('.rev-mention')));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await sleep(300);
s = await state();
console.log('clean recorded:', JSON.stringify(s.settings.haloChecks.at(-1), ['clean', 'partial', 'findings']));
queue.push(toolReply('audit_findings', { classes: [{ code: 'CHM-113', planned_pages: 3, visited_pages: 3, coverage_visited: 3, coverage_planned: 3, skipped: [], stopped_at: null, notes: '' }], findings: [], all_match: true, stopped: null, unread: ['Something about a lab handout dated 10/3 that I could not place'] }));
await openPaste([chm.id]);
await setText('.modal textarea', 'CHM-113 coverage 3 of 3, ALL MATCH, but there was something about a lab handout dated 10/3.');
await page.waitForFunction(() => /not a clean/.test(document.querySelector('.halo-verdict')?.textContent ?? ''), { timeout: 10000 });
console.log('unread guard:', await t('.halo-verdict'), '| button:', await t('.modal .btn.primary'));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await sleep(300);
s = await state();
console.log('unread recorded:', JSON.stringify(s.settings.haloChecks.at(-1), ['clean', 'partial']), '| verify line:', await t('.verify'));
await browser.close();
