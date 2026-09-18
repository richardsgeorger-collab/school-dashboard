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
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const clickText = (sel, re) => page.$$eval(sel, (els, src) => { const b = els.find((e) => new RegExp(src).test(e.textContent)); if (!b) return false; b.click(); return true; }, re.source);

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
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'tu', name: 'announcement_actions', input }], stop_reason: 'tool_use', usage: { input_tokens: 1800, output_tokens: 180 } }) });
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
console.log('prompt on News:', (await t('.news-readall'))?.slice(0, 110));
const opened = await clickText('.news-readall .btn', /Read all/);
await sleep(700);
console.log('clicked Read all:', opened, '| disabled:', await page.$eval('.news-readall .btn', (e) => e.disabled).catch(() => 'n/a'), '| modals:', await page.$$eval('.modal', (e) => e.length).catch(() => 0));
console.log('modal offers:', (await all('.modal .hint')).join(' // '));
console.log('modal buttons:', (await all('.modal .btn')).join(' | '));
const pressed = await clickText('.modal .modal-actions .btn.primary', /Read \d/);
console.log('pressed Read:', pressed);
await sleep(2500);
console.log('after press:', (await all('.modal .hint')).join(' // ').slice(0, 200));
await page.waitForFunction(() => /Read \d+ announcement/.test(document.querySelector('.modal-body')?.textContent ?? ''), { timeout: 15000 });
await sleep(400);
console.log('result:', await t('.modal-body b'));
console.log('per class:', (await all('.modal .readall-class .section-title')).join(' | '));
console.log('quotes shown:', (await all('.modal .reqs-src')).length);
console.log('calls made:', seen.length, '| titles:', seen.map((x) => x.title).join(', '), '| tool:', [...new Set(seen.map((x) => x.tool))].join(','));
await clickText('.modal .modal-actions .btn.primary', /Done/);
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

await browser.close();
