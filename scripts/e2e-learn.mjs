// The learning layer, with api.anthropic.com answered by canned replies: the tutor teaching from a dropped deck with
// citations and the next-step rule; a study kit built from the same material and cached; a method check on a problem
// set; the one conceptual line on Now, Grades, and the class page when a weak topic meets later material.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'learn.png').replace(/\.png$/, '');
const dir = out.slice(0, out.lastIndexOf('/') + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makePdf(pages) {
  const objs = [];
  const add = (s) => (objs.push(s), objs.length);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  const kidsIdx = add('PLACEHOLDER');
  for (const lines of pages) {
    const content = `BT /F1 20 Tf 60 720 Td ${lines.map((l, i) => `${i ? '0 -30 Td ' : ''}(${l.replace(/[()\\]/g, '\\$&')}) Tj`).join(' ')} ET`;
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${kidsIdx} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[kidsIdx - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${kidsIdx} 0 R >>`);
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
const pdf = `${dir}CHM113_Topic3_Stoichiometry.pdf`;
fs.writeFileSync(pdf, makePdf([['Stoichiometry basics', 'Mole ratios come from the balanced equation', 'n = m / M'], ['Limiting reagent', 'The reactant that runs out first caps the product', 'Find moles of each reactant before comparing']]));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const setState = (s) => page.evaluate((v) => localStorage.setItem('school-dashboard:v1', JSON.stringify(v)), s);

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const toolReply = (name, input) => JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 'tu', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 9000, output_tokens: 900 } });
const textReply = (text) => JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 7000, output_tokens: 200, cache_read_input_tokens: 5000 } });
const calls = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  const tool = body.tool_choice?.name ?? 'text';
  const sys = Array.isArray(body.system) ? body.system.map((b) => b.text).join('\n') : String(body.system ?? '');
  const user = typeof body.messages?.at(-1)?.content === 'string' ? body.messages.at(-1).content : '';
  calls.push({ tool, sysChars: sys.length, cached: Array.isArray(body.system) ? body.system.filter((b) => b.cache_control).length : 0, sources: (sys.match(/\[S\d+\]/g) ?? []).length, user: user.slice(0, 60) });
  let reply;
  if (tool === 'text') reply = /tried/i.test(user) || /stuck/i.test(user) ? textReply('Start with what the balanced equation gives you: the mole ratio [S1]. What did you get for moles of each reactant? Do that one step and tell me.') : textReply("Start from the balanced equation: its coefficients are the mole ratios [S1]. The limiting reagent is the reactant that runs out first [S2]. Your professor said this will be on Exam 1. Check: if you have 4 mol H2 and 1 mol O2 for 2H2 + O2 → 2H2O, which runs out first?");
  else if (tool === 'study_kit') reply = toolReply('study_kit', { formulas: [{ name: 'Moles from mass', formula: 'n = m / M', when: 'Given grams, need moles.', sourceId: 'S1' }], cards: [{ front: 'Where do mole ratios come from?', back: 'The balanced equation.', sourceId: 'S1' }, { front: 'What is the limiting reagent?', back: 'The reactant that runs out first.', sourceId: 'S2' }], sections: [{ heading: 'Stoichiometry in one page', lines: ['Mole ratios come from the balanced equation.', 'Find moles of each reactant before comparing.'], sourceId: 'S1' }] });
  else if (tool === 'method_check') reply = toolReply('method_check', { problems: [{ label: 'Problem 2', setup: 'off', note: 'The ratio is taken from masses, not moles; the class converts to moles first [S1].', step: 'Convert each reactant to moles before comparing.' }, { label: 'Problem 1', setup: 'right', note: 'Balanced equation and mole ratio are right.', step: null }], next: 'Redo problem 2 from the mole conversion and compare again.' });
  else reply = JSON.stringify({ type: 'error', error: { type: 'api_error', message: `unexpected tool ${tool}` } });
  return req.respond({ status: reply.includes('"error"') ? 500 : 200, headers: { ...cors, 'content-type': 'application/json' }, body: reply });
});

// Material on file for CHM-113.
await page.goto(`${BASE}#/library`, { waitUntil: 'networkidle0' });
let s = await state();
const chm = s.courses.find((c) => c.code === 'CHM-113');
const esg = s.courses.find((c) => c.code === 'ESG-162');
await page.goto(`${BASE}#/library?c=${chm.id}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.lib-drop input[type=file]', { timeout: 5000 });
await (await page.$('.lib-drop input[type=file]')).uploadFile(pdf);
await page.waitForFunction(() => [...document.querySelectorAll('.lib-notes li')].some((li) => /pages saved/i.test(li.textContent)), { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));

// A weak topic with later material that assumes it: topics on the class, a low quiz, an open item ahead, a link.
s = await state();
const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }));
const shift = (d, n) => { const x = new Date(`${d}T12:00:00-07:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); };
s.courses = s.courses.map((c) => (c.id === chm.id ? { ...c, topics: [{ name: 'stoichiometry', week: 3, buildsOn: [] }, { name: 'limiting reagent', week: 5, buildsOn: ['stoichiometry'] }] } : c.id === esg.id ? { ...c, topics: [{ name: 'dimensional analysis', week: 2, buildsOn: [] }] } : c));
s.settings.topicLinks = [{ a: { courseId: chm.id, topic: 'stoichiometry' }, b: { courseId: esg.id, topic: 'dimensional analysis' }, note: 'Mole ratios are the unit conversions from ESG-162 Topic 2.' }];
const graded = s.items.filter((i) => i.courseId === chm.id && i.type === 'quiz').slice(0, 1);
for (const i of graded) { i.topic = 'stoichiometry'; i.status = 'done'; i.completedAt = i.dueAt; i.score = Math.round(i.points * 0.55); i.scoreSource = 'halo'; }
const ahead = s.items.filter((i) => i.courseId === chm.id && i.status !== 'done' && i.dueAt.slice(0, 10) > today).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
ahead.topic = 'stoichiometry';
ahead.dueAt = `${shift(today, 12)}T23:59:00-07:00`;
ahead.type = 'homework';
await setState(s);

// 1. Now, Grades, class page: the one line.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(800);
console.log('Now line:', await t('.pace'));
await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle0' });
console.log('Grades weak line:', (await all('.grade-weak')).find((x) => /not getting/.test(x)));
await page.goto(`${BASE}#/class?c=${chm.id}`, { waitUntil: 'networkidle0' });
console.log('class page line:', (await all('.class-next .hint')).find((x) => /not getting/.test(x)), '| buttons:', (await all('.lib-head .btn')).join(' | '));

// 2. The tutor: from the deck, cited, next step only.
await page.goto(`${BASE}#/tutor?c=${chm.id}&t=limiting%20reagent`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => /Teaching from/.test(document.querySelector('.lib-head .hint')?.textContent ?? ''), { timeout: 10000 });
console.log('tutor sources:', await t('.lib-head .hint'));
await page.$$eval('.tutor-topic .btn', (els) => els.find((e) => /behind/.test(e.textContent)).click());
await page.waitForSelector('.tutor-msg[data-role="assistant"] .tutor-text', { timeout: 8000 });
console.log('behind →', (await all('.tutor-msg[data-role="assistant"] .tutor-text'))[0]?.slice(0, 120));
console.log('cites:', (await all('.tutor-cites a')).join(' | '));
await page.type('.tutor-ask textarea', "I'm stuck: 2H2 + O2, 4 mol H2 and 1 mol O2. I tried dividing masses.");
await page.$$eval('.tutor-ask .btn.primary', (els) => els[0].click());
await page.waitForFunction(() => document.querySelectorAll('.tutor-msg[data-role="assistant"] .tutor-text').length >= 2, { timeout: 8000 });
console.log('stuck →', (await all('.tutor-msg[data-role="assistant"] .tutor-text'))[1]?.slice(0, 120));
console.log('tutor call:', JSON.stringify(calls.filter((c) => c.tool === 'text')[0]));
await page.screenshot({ path: `${out}-tutor.png`, fullPage: false });

// 3. Study kit: built once, cached across kinds and reloads.
await page.goto(`${BASE}#/study?c=${chm.id}&k=cards&t=stoichiometry`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => /From \d+ piece/.test(document.querySelector('.lib-head .hint')?.textContent ?? ''), { timeout: 10000 });
console.log('kit sources:', await t('.lib-head .hint'));
await page.click('.kit-setup .btn.primary');
await page.waitForSelector('.kit-card', { timeout: 8000 });
console.log('cards:', await page.$$eval('.kit-card', (els) => els.length), '| front:', await t('.kit-card .kit-card-face'));
await page.click('.kit-card');
console.log('flipped:', await t('.kit-card[data-flipped="true"] .kit-card-face'));
const kitCalls = calls.filter((c) => c.tool === 'study_kit').length;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.kit-card', { timeout: 8000 });
console.log('cached on reload:', calls.filter((c) => c.tool === 'study_kit').length === kitCalls, '| button:', await t('.kit-setup .btn.primary'));
await page.screenshot({ path: `${out}-kit.png`, fullPage: false });

// 4. Method check inside a problem set's item.
await page.goto(`${BASE}#/class?c=${chm.id}`, { waitUntil: 'networkidle0' });
await page.evaluate((label) => { const row = [...document.querySelectorAll('.item-row')].find((r) => r.textContent.includes(label)); row?.querySelector('.item-main').click(); }, ahead.label);
await page.waitForSelector('.modal .work', { timeout: 5000 });
await page.waitForFunction(() => [...document.querySelectorAll('.modal .work .btn')].some((b) => /Check my method/.test(b.textContent)), { timeout: 8000 });
await page.$$eval('.modal .work .btn', (els) => els.find((e) => /Check my method/.test(e.textContent)).click());
await page.type('.modal .work textarea', 'Problem 1: 2H2 + O2 -> 2H2O, ratio 2:1. Problem 2: divided 8 g by 32 g and compared.');
await page.$$eval('.modal .work .btn.primary', (els) => els.find((e) => /Check it/.test(e.textContent)).click());
await page.waitForSelector('.modal .work-method li', { timeout: 8000 });
console.log('method:', (await all('.modal .work-method li')).join(' || '), '|', await t('.modal .work-next'));
console.log('connects to:', (await all('.modal .hint')).find((x) => x.startsWith('Connects to')));
console.log('tutor link on item:', !!(await page.$('.modal a[href*="#/tutor"]')));
await page.screenshot({ path: `${out}-method.png`, fullPage: false });
console.log('calls:', calls.map((c) => `${c.tool}(${c.cached} cached, ${c.sources} S-ids)`).join(' | '));
await browser.close();
