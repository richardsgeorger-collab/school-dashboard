// Coach on Now against the preview build, with api.anthropic.com answered by canned responses: no-key message, context sent, tool round trip, rejected key.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const message = (content, stop = 'end_turn') => JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
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

// Syllabus for the coach: a text syllabus for CHM-113 through Settings.
const syl = (process.argv[2] ?? 'chat.png').replace(/\.png$/, '-syllabus.txt');
fs.writeFileSync(syl, 'CHM-113 General Chemistry I\nGrading: exams 40%, homework 20%, labs 20%, final 20%.\nLate work: 10% per day, nothing accepted after five days.\n' + 'Attendance is expected. '.repeat(20));
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
await (await page.$('input[aria-label="Syllabus file for CHM-113"]')).uploadFile(syl);
await page.waitForFunction(() => document.querySelector('.syllabus-row .syllabus-status')?.textContent.includes('characters'), { timeout: 8000 });
console.log('syllabus row:', await t('.syllabus-row'), '|', await t('.settings-card .hint[style]'));
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
console.log('no key:', await t('.chat-connect .hint'));
console.log('key field is password:', await page.$eval('.chat-connect input', (e) => e.type));
await page.type('.chat-connect input', 'sk-ant-e2e');
await page.$$eval('.chat-connect button', (els) => els.find((e) => e.textContent.includes('Connect')).click());
await page.waitForSelector('.chat-input input', { timeout: 5000 });
console.log('suggestions:', await page.$$eval('.chat-suggest .btn', (els) => els.map((e) => e.textContent.trim()).join(' | ')));

const firstOpen = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.filter((i) => i.status !== 'done' && i.type !== 'participation').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]);
queue.push({ status: 200, body: message([{ type: 'tool_use', id: 'toolu_1', name: 'update_item', input: { item_id: firstOpen.id, status: 'in_progress' } }], 'tool_use') });
queue.push({ status: 200, body: message([{ type: 'text', text: `Start with ${firstOpen.label} now. It is due first and I have marked it in progress.` }]) });
await page.$$eval('.chat-suggest .btn', (els) => els[0].click());
await page.waitForFunction(() => document.querySelectorAll('.chat-msg[data-role="assistant"]').length >= 1 && !document.querySelector('.chat-dots'), { timeout: 10000 });
console.log('reply:', await page.$$eval('.chat-msg[data-role="assistant"]', (els) => els.map((e) => e.textContent.trim()).join(' || ')));
const req = seen[0];
const ctx = JSON.parse(req.system.find((b) => b.text.startsWith('Context:')).text.replace(/^Context:\n/, ''));
console.log('system blocks:', req.system.length, '| syllabus block:', /Syllabi:\n## CHM-113/.test(req.system[1]?.text ?? '') && /Late work: 10% per day/.test(req.system[1].text), '| cached:', JSON.stringify(req.system[1]?.cache_control));
console.log('request:', req.model, '| system rule:', /Two or three sentences/.test(req.system[0].text), '| tools:', req.tools.map((x) => x.name).join(','), '| thinking:', JSON.stringify(req.thinking), '| effort:', JSON.stringify(req.output_config));
console.log('context keys:', Object.keys(ctx).join(','), '| capacity:', JSON.stringify(ctx.capacity), '| open sample:', JSON.stringify(ctx.open[0]), '| done:', ctx.done, '| openTotal:', ctx.openTotal);
const has = (k) => ctx.open.every((o) => k in o);
console.log('every open item has label/due/startBy/minutes/points/status:', ['label', 'due', 'startBy', 'minutes', 'points', 'status'].every(has), '| any realDeadline:', ctx.open.some((o) => o.realDeadline));
console.log('tool round trip: requests', seen.length, '| tool_result sent:', JSON.stringify(seen[1]?.messages?.at(-1)?.content?.[0]).slice(0, 120));
const after = await page.evaluate((id) => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.id === id).status, firstOpen.id);
console.log('item status after tool:', firstOpen.label, '→', after);

queue.push({ status: 401, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
await page.type('.chat-input input', 'and now?');
await page.$$eval('.chat-input button', (els) => els[0].click());
await page.waitForFunction(() => document.querySelector('.chat .hint[style]'), { timeout: 10000 });
console.log('rejected key:', await t('.chat .hint[style]'));
await page.$$eval('.chat-head-actions .btn', (els) => els.find((e) => e.textContent.includes('Disconnect')).click());
await sleep(200);
console.log('after disconnect, key gone:', await page.evaluate(() => localStorage.getItem('school-dashboard:anthropic-key')), '| connect form back:', !!(await page.$('.chat-connect')));
await page.screenshot({ path: process.argv[2] ?? 'chat.png', fullPage: true });
await browser.close();
