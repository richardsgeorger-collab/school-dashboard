// Practice sets from the student's own material, with api.anthropic.com answered by a canned practice_set tool call:
// sources gathered from a dropped deck, the prompt carries them, five questions of three kinds, checking, the
// solution path only after an attempt, "I'm stuck", close calls handed to the student, misses tracked per topic.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'quiz.png').replace(/\.png$/, '');
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
fs.writeFileSync(pdf, makePdf([['Stoichiometry basics', 'Mole ratios come from the balanced equation', 'Molar mass of water is 18.02 g per mol'], ['Limiting reagent', 'The reactant that runs out first caps the product', 'Find moles of each reactant before comparing']]));
const syl = `${dir}CHM113_syllabus.txt`;
fs.writeFileSync(syl, 'CHM-113 General Chemistry I\n\nExam 1 covers stoichiometry and limiting reagents, 150 points.\n\nLate work loses ten percent a day.\n' + 'Attendance is expected. '.repeat(10));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const toolReply = (input) => JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 'tu_1', name: 'practice_set', input }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
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

// Material: a deck on the CHM-113 class page and a syllabus.
await page.goto(`${BASE}#/library?seed=1`, { waitUntil: 'networkidle0' });
const chm = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113').id);
await page.goto(`${BASE}#/library?c=${chm}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.lib-drop input[type=file]', { timeout: 5000 });
await (await page.$('.lib-drop input[type=file]')).uploadFile(pdf);
await page.waitForFunction(() => [...document.querySelectorAll('.lib-notes li')].some((li) => /pages saved/i.test(li.textContent)), { timeout: 30000 });
await (await page.$('.lib-drop input[type=file]')).uploadFile(syl);
await page.waitForFunction(() => [...document.querySelectorAll('.lib-notes li')].some((li) => /syllabus/i.test(li.textContent)), { timeout: 30000 });
console.log('quiz link on class page:', await t('.lib-head .btn'));

// No key: the button explains itself.
await page.goto(`${BASE}#/quiz?c=${chm}`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !/Reading your material/.test(document.querySelector('.quiz-sources')?.textContent ?? ''), { timeout: 10000 });
console.log('sources:', await t('.quiz-sources'));
console.log('no key hint:', await t('.quiz-setup .hint:not(.mono)'), '| disabled:', await page.$eval('.quiz-setup .btn.primary', (e) => e.disabled));

// With a key: the prompt carries the sources; the canned set comes back.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.goto(`${BASE}#/quiz?c=${chm}&t=limiting%20reagent`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => /source/.test(document.querySelector('.quiz-sources')?.textContent ?? '') && !/Reading/.test(document.querySelector('.quiz-sources')?.textContent ?? ''), { timeout: 10000 });
console.log('topic sources:', await t('.quiz-sources'));
const set = {
  questions: [
    { kind: 'multiple_choice', topic: 'limiting reagent', prompt: 'Which reactant is the limiting reagent?', choices: ['The one with the larger mass', 'The one that runs out first', 'The one with the larger molar mass', 'The product'], answer: '1', explanation: 'The reactant that runs out first caps how much product forms.', steps: [], sourceId: 'S1' },
    { kind: 'worked', topic: 'moles', prompt: 'How many moles are in 36.04 g of water?', choices: [], answer: '2.00 mol', explanation: 'Divide mass by molar mass.', steps: ['n = m / M', 'M(H2O) = 18.02 g/mol', 'n = 36.04 / 18.02 = 2.00 mol'], sourceId: 'S2' },
    { kind: 'worked', topic: 'limiting reagent', prompt: '2 H2 + O2 → 2 H2O. With 4.0 mol H2 and 1.0 mol O2, how many moles of water form?', choices: [], answer: '2.0 mol', explanation: 'O2 runs out first: 1.0 mol O2 makes 2.0 mol water.', steps: ['H2 needs 2 mol per mol O2', '4.0 mol H2 would need 2.0 mol O2; only 1.0 is there', 'O2 limits: 1.0 mol O2 × 2 = 2.0 mol H2O'], sourceId: 'S1' },
    { kind: 'short', topic: 'mole ratios', prompt: 'Where do mole ratios come from?', choices: [], answer: 'the balanced equation', explanation: 'Coefficients in the balanced equation are the mole ratios.', steps: [], sourceId: 'S2' },
    { kind: 'multiple_choice', topic: 'exam scope', prompt: 'What does Exam 1 cover?', choices: ['Gas laws', 'Stoichiometry and limiting reagents', 'Thermochemistry', 'Acids and bases'], answer: '1', explanation: 'The syllabus says so.', steps: [], sourceId: 'S2' },
  ],
};
queue.push({ status: 200, body: toolReply(set) });
await page.click('.quiz-setup .btn.primary');
await page.waitForSelector('.quiz-q', { timeout: 8000 });
const req = seen[0];
console.log('request:', req.model, '| tool forced:', req.tool_choice?.name, '| sources in prompt:', /\[S1\] slide · CHM113 Topic3 Stoichiometry, slide/.test(req.messages[0].content), '| worked asked:', /at least three of the five worked/.test(req.messages[0].content), '| topic:', /Topic asked for: limiting reagent/.test(req.messages[0].content));
console.log('q1:', await t('.quiz-meta'), '|', await t('.quiz-prompt'), '| choices:', await page.$$eval('.quiz-choice', (els) => els.length));
await page.screenshot({ path: `${out}.png`, fullPage: false });
// Q1 multiple choice, right.
await page.$$eval('.quiz-choice', (els) => els[1].click());
await sleep(150);
console.log('q1 verdict:', await t('.quiz-verdict'), '|', await t('.quiz-answer-line'));
await page.click('.quiz-result .btn.primary');
// Q2 worked, right within tolerance; the solution path waits to be asked for.
await page.waitForFunction(() => /2 of 5/.test(document.querySelector('.quiz-meta')?.textContent ?? ''), { timeout: 5000 });
await page.type('.quiz-answer input', '2 mol');
await page.click('.quiz-answer .btn.primary');
await sleep(150);
console.log('q2 verdict:', await t('.quiz-verdict'), '| steps shown before asking:', !!(await page.$('.quiz-steps')), '| toggle:', await t('.quiz-result .diff-toggle'));
await page.click('.quiz-result .diff-toggle');
await sleep(100);
console.log('q2 steps:', await page.$$eval('.quiz-steps li', (els) => els.map((e) => e.textContent.trim()).join(' → ')));
await page.screenshot({ path: `${out}-worked.png`, fullPage: false });
await page.click('.quiz-result .btn.primary');
// Q3 worked, stuck.
await page.waitForFunction(() => /3 of 5/.test(document.querySelector('.quiz-meta')?.textContent ?? ''), { timeout: 5000 });
await page.$$eval('.quiz-answer .btn', (els) => els.find((e) => e.textContent.includes('stuck')).click());
await sleep(150);
console.log('q3 stuck:', await t('.quiz-verdict'), '| next enabled:', !(await page.$eval('.quiz-result .btn.primary', (e) => e.disabled)));
await page.click('.quiz-result .btn.primary');
// Q4 short, close call handed to the student.
await page.waitForFunction(() => /4 of 5/.test(document.querySelector('.quiz-meta')?.textContent ?? ''), { timeout: 5000 });
await page.type('.quiz-answer input', 'from the equation');
await page.click('.quiz-answer .btn.primary');
await sleep(150);
console.log('q4 close:', await t('.quiz-verdict'), '| next disabled until settled:', await page.$eval('.quiz-result .btn.primary', (e) => e.disabled));
await page.$$eval('.quiz-settle .btn', (els) => els.find((e) => e.textContent.includes('Missed')).click());
await sleep(150);
console.log('q4 settled:', await page.$eval('.quiz-q', (e) => e.dataset.verdict));
await page.click('.quiz-result .btn.primary');
// Q5 multiple choice, wrong.
await page.waitForFunction(() => /5 of 5/.test(document.querySelector('.quiz-meta')?.textContent ?? ''), { timeout: 5000 });
await page.$$eval('.quiz-choice', (els) => els[0].click());
await sleep(150);
console.log('q5 verdict:', await t('.quiz-verdict'), '| button:', await t('.quiz-result .btn.primary'));
await page.click('.quiz-result .btn.primary');
await page.waitForSelector('.quiz-done', { timeout: 5000 });
console.log('done:', await t('.quiz-done .section-title'), '|', await t('.quiz-done .hint'));
await page.screenshot({ path: `${out}-done.png`, fullPage: false });
const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.quizStats);
console.log('stats:', JSON.stringify(Object.values(stats).map((s) => [s.topic, s.attempts, s.misses])));
// Another set avoids repeats; one more miss on limiting reagent makes it a weak topic that the next request carries.
queue.push({ status: 200, body: toolReply({ questions: [{ ...set.questions[0], prompt: 'Which reactant limits the yield?' }] }) });
await page.$$eval('.quiz-done .btn.primary', (els) => els[0].click());
await page.waitForSelector('.quiz-q', { timeout: 8000 });
const req2 = seen[1];
console.log('second request: no weak topic yet:', !/missed before/.test(req2.messages[0].content), '| avoids repeats:', /- Which reactant is the limiting reagent\?/.test(req2.messages[0].content));
await page.$$eval('.quiz-choice', (els) => els[3].click());
await sleep(150);
await page.click('.quiz-result .btn.primary');
await page.waitForSelector('.quiz-done', { timeout: 5000 });
queue.push({ status: 200, body: toolReply({ questions: set.questions.slice(1, 2) }) });
await page.$$eval('.quiz-done .btn.primary', (els) => els[0].click());
await page.waitForSelector('.quiz-q', { timeout: 8000 });
console.log('third request: weak fed back:', /missed before, in at least two questions: limiting reagent/.test(seen[2].messages[0].content));
// Setup screen names the weak topic.
await page.goto(`${BASE}#/quiz?c=${chm}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.quiz-setup', { timeout: 5000 });
console.log('weak on setup:', await t('.quiz-setup .hint:not(.mono)'));
console.log('practice line:', await page.$$eval('.quiz-setup .hint.mono', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
await browser.close();
