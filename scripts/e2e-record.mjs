// Record tab against the preview build with Chrome's fake microphone: record, flush, interrupt, recover, stop, play, delete, search, sample review.
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
await click('.rec-card:first-child .btn', 'Transcript');
await sleep(300);
console.log('transcript box:', (await t('.rec-card:first-child .rec-transcript'))?.slice(0, 80));
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
await page.click('.rec-search', { clickCount: 3 });
await page.keyboard.press('Backspace');

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
