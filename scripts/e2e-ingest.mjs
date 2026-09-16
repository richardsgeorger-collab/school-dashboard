// The AI ingestion layer end to end, with api.anthropic.com answered by canned class_plan and term_plan tool calls
// built from the request itself: the compare screen for ENG-105, the review, an unchecked start remembered, apply,
// the item carrying its AI provenance, the class switched to the AI version, undo offered, the cached pass reused.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'ingest.png').replace(/\.png$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shift = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const reply = (name, input) => JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'tu_1', name, input }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 41000, output_tokens: 3800, cache_creation_input_tokens: 30000, cache_read_input_tokens: 0 } });
const calls = [];
// The canned passes read the refs out of the prompt, so they fit whatever the seed holds.
function classPlan(user) {
  const items = [];
  const re = /\[(A\d+)\] "([^"]+)" · (\w+) · due (\d{4}-\d{2}-\d{2})[^\n]*?· (\d+) pts/g;
  let m;
  while ((m = re.exec(user))) {
    const [, ref, title, type, due, pts] = m;
    const big = Number(pts) >= 100 || type === 'paper' || type === 'project';
    const post = type === 'discussion';
    items.push({
      ref,
      asks: big ? `A ${title.toLowerCase().includes('draft') ? 'draft' : 'finished piece'} with sources in APA, run through LopesWrite.` : post ? 'One post answering the prompt and two replies.' : `Do ${title} as described.`,
      start_by: { date: shift(due, big ? -10 : post ? -1 : -3), why: big ? 'Reading, two sources, a draft, and a day for LopesWrite need ten days.' : post ? 'A post; the day before is enough.' : 'Three evenings covers it.', confidence: big ? 'medium' : 'high' },
      minutes: { value: big ? 240 : post ? 30 : 60, why: big ? 'Four hours for the words and the sources.' : 'Short.', confidence: 'medium' },
      milestones: big ? ['Pick the issue', 'Find two sources', 'Outline', 'Draft', 'Run LopesWrite'] : [],
      prerequisites: [],
      flags: { lopes_write: big, timed: false, group: false, in_person: false },
      topics: big ? ['argument', 'rhetorical appeals'] : ['course basics'],
      feeds: null,
      sources: big ? [{ kind: 'syllabus', label: 'ENG-105 syllabus' }] : [],
      citations: ['Halo description'],
    });
  }
  return { items, discovered: [{ title: 'Peer review day', due: null, due_time: null, points: null, type: 'other', quote: 'Peer review happens in class.', source: 'syllabus', confidence: 'medium', why: 'In-class work.' }, { title: 'Reading response 1', due: shift(items[0]?.start_by.date ?? '2026-09-20', 20), due_time: null, points: 10, type: 'homework', quote: 'Reading response 1 is due in week five.', source: 'syllabus', confidence: 'high', why: 'Not in Halo.' }], topics: [{ name: 'rhetorical appeals', week: 2, builds_on: [] }, { name: 'argument', week: 5, builds_on: ['rhetorical appeals'] }], notes: 'Every paper leans on the appeals deck.' };
}
function termPlan(user) {
  const starts = [];
  const re = /\[(T\d+)\] ([A-Z]{2,4}-\d{3}L?) · "([^"]+)" · (\w+) · due (\d{4}-\d{2}-\d{2}) · (\d+) pts · (\d+) min · ([a-z ]+?)( · fixed)?(?: ·|$)/gm;
  let m;
  let firstBig = null;
  while ((m = re.exec(user))) {
    const [, ref, code, , , due, pts, , , fixed] = m;
    if (fixed) continue;
    const big = Number(pts) >= 100;
    if (big && !firstBig) firstBig = due;
    starts.push({ ref, start_by: shift(due, big ? -12 : -2), why: big ? `${code} lands the same week as other big work.` : 'as the class pass said', confidence: big ? 'medium' : 'high' });
  }
  const weekOf = firstBig ?? '2026-10-11';
  return { starts, weeks: [{ week_start: weekOf, load: 'brutal', why: 'a paper and an exam' }], chains: [] };
}
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  const tool = body.tool_choice?.name;
  const user = typeof body.messages?.[0]?.content === 'string' ? body.messages[0].content : '';
  calls.push({ tool: tool ?? 'text', chars: user.length, system: Array.isArray(body.system) ? body.system.map((b) => [b.text.length, !!b.cache_control]) : [[String(body.system ?? '').length, false]] });
  const input = tool === 'class_plan' ? classPlan(user) : tool === 'term_plan' ? termPlan(user) : null;
  if (!input) return req.respond({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'unexpected tool' } }) });
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: reply(tool, input) });
});

await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
let s = await state();
const eng = s.courses.find((c) => c.code === 'ENG-105');
const engItems = s.items.filter((i) => i.courseId === eng.id);
console.log('seed ENG-105 items:', engItems.length);

// 1. No key: the screen says what it needs and offers nothing to run.
await page.goto(`${BASE}#/ingest?c=${eng.id}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.ingest-status', { timeout: 5000 });
console.log('no key:', await t('.ingest-status .hint'), '| run button:', !!(await page.$('.ingest-status .btn.primary')));

// 2. With a key: the cost line, then the pass, then the comparison.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => /about \d+k tokens/.test(document.querySelector('.ingest-status')?.textContent ?? ''), { timeout: 8000 });
console.log('cost line:', await t('.ingest-status .hint'));
console.log('status:', await t('.lib-head .hint'));
await page.click('.ingest-status .btn.primary');
await page.waitForSelector('.ingest-summary', { timeout: 15000 });
console.log('summary:', await t('.ingest-summary'));
console.log('calls:', JSON.stringify(calls));
console.log('rows:', await page.$$eval('.ingest-row', (els) => els.length), '| first AI cell:', (await all('.ingest-row .ingest-ai'))[0]?.slice(0, 160));
console.log('brutal:', (await all('.ingest-status .hint')).find((x) => x.startsWith('Heaviest')));
await page.screenshot({ path: `${out}-compare.png`, fullPage: false });

// 3. Review: uncheck one start, apply the rest.
await page.$$eval('.ingest-status .btn', (els) => els.find((e) => /^Review/.test(e.textContent)).click());
await page.waitForSelector('.plan-review-list', { timeout: 5000 });
console.log('sections:', (await all('.modal .rev-group-title')).join(' | '));
const firstStart = await page.$eval('.modal .diff-section:first-of-type .plan-line b', (e) => e.textContent);
await page.$eval('.modal .diff-section:first-of-type .plan-line input', (e) => e.click());
console.log('unchecked start for:', firstStart, '| apply button:', (await all('.modal .modal-actions .btn.primary'))[0]);
await page.screenshot({ path: `${out}-review.png`, fullPage: false });
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await page.waitForFunction(() => /Applied \d+ change/.test(document.querySelector('.ingest-status')?.textContent ?? ''), { timeout: 5000 });
console.log('applied:', (await all('.ingest-status .hint')).find((x) => x.startsWith('Applied')));
console.log('header:', await t('.lib-head .hint'));

// 4. What was written: AI start, estimate, steps, flags, a found item; the unchecked start remembered; notes untouched.
s = await state();
const after = s.items.filter((i) => i.courseId === eng.id);
const withPlan = after.filter((i) => i.plan);
const declined = after.find((i) => i.label === firstStart);
const big = after.find((i) => i.points >= 100 && i.status !== 'done' && i.label !== firstStart);
console.log('plans attached:', withPlan.length, 'of', after.length, '| course mode:', s.courses.find((c) => c.id === eng.id).ingest);
console.log('big item:', big?.label, '| startByPlan:', big?.startByPlan, '| minutes:', big?.estimatedMinutes, '| steps:', big?.steps?.length, '| lopesWrite:', big?.flags.lopesWrite, '| topic:', big?.topic);
console.log('declined remembered:', declined?.planDeclined, '| startByPlan on it:', declined?.startByPlan ?? 'none');
console.log('found item:', after.find((i) => i.title === 'Reading response 1')?.notes);
console.log('notes kept:', engItems.every((i) => (after.find((x) => x.id === i.id)?.notes ?? '') === i.notes));
console.log('term plan weeks:', s.settings.termPlan?.weeks?.length, '| undo label:', await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:undo') ?? 'null')?.label));

// 5. The item shows where its numbers came from; the compare screen reuses the cached pass; the coach sees the asks.
await page.evaluate((id) => { window.location.hash = `/class?c=${id}`; }, eng.id);
await sleep(400);
await page.evaluate((label) => { const row = [...document.querySelectorAll('.item-row')].find((r) => r.textContent.includes(label)); row?.querySelector('.item-main').click(); }, big.label);
await page.waitForSelector('.modal .ai-from', { timeout: 5000 });
console.log('item detail AI lines:', (await all('.modal .ai-from')).length, '|', (await all('.modal .plan-why')).slice(0, 2).join(' || ').slice(0, 200));
await page.$$eval('.modal .modal-actions .btn, .modal-close', (els) => (els.find((e) => /Cancel|Close/.test(e.textContent)) ?? els[0]).click());
await page.goto(`${BASE}#/ingest?c=${eng.id}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.ingest-summary', { timeout: 8000 });
console.log('cached header:', await t('.lib-head .hint'), '| button:', await t('.ingest-status .btn.primary'), '| calls so far:', calls.length);
await page.click('.ingest-status .btn.primary');
await sleep(800);
console.log('re-run forced calls:', calls.length);

// 6. Settings shows the cost and which classes run on what.
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.ai-month', { timeout: 5000 });
console.log('settings AI:', await t('.ai-month'), '|', (await all('.ai-usage tbody tr')).join(' ; '));
console.log('class modes:', (await all('section[aria-label="AI"] .diff-list li')).map((x) => x.replace(/\s+/g, ' ')).join(' | '));
await page.screenshot({ path: `${out}-settings.png`, fullPage: false });
await browser.close();
