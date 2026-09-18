// Announcements: the bookmark carries them, a sync stores them without approval, Now says one quiet line, the AI pass
// turns one into findings that go through the same approval flow, and an unsynced class never looks clean.
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
const clickText = (sel, re) => page.$$eval(sel, (els, src) => { const b = els.find((e) => new RegExp(src).test(e.textContent)); if (!b) return false; b.click(); return true; }, re.source);

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
  calls.push({ tool, posted: /Posted: \d{4}-\d{2}-\d{2}/.test(user), hasItems: /Planner items already tracked/.test(user) });
  if (tool !== 'announcement_findings') return req.respond({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: `unexpected ${tool}` } }) });
  const input = { summary: 'Goggles Thursday, and the Topic 3 quiz moved.', findings: [
    { kind: 'date_change', title: 'Topic 3 Quiz', date: '2026-09-25', time: '23:59', points: 0, quote: 'the Topic 3 quiz moves to Friday the 25th', confidence: 'high', item_id: '', note: 'It moved later.' },
    { kind: 'info', title: 'Bring goggles', date: '', time: '', points: 0, quote: 'bring your lab goggles on Thursday', confidence: 'high', item_id: '', note: 'Pack them Wednesday night.' },
  ] };
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'tu', name: 'announcement_findings', input }], stop_reason: 'tool_use', usage: { input_tokens: 2400, output_tokens: 260 } }) });
});

await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
let s = await state();
const chm = s.courses.find((c) => c.code === 'CHM-113');
const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }));

// 1. Nothing synced: Now says so rather than implying the picture is complete.
console.log('never synced:', await t('.verify'));

// 2. A bookmark export carrying announcements, handed over the way the real one does.
const iso = (d) => `${d}T15:00:00.000Z`;
const shift = (d, n) => { const x = new Date(`${d}T12:00:00-07:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); };
// One assessment per class so the sync has something to apply; the announcements ride along with it.
const payload = { kind: 'halo-export', version: 1, exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: s.courses.map((c) => ({
  id: `h-${c.id}`, slugId: `s-${c.id}`, classCode: `${c.code}-101`, courseCode: c.code, name: c.name, stage: 'CURRENT', modality: 'ONGROUND', credits: 4, startDate: null, endDate: null,
  assessments: [{ id: `a-${c.id}`, title: `${c.code} Topic 4 Check`, description: 'A short check on Topic 4.', unit: 'Topic 4', unitSequence: 4, sequence: 1, startDate: null, dueDate: new Date(`${shift(today, 5)}T23:59:00-07:00`).toISOString(), points: 20, type: 'ASSIGNMENT', tags: [], inPerson: false, isGroupEnabled: false, requiresLopesWrite: false, status: 'ACTIVE', submittedAt: null, score: null }],
  announcements: c.code !== 'CHM-113' ? [] : [
    { id: 'ann-1', forumId: 'f1', title: 'Week 4: goggles and a date change', content: '<p>Everyone, <b>bring your lab goggles on Thursday</b> — we are doing the flame test. Also the Topic 3 quiz moves to Friday the 25th.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: true, acknowledged: false, resources: [{ id: 'r1', name: 'FlameTest_Prelab.pdf', kind: 'FILE', type: 'application/pdf' }] },
    { id: 'ann-2', forumId: 'f1', title: 'Office hours moved', content: '<p>Office hours are in 214 this week.</p>', publishedAt: iso('2026-09-14'), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
  ],
})) };
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
await page.waitForSelector('.modal .diff-section, .modal .modal-actions', { timeout: 8000 });
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await page.waitForFunction(() => document.querySelector('.modal')?.textContent.includes('Applied'), { timeout: 8000 });
await sleep(600);
console.log('applied summary:', (await all('.modal li')).find((x) => /announcement/.test(x)));
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(400);

// 3. Now: one quiet line, without a reload, because the sync tells it to look again.
await sleep(900);
console.log('unread line:', await t('.now-news'));
console.log('verify now:', await t('.verify'));

// 4. Reading one: the pass gets the posting date and the planner list; findings go through the approval flow.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.goto(`${BASE}#/news`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.news-item', { timeout: 8000 });
console.log('list:', (await all('.news-title')).join(' | '), '| unread marks:', await page.$$eval('.news-dot', (e) => e.length));
await page.$$eval('.news-head', (els) => els[0].click());
await sleep(400);
console.log('body:', (await t('.news-text'))?.slice(0, 80), '| attached:', (await all('.news-body .hint')).find((x) => /Attached/.test(x)));
await clickText('.news-body .btn', /What does this change/);
await page.waitForSelector('.modal .rev-mentions', { timeout: 10000 });
console.log('call:', JSON.stringify(calls[0]));
console.log('findings:', (await all('.modal .rev-mentions li')).map((x) => x.slice(0, 70)).join(' || '));
await page.screenshot({ path: (process.argv[2] ?? 'news.png').replace(/\.png$/, '-review.png'), fullPage: false });
// Approving one writes it to the planner through the same flow as a lecture finding.
const before = await state();
console.log('approve buttons:', (await all('.modal .rev-mentions .btn')).join(' | '));
await clickText('.modal .rev-mentions .btn', /Add it|Approve move/);
await sleep(700);
const after = await state();
const changed = after.items.filter((i) => { const b = before.items.find((x) => x.id === i.id); return !b || b.dueAt !== i.dueAt; }).map((i) => `${i.label} → ${i.dueAt.slice(0, 10)}`);
console.log('written to the planner:', changed.join(', ') || '(nothing)', '| items', before.items.length, '→', after.items.length);
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(400);
// Read once: it stays read, and the finding count shows instead of the button.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.news-item', { timeout: 8000 });
console.log('unread marks after reading:', await page.$$eval('.news-dot', (e) => e.length));
await page.$$eval('.news-head', (els) => els[0].click());
await sleep(300);
console.log('already read:', (await all('.news-body .btn')).join(' | '));
console.log('second call made:', calls.length);
await browser.close();
