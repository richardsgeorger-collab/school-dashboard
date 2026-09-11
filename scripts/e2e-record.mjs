// Record tab against the preview build with Chrome's fake microphone: record, flush, interrupt, recover, stop, play, delete, search, sample review.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'record.png').replace(/\.png$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 200)); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const click = (sel, text) => page.$$eval(sel, (els, text) => { const el = els.find((e) => (text.startsWith('=') ? e.textContent.trim() === text.slice(1) : e.textContent.includes(text))); if (!el) throw new Error('no button ' + text); el.click(); }, text);

await page.goto(`${BASE}#/record`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.reload({ waitUntil: 'networkidle0' });
await click('.diff-toggle', 'Record in the browser instead');
console.log('title:', await t('.page-title'), '| banner:', await t('.rec-banner'));
console.log('quota:', await t('.rec-panel:nth-of-type(2) .hint.mono'));

// 1. Record, flush once, then kill the tab mid-recording.
await page.type('.rec-panel input[placeholder]', 'E2E lecture one');
await click('.rec-big', 'Record');
await page.waitForSelector('.rec-stop', { timeout: 10000 });
for (let i = 0; i < 4; i++) { await sleep(3200); console.log(`  t+${(i + 1) * 3.2}s:`, await t('.rec-live .hint.mono'), '|', await t('.rec-clock')); }
console.log('live:', await t('.rec-live .hint.mono'), '| clock:', await t('.rec-clock'), '| speech note:', await t('.rec-live .rec-error'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.rec-banner', { timeout: 10000 });
const banners = await page.$$eval('.rec-banner', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
console.log('after reload:', banners.filter((b) => /interrupted/i.test(b)).join(' || ') || 'NO INTERRUPTED BANNER');
await click('.rec-banner .btn', 'Keep it');
await sleep(500);
await click('.diff-toggle', 'Record in the browser instead');
console.log('kept:', await t('.rec-card .rec-card-title'), '|', await t('.rec-card .hint.mono'));

// 2. Second recording, stopped properly.
await page.type('.rec-panel input[placeholder]', 'E2E lecture two');
await click('.rec-big', 'Record');
await page.waitForSelector('.rec-stop', { timeout: 10000 });
await sleep(11000);
await click('.rec-stop', 'Stop');
await page.waitForSelector('.rec-big:not(.rec-stop)', { timeout: 15000 });
const cards = await page.$$eval('.rec-card', (els) => els.map((e) => e.querySelector('.rec-card-title').textContent + ' · ' + e.querySelector('.hint.mono').textContent.replace(/\s+/g, ' ').trim()));
console.log('cards:', cards.join(' || '));
const idb = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('school-dashboard-recordings'); r.onsuccess = () => { const db = r.result; const tx = db.transaction(['recordings', 'chunks', 'segments']); const c = {}; let n = 0; for (const s of ['recordings', 'chunks', 'segments']) { const q = tx.objectStore(s).count(); q.onsuccess = () => { c[s] = q.result; if (++n === 3) res(c); }; } }; }));
console.log('indexeddb counts:', JSON.stringify(idb));
await page.screenshot({ path: `${out}-list.png`, fullPage: true });

// 3. Play, transcript, delete audio, delete.
await click('.rec-card:first-child .btn', 'Play');
await page.waitForSelector('.rec-audio', { timeout: 5000 });
console.log('player src blob:', await page.$eval('.rec-audio', (a) => a.src.startsWith('blob:')));
const hasT = await page.$$eval('.rec-card:first-child .btn', (els) => els.some((e) => e.textContent.trim() === 'Transcript'));
if (hasT) { await click('.rec-card:first-child .btn', 'Transcript'); await sleep(300); }
console.log('transcript box:', hasT ? (await t('.rec-card:first-child .rec-transcript'))?.slice(0, 80) : 'no transcript (fake mic)');
await click('.rec-card:first-child .btn', 'Delete audio');
await sleep(500);
console.log('after delete audio:', await t('.rec-card:first-child .hint.mono'));
await click('.rec-card:last-child .btn', '=Delete');
await sleep(200);
await click('.rec-card:last-child .btn', 'Confirm delete');
await sleep(500);
console.log('cards after delete:', await page.$$eval('.rec-card', (els) => els.length));
await page.type('.rec-search', 'nothing-here-zzz');
await sleep(300);
console.log('search filters to:', await page.$$eval('.rec-card', (els) => els.length));
await page.$eval('.rec-search', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(200);
console.log('search cleared, cards:', await page.$$eval('.rec-card', (els) => els.length));

// 3b. Voice Memo import: drop a file, title by class and date, paste Apple's transcript, extract through a canned Claude reply.
const wavPath = `${out}-memo.wav`;
{
  const sr = 16000, data = Buffer.alloc(sr * 2), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(wavPath, Buffer.concat([h, data]));
}
await (await page.$('input[type=file][accept^="audio"]')).uploadFile(wavPath);
await page.waitForSelector('.rec-import-form', { timeout: 5000 });
console.log('import form:', await t('.rec-import-form .hint.mono'), '| title:', await page.$eval('.rec-import-form input:not([type])', (e) => e.value));
await click('.rec-import-form .btn', 'Save recording');
await page.waitForSelector('.rec-paste textarea', { timeout: 5000 });
console.log('imported card:', await t('.rec-card:first-child .hint.mono'));
await page.type('.rec-paste textarea', 'Today we cover stoichiometry. The mole links mass to particle count.\n\nOne more thing, the quiz moves to Friday, same format.');
await click('.rec-paste .btn', 'Save transcript');
await sleep(400);
console.log('after paste:', await t('.rec-card:first-child .hint.mono'));
await page.type('.rec-search', 'stoichiometry');
await sleep(300);
console.log('search hit:', await t('.rec-card .rec-hits'));
await page.$eval('.rec-search', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(200);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const seenBodies = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  seenBodies.push(JSON.parse(req.postData() ?? '{}'));
  const notes = { summary: ['Stoichiometry links mass to moles.', 'Limiting reagent caps the product.'], concepts: ['mole', 'limiting reagent'], mentions: [{ quote: 'the quiz moves to Friday', kind: 'date_change', title: 'Quiz', date: '2026-09-18', time: null, points: null, confidence: 'high', itemId: null }] };
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'toolu_n', name: 'lecture_notes', input: notes }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
});
await click('.rec-card:first-child .btn', 'Extract');
await page.waitForSelector('.rev-mention', { timeout: 10000 });
console.log('extract request model:', seenBodies[0]?.model, '| tool forced:', JSON.stringify(seenBodies[0]?.tool_choice), '| transcript sent:', /stoichiometry/.test(seenBodies[0]?.messages?.[0]?.content ?? ''));
console.log('extract review:', await t('.rev-summary'), '||', await page.$$eval('.rev-mention .rev-proposal', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await page.screenshot({ path: `${out}-extract.png`, fullPage: false });
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(300);
console.log('card after extract:', await t('.rec-card:first-child .hint.mono'));
await page.screenshot({ path: `${out}-import.png`, fullPage: true });

// 4. Sample review flow, dry run.
await click('.settings-actions .btn', 'Preview the review flow');
await page.waitForSelector('.rev-mention', { timeout: 5000 });
console.log('review head:', await t('.rev .hint.mono'), '|', await t('.rev-dry'));
const mentions = await page.$$eval('.rev-mention', (els) => els.map((e) => `${e.querySelector('.rev-badge').textContent}: ${e.querySelector('.rev-proposal').textContent.replace(/\s+/g, ' ').trim()}`));
console.log('proposals:\n  ' + mentions.join('\n  '));
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.length);
for (let i = 1; i <= 4; i++) {
  const btns = await page.$$(`.rev-mention:nth-child(${i}) .rev-actions .btn`);
  let target = btns[0];
  if (i === 4) for (const bt of btns) if ((await bt.evaluate((el) => el.textContent)).includes('Dismiss')) target = bt;
  if (!target) throw new Error(`no action button on mention ${i}`);
  await target.evaluate((el) => el.click());
  await sleep(150);
}
console.log('decided:', await page.$$eval('.rev-decided', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.length);
console.log('dry run kept planner unchanged:', before === after, `(${before} items)`);
await page.screenshot({ path: `${out}-review.png`, fullPage: false });

// 5. Phone nav fits six tabs.
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${BASE}#/record`, { waitUntil: 'networkidle0' });
const nav = await page.$$eval('.nav-bottom .nav-link', (els) => els.map((e) => `${e.textContent.trim()}:${e.scrollWidth <= e.clientWidth ? 'ok' : 'OVERFLOW'}`));
console.log('phone nav:', nav.join(' '));
await page.screenshot({ path: `${out}-phone.png`, fullPage: false });
await browser.close();
