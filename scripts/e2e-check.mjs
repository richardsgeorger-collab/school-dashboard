// Check Halo, every class one at a time: the button shows the class list; "All classes" copies one prompt that works class
// by class; pasting results shows a plain-language overview first (local, then Claude's when a key is here), then the rows
// pre-marked as planned or needs-you; a stopped run offers "Resume from here"; coverage decides clean vs partial per class.
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
const setText = (sel, v) => page.$eval(sel, (el, val) => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const closeHaloTabs = async () => {
  for (const tg of browser.targets()) if (tg.url().includes('halo.gcu.edu')) { const p = await tg.page(); if (p) await p.close(); }
  await page.bringToFront();
  await sleep(300);
};
const opened = [];
browser.on('targetcreated', (tg) => opened.push(tg.url()));

// Claude answers only when asked for a summary; canned through interception.
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const toolReply = (input) => JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'tu_1', name: 'audit_summary', input }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
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

// 1. All classes, one prompt, one class at a time.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.halo-pick', { timeout: 5000 });
console.log('picker:', await t('.halo-pick-all'), '| rows:', (await all('.halo-pick-row')).length - 1);
await page.$eval('.halo-pick-all', (e) => e.click());
await sleep(800);
console.log('hint:', await t('.halo-banner'));
await closeHaloTabs();
const clip = await page.evaluate(() => navigator.clipboard.readText());
const s0 = await state();
console.log('clipboard starts:', JSON.stringify(clip.slice(0, 44)), '| class list:', clip.split('\n').filter((l) => /^\d\. [A-Z]{3}-\d{3}/.test(l)).length, 'of', s0.courses.length, '| per-class header rule:', clip.includes('=== CLASS: [class code] ==='), '| headings:', clip.split('\n').filter((l) => /^[A-Z]{3}-\d{3}[A-Z]? [A-Z]/.test(l)).length, '| slots left:', /\[(CLASS LIST|RESUME|DATE|PLANNER DUMP BY CLASS)\]/.test(clip), '| resume note:', clip.includes('RESUMING'));
console.log('pending:', (await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:halo-check')))).courseIds.length);

// 2. Paste: two classes done (one with findings), the third stopped mid-run. No key → the local overview.
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
console.log('paste title:', await t('.modal h2'));
const chm = s0.courses.find((c) => c.code === 'CHM-113');
const quiz = s0.items.filter((i) => i.courseId === chm.id && i.type === 'quiz' && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
const hw = s0.items.filter((i) => i.courseId === chm.id && i.type !== 'quiz' && i.status !== 'done' && i.points > 0).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
const codes = s0.courses.map((c) => c.code);
const run = [
  `=== CLASS: ${codes[0]} ===`,
  `COVERAGE PLAN — ${codes[0]} — 3 pages`,
  '- Topic 1', '- Gradebook', '- Announcements',
  'VISITED — Topic 1 — 3 items found',
  `CHM-113 | ${quiz.title} | changed | 2026-10-02 23:59 | was ${quiz.dueAt.slice(0, 10)}`,
  'CHM-113 | Section 2.4 Worksheet | new | 2026-09-30 08:00 | 15 pts',
  'VISITED — Gradebook — 1 items found',
  `CHM-113 | ${hw.title} | grade | | ${Math.round(hw.points * 0.9)}/${hw.points}`,
  'VISITED — Announcements — 0 items found',
  `COVERAGE — ${codes[0]} — visited 3 of 3 pages`,
  `=== CLASS: ${codes[1]} ===`,
  `COVERAGE PLAN — ${codes[1]} — 2 pages`,
  'VISITED — Topic 1 — 0 items found',
  'VISITED — Gradebook — 0 items found',
  `COVERAGE — ${codes[1]} — visited 2 of 2 pages`,
  `=== CLASS: ${codes[2]} ===`,
  `COVERAGE PLAN — ${codes[2]} — 4 pages`,
  'VISITED — Topic 1 — 1 items found',
  'this line means nothing',
  `STOPPED — ${codes[2]} — Topic 2`,
].join('\n');
await setText('.modal textarea', run);
await sleep(300);
console.log('verdict:', await t('.halo-verdict'), '| source:', await page.$eval('.halo-summary', (e) => e.dataset.source));
console.log('matters:', (await all('.halo-matters li')).join(' || '));
console.log('plan:', await t('.halo-plan'));
console.log('partial:', (await all('.halo-partial')).join(' || '));
console.log('buttons:', (await all('.modal .modal-actions .btn')).join(' | '));
await page.screenshot({ path: process.argv[2] ?? 'check.png', fullPage: false });
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await page.waitForSelector('.rev-mention', { timeout: 5000 });
console.log('review title:', await t('.modal h2'), '| overview on top:', !!(await page.$('.modal .halo-summary')), '| apply button:', await t('.rev-apply-all .btn'));
console.log('rows:', await page.$$eval('.rev-mention', (els) => els.map((e) => `${e.querySelector('.rev-badge').textContent} [${e.dataset.plan}]`).join(' | ')));
await page.$eval('.rev-apply-all .btn', (e) => e.click());
await sleep(400);
console.log('after apply:', await page.$$eval('.rev-mention', (els) => els.map((e) => e.dataset.decided).join(' ')));
let s = await state();
console.log('quiz moved:', s.items.find((i) => i.id === quiz.id).dueAt.slice(0, 10), '| worksheet added:', s.items.some((i) => i.title === 'Section 2.4 Worksheet'), '| hw graded:', s.items.find((i) => i.id === hw.id).score, s.items.find((i) => i.id === hw.id).scoreSource);
await page.screenshot({ path: (process.argv[2] ?? 'check.png').replace(/\.png$/, '-review.png'), fullPage: false });
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(300);
s = await state();
const codeOf = (id) => s.courses.find((c) => c.id === id)?.code;
console.log('recorded:', s.settings.haloChecks.map((c) => `${codeOf(c.courseId)}:${c.clean ? 'clean' : c.partial ? 'partial' : c.findings + ' findings'}`).join(' '));
const pend = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:halo-check')));
console.log('pending resume:', pend?.resume?.stoppedAt, '| remaining:', pend?.resume?.courseIds?.map(codeOf).join(','));
console.log('verify line:', await t('.verify'));

// 3. Resume from where it stopped: only the remaining classes, with the resume note.
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
console.log('resume banner:', await t('.halo-resume'));
await page.$eval('.halo-resume .btn', (e) => e.click());
await sleep(600);
await closeHaloTabs();
const resumeClip = await page.evaluate(() => navigator.clipboard.readText());
console.log('resume prompt classes:', resumeClip.split('\n').filter((l) => /^\d\. [A-Z]{3}-\d{3}/.test(l)).join(' / '), '| note:', resumeClip.split('\n').find((l) => l.startsWith('RESUMING')));

// 4. With a key: Claude's overview replaces the local one; a removal never applies on its own.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
queue.push({ status: 200, body: toolReply({ verdict: 'Pretty much fine — one thing slid and one is gone.', matters: ['Halo dropped Eng HW 2.'], plan: "I'll move the ESG quiz to Oct 3.", needs_you: ['Eng HW 2 vanished from Halo — moved or cancelled?'], partial: [], decisions: [{ id: 'a1', action: 'apply' }, { id: 'a2', action: 'apply' }] }) });
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
const esg = s.courses.find((c) => c.code === codes[3]) ?? s.courses[3];
const esgItem = s.items.filter((i) => i.courseId === esg.id && i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
await setText('.modal textarea', [`=== CLASS: ${esg.code} ===`, `COVERAGE PLAN — ${esg.code} — 1 pages`, 'VISITED — Topic 1 — 2 items found', `${esg.code} | ${esgItem.title} | changed | 2026-10-03 23:59 | was ${esgItem.dueAt.slice(0, 10)}`, `${esg.code} | Something Halo dropped | missing | | not in Halo`, `COVERAGE — ${esg.code} — visited 1 of 1 pages`, 'END OF FINDINGS — 2 items'].join('\n'));
await page.waitForFunction(() => document.querySelector('.halo-summary')?.dataset.source === 'claude', { timeout: 8000 });
console.log('claude verdict:', await t('.halo-verdict'), '| request had findings:', /a1 · /.test(seen[0]?.messages?.[0]?.content ?? ''), '| tool:', seen[0]?.tool_choice?.name);
console.log('needs you:', (await all('.halo-needs li')).join(' || '));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await page.waitForSelector('.rev-mention', { timeout: 5000 });
console.log('rows 2:', await page.$$eval('.rev-mention', (els) => els.map((e) => `${e.querySelector('.rev-badge').textContent} [${e.dataset.plan}]`).join(' | ')));
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(300);

// 5. Clean: no review at all.
await page.evaluate((id) => localStorage.setItem('school-dashboard:halo-check', JSON.stringify({ at: new Date().toISOString(), courseIds: [id], resume: null })), esg.id);
await page.click('button[aria-label="Check Halo"]');
await page.waitForSelector('.modal textarea', { timeout: 5000 });
await setText('.modal textarea', `=== CLASS: ${esg.code} ===\nCOVERAGE PLAN — ${esg.code} — 2 pages\nVISITED — Topic 1 — 2 items found\nVISITED — Gradebook — 0 items found\nCOVERAGE — ${esg.code} — visited 2 of 2 pages\nFINAL COVERAGE\n${esg.code} — visited 2 of 2 pages — clean\nALL MATCH`);
await sleep(300);
console.log('clean verdict:', await t('.halo-verdict'), '| button:', await t('.modal .btn.primary'), '| review offered:', !!(await page.$('.rev-mention')));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await sleep(300);
s = await state();
console.log('clean recorded:', JSON.stringify(s.settings.haloChecks.at(-1), ['clean', 'partial', 'findings']), '| verify line:', await t('.verify'));

// 6. Settings: per-class history and the prompt for all classes or one.
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
console.log('history rows:', (await all('.verify-table li')).join(' || '));
await page.$$eval('.settings-card .btn', (els) => els.find((e) => e.textContent.trim() === 'Copy full prompt').click());
await sleep(200);
const allPrompt = await page.evaluate(() => navigator.clipboard.readText());
console.log('settings copy, all classes:', allPrompt.split('\n').filter((l) => /^\d\. [A-Z]{3}-\d{3}/.test(l)).length);
await page.select('select[aria-label="Class for the copied prompt"]', esg.id);
await page.$$eval('.settings-card .btn', (els) => els.find((e) => e.textContent.trim() === 'Copy full prompt').click());
await sleep(200);
const onePrompt = await page.evaluate(() => navigator.clipboard.readText());
console.log('settings copy, one class:', onePrompt.split('\n').filter((l) => /^\d\. [A-Z]{3}-\d{3}/.test(l)).join(''), '| note:', await t('.settings-card .hint[style]'));
await browser.close();
