// Announcements carry graded requirements the assignment never mentions. This drives the whole path: read all 3 posts,
// attach parts to the work they belong to, keep the one that fits no category as a class note, put a part with its own
// deadline on the calendar, and say the thing on Now that would otherwise be missed.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (/autoread/.test(m.text())) console.log('PAGE:', m.text()); });
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const clickText = (sel, re) => page.$$eval(sel, (els, src) => { const b = els.find((e) => new RegExp(src).test(e.textContent)); if (!b) return false; b.click(); return true; }, re.source);

let outOfCredits = false;
const shiftDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); };
const SOON2 = shiftDay(2);
const SOON3 = shiftDay(3);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const seen = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  const user = typeof body.messages?.at(-1)?.content === 'string' ? body.messages.at(-1).content : '';
  const title = (user.match(/^Title: (.+)$/m) ?? [])[1] ?? '';
  seen.push({ tool: body.tool_choice?.name, title, sawItems: /planner items/i.test(user) });
  // The id of the discussion this class already has, so the model can attach rather than duplicate.
  const dqId = (user.match(/^(\S+) · Topic 4 DQ 1 /m) ?? [])[1] ?? '';
  if (outOfCredits && body.tool_choice?.name === 'announcement_actions') {
    return req.respond({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }) });
  }
  if (body.tool_choice?.name === 'announcement_actions' && /AUTO/.test(title)) {
    const auto = {
      'AUTO new work': [{ kind: 'new_work', applies_to: '', what: 'Submit the Topic 3 reflection.', due: SOON3, time: '', points: 20, graded: true, changes_what_done_means: false, quote: 'a reflection is due the following Monday', confidence: 'high' }],
      'AUTO date move': [{ kind: 'date_change', applies_to: dqId, what: 'Topic 4 DQ 1 now closes Wednesday.', due: SOON2, time: '', points: 0, graded: true, changes_what_done_means: false, quote: 'the DQ now closes Wednesday', confidence: 'high' }],
      'AUTO removal': [{ kind: 'date_change', applies_to: dqId, what: 'Topic 4 DQ 1 is cancelled this week.', due: '', time: '', points: 0, graded: true, changes_what_done_means: false, quote: 'we are dropping the DQ', confidence: 'medium' }],
    }[title] ?? [];
    return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 'tu', name: 'announcement_actions', input: { summary: `Read: ${title}`, actions: auto } }], stop_reason: 'tool_use', usage: { input_tokens: 900, output_tokens: 90 } }) });
  }
  const per = {
    'Replies count': [
      { kind: 'requirement', applies_to: dqId, what: 'Reply to at least two classmates on Topic 4 DQ 1.', due: '', time: '', points: 0, graded: true, changes_what_done_means: true, quote: 'your discussion grade includes replying to two classmates', confidence: 'high' },
    ],
    'Bring the printed rubric': [
      { kind: 'requirement', applies_to: dqId, what: 'Bring a printed copy of the rubric to class.', due: '2099-01-05', time: '09:00', points: 0, graded: true, changes_what_done_means: false, quote: 'bring a printed copy of the rubric', confidence: 'high' },
      { kind: 'note', applies_to: '', what: 'Buy the lab manual from the bookstore, not the online edition.', due: '', time: '', points: 0, graded: false, changes_what_done_means: false, quote: 'the bookstore copy is the one we use', confidence: 'medium' },
    ],
    'Office hours': [],
  }[title] ?? [];
  const input = { summary: `Read: ${title}`, actions: per };
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 'tu', name: 'announcement_actions', input }], stop_reason: 'tool_use', usage: { input_tokens: 1800, output_tokens: 180 } }) });
});

await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.reload({ waitUntil: 'networkidle0' });
const s = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const chm = s.courses.find((c) => c.code === 'CHM-113');
const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }));
const iso = (d) => new Date(`${d}T12:00:00Z`).toISOString();

// A discussion for the announcements to attach to, plus a bare participation item that should stay hidden.
await page.evaluate((cid, dueAt) => {
  const raw = JSON.parse(localStorage.getItem('school-dashboard:v1'));
  raw.items.push({ id: 'dq-e2e', courseId: cid, title: 'Topic 4 DQ 1', label: 'Chem DQ 4', type: 'discussion', points: 5, dueAt, status: 'todo', estimateMin: 30, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  raw.items.push({ id: 'part-e2e', courseId: cid, title: 'Week 4 Participation', label: 'Chem Participation 4', type: 'participation', points: 10, dueAt, status: 'todo', estimateMin: 0, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  localStorage.setItem('school-dashboard:v1', JSON.stringify(raw));
}, chm.id, iso(today));
// The store holds its own copy, so it has to reload to see items written underneath it.
await page.reload({ waitUntil: 'networkidle0' });
await sleep(400);

// Three announcements: two carry requirements, one is pure news.
const payload = {
  kind: 'halo-export', version: 1, build: 'e2e', exportedAt: new Date().toISOString(), source: 'bookmarklet',
  classes: [{
    id: `h-${chm.id}`, slugId: 'X', classCode: `${chm.code}-X`, courseCode: chm.code, name: chm.name, instructors: [],
    startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [],
    announcements: [
      { id: 'a-replies', forumId: 'f1', title: 'Replies count', content: '<p>Remember your discussion grade includes replying to two classmates.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
      { id: 'a-rubric', forumId: 'f1', title: 'Bring the printed rubric', content: '<p>Please bring a printed copy of the rubric. Also the bookstore copy is the one we use.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
      { id: 'a-news', forumId: 'f1', title: 'Office hours', content: '<p>Office hours are in 214 this week.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
    ],
    resources: [], discussions: [], messages: [],
  }], alerts: [], problems: [],
};
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await sleep(900);
await page.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Close|Cancel/.test(e.textContent)) ?? els[0]).click());
await sleep(500);

// 1. Read them all.
await page.goto(`${BASE}#/news`, { waitUntil: 'networkidle0' });
await sleep(500);
// The first sync already read them automatically, so the backlog button has nothing left to do.
console.log('prompt on News:', (await t('.news-readall'))?.slice(0, 120));
console.log('auto-read on the sync itself:', seen.map((x) => x.title).join(', '));
await clickText('.news-readall .btn', /Read all/);
await sleep(700);
console.log('backlog modal offers:', (await all('.modal .hint.mono')).join(' // '));
await clickText('.modal .modal-actions .btn', /Not now/);
await sleep(400);

// 2. The parts are on the assignment, with their source.
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const dq = after.items.find((i) => i.id === 'dq-e2e');
console.log('parts on the item:', (dq.requirements ?? []).map((r) => r.text).join(' | '));
console.log('graded flags:', (dq.requirements ?? []).map((r) => r.gradedOn).join(','), '| own deadline:', (dq.requirements ?? []).map((r) => !!r.dueAt).join(','));
console.log('quote kept:', (dq.requirements ?? [])[0]?.source?.quote);
console.log('class note kept:', (after.courses.find((c) => c.id === dq.courseId).notes ?? []).map((n) => n.text).join(' | '));

// 3. Now says the thing the assignment does not mention.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await sleep(700);
console.log('Now line:', await t('.now-missed'));

// 4. The calendar carries the part with its own deadline.
await page.goto(`${BASE}#/calendar?v=agenda`, { waitUntil: 'networkidle0' });
await sleep(700);
console.log('calendar parts:', (await all('.req-row-text')).join(' | ') || '(none)');

// 5. The item page shows the checklist, and ticking it closes the loop.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await sleep(700);
await clickText('.now-missed .hero-inline', /open it/);
await sleep(700);
console.log('checklist heading:', await t('.reqs .hint'));
console.log('checklist rows:', (await all('.reqs-list .reqs-text')).join(' | '));
await page.click('.reqs-list li:first-child input[type=checkbox]');
await sleep(900);
console.log('after ticking one:', await t('.reqs .hint'));
const ticked = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.id === 'dq-e2e').requirements.map((r) => r.done));
console.log('stored done flags:', ticked.join(','));
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await sleep(800);
console.log('Now after ticking:', (await t('.now-missed'))?.slice(0, 80) ?? '(gone, as it should be)');

// 6. Participation: hidden while bare, shown once something says what earns it.
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
console.log('bare participation has no parts:', (before.items.find((i) => i.id === 'part-e2e').requirements ?? []).length === 0);


// 7. AUTOMATIC: a second sync carrying three new posts must put their findings on the agenda without a button.
const nBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.length);
const auto = {
  kind: 'halo-export', version: 1, build: 'e2e', exportedAt: new Date().toISOString(), source: 'bookmarklet',
  classes: [{
    id: `h-${chm.id}`, slugId: 'X', classCode: `${chm.code}-X`, courseCode: chm.code, name: chm.name, instructors: [],
    startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [],
    announcements: [
      { id: 'auto-1', forumId: 'f1', title: 'AUTO new work', content: '<p>A reflection is due the following Monday.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
      { id: 'auto-2', forumId: 'f1', title: 'AUTO date move', content: '<p>The DQ now closes Wednesday.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
      { id: 'auto-3', forumId: 'f1', title: 'AUTO removal', content: '<p>We are dropping the DQ.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
    ],
    resources: [], discussions: [], messages: [],
  }], alerts: [], problems: [],
};
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await sleep(400);
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), auto);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await page.waitForFunction(() => /From your announcements/.test(document.querySelector('.modal-body')?.textContent ?? ''), { timeout: 20000 }).catch(() => {});
await sleep(800);
console.log('AUTO calls seen:', seen.filter((x) => /AUTO/.test(x.title)).map((x) => x.title).join(', ') || '(none)');
console.log('modal text:', (await t('.modal-body'))?.slice(0, 320));
console.log('auto line:', (await all('.modal .pull-tally')).find((x) => /From your announcements/.test(x)));
const state7 = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
console.log('items before/after:', nBefore, '->', state7.items.length);
const made = state7.items.find((i) => /Topic 3 reflection/.test(i.title));
console.log('new work created:', !!made, '| origin:', made?.origin?.kind, '| points:', made?.points);
const dq2 = state7.items.find((i) => i.id === 'dq-e2e');
console.log('date moved:', dq2.dueAt.slice(0, 10), '| was:', dq2.dateChange?.from?.slice(0, 10));
console.log('removal NOT applied (item still there):', !!dq2);
await page.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Close|Cancel/.test(e.textContent)) ?? els[0]).click());
await sleep(500);
await page.goto(`${BASE}#/calendar?v=agenda`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await sleep(700);
console.log('badge on the agenda:', (await all('.flag-origin')).length > 0);
console.log('struck-through old date:', (await all('.item-was')).join(' | ') || '(none)');


// 8. THE REAL CASE: out of credits during an automatic sync. A failed read must never render as a clean result.
outOfCredits = true;
const broke = {
  ...auto,
  exportedAt: new Date().toISOString(),
  classes: [{ ...auto.classes[0], announcements: [
    { id: 'broke-1', forumId: 'f1', title: 'AUTO broke one', content: '<p>Something is due.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
    { id: 'broke-2', forumId: 'f1', title: 'AUTO broke two', content: '<p>Something else is due.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
  ] }],
};
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await sleep(400);
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), broke);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await page.waitForFunction(() => /could not be read/.test(document.querySelector('.modal-body')?.textContent ?? ''), { timeout: 25000 }).catch(() => {});
await sleep(600);
const failLine = (await all('.modal .hint')).find((x) => /could not be read/.test(x));
console.log('failure line:', failLine);
console.log('claims nothing:', /nothing/i.test(failLine ?? ''), '| says the reason:', /out of credit/i.test(failLine ?? ''));
const body8 = (await t('.modal-body')) ?? '';
console.log('never says asks anything of you:', !/asks anything of you/i.test(body8));
await page.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Close|Cancel/.test(e.textContent)) ?? els[0]).click());
await sleep(500);

// And the next sync that can read them does, because a failed post was never stamped.
outOfCredits = false;
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: { ...p, exportedAt: new Date().toISOString() }, source: window })), broke);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
// Wait for the retry to finish and stamp, rather than racing it.
await page.waitForFunction(() => /asks anything of you|From your announcements/.test(document.querySelector('.modal-body')?.textContent ?? ''), { timeout: 20000 }).catch(() => {});
await sleep(1200);
console.log('retried after credits returned:', seen.filter((x) => /AUTO broke/.test(x.title)).length, 'reads of the two broken posts');
await page.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Close|Cancel/.test(e.textContent)) ?? els[0]).click());
await sleep(400);


// 9. THE BACKLOG. A post that arrived before the automatic pass existed must be read by the next sync, and a
// second read of it must never make a second copy of what it already created.
const backlogItems = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.length);
// Put a post in the store with no read stamp, the way anything pulled before auto-read looks.
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('school-dashboard-announcements'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction('posts', 'readwrite');
  const existing = await new Promise((res) => { const r = tx.objectStore('posts').getAll(); r.onsuccess = () => res(r.result); });
  const any = existing[0];
  tx.objectStore('posts').put({ ...any, id: 'stranded', title: 'AUTO new work', actionsAt: null, actionsModifiedAt: null, modifiedAt: null, actionsSummary: null, actionCount: null });
  await new Promise((res) => { tx.oncomplete = res; });
});
// A sync carrying nothing new at all.
const empty = { ...auto, exportedAt: new Date().toISOString(), classes: [{ ...auto.classes[0], announcements: [] }] };
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await sleep(400);
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), empty);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await page.waitForFunction(() => /announcement/.test(document.querySelector('.modal-body')?.textContent ?? ''), { timeout: 20000 }).catch(() => {});
await sleep(1200);
console.log('backlog read on a sync that carried nothing:', /Read \d+ announcement/.test((await t('.modal-body')) ?? ''));
const line9 = (await all('.modal .hint')).find((x) => /From your announcements|asks anything|could not be read/.test(x));
console.log('backlog line:', line9?.slice(0, 160));
const after9 = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.length);
console.log('items before/after backlog read:', backlogItems, '->', after9, '| no duplicate:', after9 === backlogItems);
await page.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Close|Cancel/.test(e.textContent)) ?? els[0]).click());
await sleep(400);

// And a third sync reads nothing, because everything is stamped.
const callsBefore = seen.length;
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: { ...p, exportedAt: new Date().toISOString() }, source: window })), empty);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await sleep(1800);
console.log('third sync made', seen.length - callsBefore, 'reads (want 0)');

await browser.close();
