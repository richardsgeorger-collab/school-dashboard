// Now, redesigned: one status line, one piece of work with everything needed to start it, no list. Blocked is not
// snoozed (it leaves Now, comes back on its own, and turns into a chase line when the deadline closes in); Start runs
// a timer that logs the real time on Done without asking; the starter prompt copies and hands off to the tutor;
// a transcript pasted on the class page becomes a searchable recording read by the lecture pass.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'now.png').replace(/\.png$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const setState = (s) => page.evaluate((v) => localStorage.setItem('school-dashboard:v1', JSON.stringify(v)), s);
const clickText = (sel, re) => page.$$eval(sel, (els, src) => { const b = els.find((e) => new RegExp(src).test(e.textContent)); if (!b) return false; b.click(); return true; }, re.source);

// The lecture pass answered with a canned lecture_notes reply; anything else is refused.
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const calls = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  const tool = body.tool_choice?.name ?? 'text';
  const user = typeof body.messages?.at(-1)?.content === 'string' ? body.messages.at(-1).content : '';
  calls.push({ tool, user: user.slice(0, 80), deckOutline: /Slide outline for the day/.test(user), timed: /\[\d+:\d\d\]/.test(user) });
  if (tool === 'lecture_notes') {
    const input = { summary: ['Mole ratios come from the balanced equation.'], concepts: ['mole ratio', 'limiting reagent'], mentions: [{ quote: 'the quiz on Friday covers this', kind: 'info', title: 'Quiz', date: null, time: null, points: null, confidence: 'medium', itemId: null }], emphasized: [{ point: 'Convert to moles before comparing', quote: 'always convert to moles first', at: '' }], exam_flags: [{ point: 'Limiting reagent will be on Exam 1', quote: 'this is on the exam', at: '' }], dwelt: [], skipped: [], terms: [{ term: 'limiting reagent', meaning: 'the reactant that runs out first' }] };
    return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 'tu', name: 'lecture_notes', input }], stop_reason: 'tool_use', usage: { input_tokens: 3000, output_tokens: 400 } }) });
  }
  if (tool === 'text') return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'text', text: 'Start by picking one artifact from the topic list. Which one interests you? [S1]' }], stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 40 } }) });
  return req.respond({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: `unexpected ${tool}` } }) });
});

await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle0' });
let s = await state();
const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }));
const shift = (d, n) => { const x = new Date(`${d}T12:00:00-07:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); };
const eng = s.courses.find((c) => c.code === 'ENG-105');
const chm = s.courses.find((c) => c.code === 'CHM-113');
// A clean slate: nothing overdue, one big paper with a plan, a small post, a lab that will be blocked.
for (const i of s.items) if (i.dueAt.slice(0, 10) < today) { i.status = 'done'; i.completedAt = i.dueAt; }
const mk = (id, courseId, title, label, d, points, type, minutes) => ({ id, courseId, title, label, labelOverridden: true, type, points, opensAt: null, dueAt: `${d}T23:59:00-07:00`, estimatedMinutes: minutes, estimateOverridden: true, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'manual', award: null, updatedAt: new Date().toISOString() });
const paper = { ...mk('e2e-ra', eng.id, 'Final Draft of a Rhetorical Analysis', 'Eng Rhetorical Analysis', shift(today, 1), 175, 'paper', 300), url: 'https://halo.gcu.edu/courses/x/assessments/y', flags: { inClass: false, group: false, lopesWrite: true, timed: false, practice: false }, plan: { asks: 'A 1,200-word rhetorical analysis of one artifact from the topic list: audience, purpose, and ethos, pathos, logos, with the artifact and two sources cited in APA.', startBy: null, minutes: null, milestones: ['Pick the artifact', 'Note its audience and purpose', 'Find the three appeals', 'Outline', 'Draft', 'Cite in APA'], prerequisites: [{ text: 'Claim your artifact in the Topic 3 forum.', source: 'announcement Sep 12', itemId: null }], flags: { lopesWrite: true, timed: false, group: false, inPerson: false }, topics: ['rhetorical appeals'], feeds: null, sources: [{ kind: 'syllabus', label: 'ENG-105 syllabus', href: `#/library?c=${eng.id}` }], citations: [], model: 'm', at: '', inputHash: 'h' }, brief: { asks: ['Analyze one artifact.'], rubric: [{ criterion: 'Thesis', points: 20, how: 'A clear arguable claim.' }, { criterion: 'Appeals', points: 30, how: 'Ethos, pathos, logos with evidence.' }, { criterion: 'APA', points: 10, how: '' }], steps: [], at: '', source: 'claude' } };
const lab = { ...mk('e2e-lab', chm.id, 'CLC Lab 2 Report', 'Chem Lab 2 Report', shift(today, 2), 50, 'lab', 120), flags: { inClass: false, group: true, lopesWrite: false, timed: false, practice: false } };
const post = mk('e2e-dq', eng.id, 'Topic 3 DQ 1', 'Eng DQ 3.1', shift(today, 3), 5, 'discussion', 25);
s.items.push(paper, lab, post);
await setState(s);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero', { timeout: 8000 });
await sleep(600);

// 1. The hero answers "what do I do in the next ten minutes": asks, facts, first step, needs-first, covered-by, starter, Halo.
console.log('status:', await t('.now-status'));
console.log('no then list:', !(await page.$('.then')), '| next class line:', await t('.nextclass-line'));
console.log('hero:', await t('.hero-title'), '| eyebrow:', await t('.hero-eyebrow'));
console.log('asks:', await t('.hero-asks'));
console.log('facts:', await t('.hero-facts'));
console.log('first step:', await t('.hero-first-step'), '| fold:', await t('.hero-fold'));
console.log('needs first:', (await all('.hero-line')).find((x) => x.startsWith('Needs first')));
console.log('full credit:', (await all('.hero-line')).find((x) => x.startsWith('Full credit')));
console.log('covered by:', await t('.hero-covers'));
console.log("starter buttons:", (await all(".hero-starter .btn")).join(" | "), '| halo link:', await page.$eval('.hero-halo', (e) => e.getAttribute('href')).catch(() => null));
console.log('actions:', (await all('.hero-actions .hero-btn')).join(' | '), '| secondary:', (await all('.hero-secondary .hero-skip')).join(' | '));
console.log('red anywhere:', await page.$$eval('.hero *', (els) => els.some((e) => /rgb\(2[0-9][0-9], [0-9]{1,2}, [0-9]{1,2}\)/.test(getComputedStyle(e).color))));
await page.screenshot({ path: `${out}-hero.png`, fullPage: false });

// 2. Tick the first step: the next one takes its place; the fold shows the checklist with the next called out.
if (!(await page.$('.hero-first-step'))) { console.log('NO FIRST STEP on hero', await t('.hero-title')); await browser.close(); process.exit(1); }
await page.$eval('.hero-first-step input', (e) => e.click());
await sleep(300);
console.log('after tick:', await t('.hero-first-step'), '| fold:', await t('.hero-fold'));
await page.$eval('.hero-fold', (e) => e.click());
await sleep(200);
console.log('checklist:', (await page.$$eval('.hero-steps-list li', (els) => els.map((e) => `${e.dataset.done === 'true' ? '✓' : e.dataset.next === 'true' ? '→' : '·'} ${e.textContent.trim()}`))).join(' | '));

// 3. Copy the starter prompt (clipboard is faked), then hand it to the tutor, which sends it as the first turn.
await page.evaluate(() => { window.__copied = ''; navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; });
// The starter actions live behind More now.
await clickText('.hero-secondary .hero-skip', /More/);
await sleep(150);
await clickText('.hero-secondary .hero-skip', /Copy a short prompt/);
await sleep(200);
const copied = await page.evaluate(() => window.__copied);
console.log('starter prompt:', copied.split('\n')[0], '| has rubric:', /Thesis \(20 pts\)/.test(copied), '| has the line:', /Do not write any of it for me/.test(copied), '| chars:', copied.length);
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await clickText('.hero-secondary .hero-skip', /Ask the tutor/);
await page.waitForSelector('.tutor-msg[data-role="assistant"] .tutor-text', { timeout: 10000 });
console.log('tutor first turn (user):', (await all('.tutor-msg[data-role="user"] .tutor-text'))[0]?.slice(0, 70), '| reply:', (await all('.tutor-msg[data-role="assistant"] .tutor-text'))[0]?.slice(0, 60));
console.log('handed once:', calls.filter((c) => c.tool === 'text').length === 1);

// 4. Start runs a timer; Done logs the real time without asking.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.hero', { timeout: 8000 });
await clickText('.hero-actions .hero-btn', /^Start$/);
await sleep(300);
console.log('started:', await t('.hero-eyebrow-right'), '| actions now:', (await all('.hero-actions .hero-btn')).join(' | '));
s = await state();
s.items = s.items.map((i) => (i.id === 'e2e-ra' ? { ...i, startedAt: new Date(Date.now() - 23 * 60_000).toISOString() } : i));
await setState(s);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero', { timeout: 8000 });
console.log('after 23 min:', await t('.hero-eyebrow-right'));
await clickText('.hero-actions .hero-btn', /Done/);
await sleep(600);
s = await state();
console.log('logged without asking:', s.items.find((i) => i.id === 'e2e-ra')?.actualMinutes, 'min | time ask shown:', !!(await page.$('.time-ask')));
// The finished paper lingers for its check-off; the next thing takes its place after that.
await sleep(2000);
console.log('new hero after the linger:', await t('.hero-title'));

// 5. Blocked is not snoozed: the hero leaves Now, is not counted, shows as waiting, and comes back on its own.
const victim = await t('.hero-title');
console.log('hero before block:', victim);
await clickText('.hero-secondary .hero-skip', /More/);
await sleep(150);
console.log('block click:', await clickText('.hero-secondary .hero-skip', /Can.t do this yet/));
await sleep(300);
console.log('block reasons:', (await all('.hero-chooser .btn')).join(' | '));
await page.type('.hero-chooser-note', 'partner has the data');
await clickText('.hero-chooser .btn', /partner/);
await sleep(500);
s = await state();
const blocked = s.items.find((i) => i.label === victim);
console.log('block written:', JSON.stringify(blocked?.blocked), '| hero now:', await t('.hero-title'), '| status:', await t('.now-status'));
console.log('waiting line:', await t('.now-waiting'));
// Its real deadline closes in: the wait is no longer someone else's problem.
s.items = s.items.map((i) => (i.id === blocked.id ? { ...i, dueAt: `${shift(today, 1)}T23:59:00-07:00`, blocked: { ...i.blocked, until: shift(today, 1) } } : i));
await setState(s);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero', { timeout: 8000 });
console.log('chase line:', await t('.now-chase'));
await page.screenshot({ path: `${out}-blocked.png`, fullPage: false });
await clickText('.now-chase .hero-inline', /unblocked/);
await sleep(500);
console.log('after unblock, hero:', await t('.hero-title'), '| chase gone:', !(await page.$('.now-chase')));
// The wait runs out on its own: back on Now with a reminder of what it was waiting on.
s = await state();
// Due today so it is the hero again, with the block's wait already run out.
s.items = s.items.map((i) => (i.id === blocked.id ? { ...i, dueAt: `${today}T23:59:00-07:00`, blocked: { reason: 'partner', note: '', since: new Date().toISOString(), until: shift(today, -1) } } : i));
await setState(s);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero', { timeout: 8000 });
console.log('ran out:', (await all('.hero-line')).find((x) => /You were waiting/.test(x)));
// A block from an older shape (no reason) must not take the screen down.
s = await state();
s.items = s.items.map((i) => (i.id === blocked.id ? { ...i, blocked: { until: shift(today, 1) } } : i));
await setState(s);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero', { timeout: 8000 });
console.log('odd block survives:', !!(await page.$('.hero')), '|', await t('.now-chase'));
s.items = s.items.map((i) => (i.id === blocked.id ? { ...i, blocked: null } : i));
await setState(s);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero', { timeout: 8000 });

// 6. Not today still works and records the day.
await clickText('.hero-secondary .hero-skip', /More/);
await sleep(150);
await clickText('.hero-secondary .hero-skip', /Not today/);
await sleep(200);
const opts = await all('.hero-chooser .btn');
console.log('not-today options:', opts.join(' | '));
const heroTitle = await t('.hero-title');
if (opts.length) {
  await page.$$eval('.hero-chooser .btn', (els) => els[0].click());
  await sleep(300);
  s = await state();
  const it = s.items.find((i) => i.label === heroTitle);
  console.log('after pick:', heroTitle, JSON.stringify({ snoozedUntil: it?.snoozedUntil, startByOverride: it?.startByOverride }), '| new hero:', await t('.hero-title'));
}

// 7. Paste a transcript on the class page: stored as a recording, read by the lecture pass, reviewed in place.
await page.goto(`${BASE}#/class?c=${chm.id}`, { waitUntil: 'networkidle0' });
console.log('class page leads with:', (await all('.lib-head .btn'))[0]);
await clickText('.lib-head .btn', /Paste a lecture transcript/);
await page.waitForSelector('.paste-transcript', { timeout: 5000 });
await page.type('.paste-transcript', 'Today we are doing stoichiometry. Mole ratios come from the balanced equation, always convert to moles first before you compare anything. The limiting reagent is the reactant that runs out first, and yes, this is on the exam. The quiz on Friday covers this. '.repeat(3));
console.log('word count line:', await t('.modal .hint.mono'));
await clickText('.modal .modal-actions .btn.primary', /Save and read it/);
await page.waitForSelector('.rev-knowledge', { timeout: 15000 });
console.log('lecture pass called:', calls.some((c) => c.tool === 'lecture_notes'), '| review shows:', (await all('.rev-knowledge h3')).join(' | '));
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(600);
const recs = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('school-dashboard-recordings'); r.onsuccess = () => { const db = r.result; const tx = db.transaction(['recordings', 'segments']); tx.objectStore('recordings').getAll().onsuccess = (e) => { const list = e.target.result; tx.objectStore('segments').getAll().onsuccess = (e2) => res({ recs: list.map((x) => ({ title: x.title, source: x.transcriptSource, audio: !x.audioDeleted, segs: x.segmentCount, flags: x.notes?.knowledge?.examFlags?.length ?? 0 })), segments: e2.target.result.length }); }; }; }));
console.log('stored:', JSON.stringify(recs));
await page.goto(`${BASE}#/library?c=${chm.id}&search=1`, { waitUntil: 'networkidle0' });
console.log('library class page leads with:', (await all('.lib-head .btn'))[0]);
await browser.close();
