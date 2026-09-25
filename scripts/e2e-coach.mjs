// The coach, driven through every way a completion can go wrong, to see what the conversation actually shows.
// Scenarios: no key, an API error, a completion with no text block, and a normal answer.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
let mode = 'ok';
const calls = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  calls.push({ maxTokens: body.max_tokens, thinking: !!body.thinking, model: body.model });
  const json = (status, obj) => req.respond({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(obj) });
  const msg = (content, stop) => ({ id: 'm', type: 'message', role: 'assistant', model: body.model, content, stop_reason: stop, usage: { input_tokens: 100, output_tokens: 20 } });

  if (mode === 'error') return json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
  if (mode === 'empty') return json(200, msg([], 'max_tokens'));
  // Only the first call comes back empty; the retry without thinking answers.
  if (mode === 'empty-then-ok') return calls.length === 1 ? json(200, msg([], 'max_tokens')) : json(200, msg([{ type: 'text', text: 'Start with 1.4 and work forward.' }], 'end_turn'));
  if (mode === 'whitespace') return json(200, msg([{ type: 'text', text: '   ' }], 'end_turn'));
  if (mode === 'hang') return; // never respond: the request stalls, which is the silent case
  return json(200, msg([{ type: 'text', text: 'Do the Chem homework first.' }], 'end_turn'));
});

const bubbles = () => page.$$eval('.chat-msg', (els) => els.map((e) => ({ role: e.dataset.role, failed: e.dataset.failed === 'true', text: e.textContent.replace(/\s+/g, ' ').trim() })));
const errorText = () => page.$eval('.chat p[style*="overdue"]', (e) => e.textContent.trim()).catch(() => null);

const ask = async (label, text) => {
  calls.length = 0;
  await page.$eval('.chat-input input', (el) => {
    el.value = '';
  });
  await page.type('.chat-input input', text);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.chat-input input')?.disabled, { timeout: 20000 }).catch(() => {});
  await sleep(600);
  const shown = await bubbles();
  const err = await errorText();
  console.log(`\n--- ${label} ---`);
  console.log('  requests:', calls.length, calls.map((c) => `max_tokens=${c.maxTokens} thinking=${c.thinking}`).join(' | ') || '(none fired)');
  console.log('  bubbles:', JSON.stringify(shown));
  console.log('  error shown:', err ?? '(none)');
  const visible = shown.some((b) => b.role === 'assistant' && b.text.length > 0) || !!err;
  console.log('  ANYTHING VISIBLE:', visible);
  return { shown, err, visible, calls: [...calls] };
};

await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle0' });

// 1. No key at all: the request cannot fire.
await page.evaluate(() => localStorage.removeItem('school-dashboard:anthropic-key'));
await page.reload({ waitUntil: 'networkidle0' });
await sleep(500);
const hasInput = await page.$('.chat-input input');
console.log('\n--- no key ---');
console.log('  chat input present:', !!hasInput, '| connect box present:', !!(await page.$('.chat input[type="password"], .chat .btn')));

// With a key from here on.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.reload({ waitUntil: 'networkidle0' });
await sleep(600);

mode = 'ok';
const ok = await ask('normal answer', 'what should I do right now?');
mode = 'error';
const err = await ask('API error, out of credits', 'what should I do right now?');
mode = 'empty';
const empty = await ask('completion with no text block, every time', 'build me a study plan for tonight');
mode = 'whitespace';
const ws = await ask('completion with only whitespace', 'build me a study plan for tonight');
mode = 'empty-then-ok';
const retry = await ask('empty once, then answers without thinking', 'build me a study plan for tonight');
mode = 'hang';
await page.evaluate(() => { window.__coachTimeout = 4000; });
const hung = await ask('request that never comes back', 'what should I do right now?');

console.log('\n=== VERDICT ===');
console.log('normal answers render:', ok.visible);
console.log('API error is visible in the chat:', err.visible, '|', err.err);
console.log('empty completion is visible:', empty.visible, '|', empty.err ?? empty.shown.filter((b) => b.role === 'assistant').map((b) => b.text).join('/'));
console.log('whitespace completion is visible:', ws.visible);
console.log('retry recovers:', retry.visible, '| requests:', retry.calls.length);
console.log('user message survives an error:', err.shown.filter((b) => b.role === 'user').length > 1);
console.log('failure is an assistant turn, not a footnote:', err.shown.at(-1)?.role === 'assistant' && err.shown.at(-1)?.failed === true);
console.log('error reads as a sentence:', err.shown.at(-1)?.text?.slice(0, 90));
console.log('a hung request eventually says something:', hung.visible, '|', hung.shown.at(-1)?.text?.slice(0, 80));

await browser.close();
