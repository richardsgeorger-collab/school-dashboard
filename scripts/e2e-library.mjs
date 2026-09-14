// Library: drop a PDF and a PPTX as slides, search across sources, feed the coach, link a deck to a recording and to an item, keep text after deleting the file.
import fs from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'library.png').replace(/\.png$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A two-page PDF with real text objects.
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
function makeZip(files) {
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.text, 'utf8'); const data = deflateRawSync(raw); const name = Buffer.from(f.name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, name])); parts.push(local, name, data); offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}
const slideXml = (paras) => `<p:sld xmlns:a="a"><p:cSld>${paras.map((p) => `<p:sp><p:txBody><a:p><a:r><a:t>${p}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}</p:cSld></p:sld>`;
const pdfPath = `${out}-Topic3_Stoichiometry.pdf`;
const pptxPath = `${out}-Week5_GasLaws.pptx`;
fs.writeFileSync(pdfPath, makePdf([['Stoichiometry basics', 'Mole ratios from balanced equations'], ['Limiting reagent', 'The reactant that runs out first caps the product']]));
fs.writeFileSync(pptxPath, makeZip([{ name: 'ppt/slides/slide1.xml', text: slideXml(['Gas laws', 'Boyle: pressure times volume is constant']) }, { name: 'ppt/slides/slide2.xml', text: slideXml(['Charles: volume over temperature is constant']) }, { name: 'ppt/slides/slide3.xml', text: slideXml([]) }]));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const click = (sel, text) => page.$$eval(sel, (els, text) => { const el = els.find((e) => e.textContent.trim().startsWith(text)); if (!el) throw new Error('no ' + text); el.click(); }, text);

await page.goto(`${BASE}#/record`, { waitUntil: 'networkidle0' });
console.log('alias → library:', page.url().includes('#/record') || page.url().includes('library'), '| title:', await t('.page-title'), '| tabs:', await page.$$eval('.nav-bottom .nav-link', (els) => els.map((e) => e.textContent.trim()).join(' ')));
await page.goto(`${BASE}#/library?v=slides`, { waitUntil: 'networkidle0' });
// PDF
await (await page.$('input[aria-label="Slides file"]')).uploadFile(pdfPath);
await page.waitForSelector('.rec-import-form', { timeout: 5000 });
console.log('pdf form title:', await page.$eval('.rec-import-form .field-row input:not([type])', (e) => e.value));
await page.$eval('.rec-import-form input[placeholder^="Topic 3"]', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'Topic 3'); el.dispatchEvent(new Event('input', { bubbles: true })); });
await click('.rec-import-form .btn', 'Save slides');
await page.waitForFunction(() => document.querySelectorAll('.deck-card').length >= 1, { timeout: 30000 });
console.log('pdf saved:', await t('.rec-panel:first-of-type .hint[style]'));
// PPTX
await (await page.$('input[aria-label="Slides file"]')).uploadFile(pptxPath);
await page.waitForSelector('.rec-import-form', { timeout: 5000 });
await click('.rec-import-form .btn', 'Save slides');
await page.waitForFunction(() => document.querySelectorAll('.deck-card').length >= 2, { timeout: 30000 });
console.log('pptx saved:', await t('.rec-panel:first-of-type .hint[style]'));
console.log('deck cards:', await page.$$eval('.deck-card .hint.mono', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
await click('.deck-card .btn', 'Text');
await sleep(200);
console.log('deck text:', (await t('.deck-text'))?.slice(0, 120));
await page.screenshot({ path: `${out}-slides.png`, fullPage: false });
// Search across sources
await page.goto(`${BASE}#/library?v=search`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => /on file/.test(document.querySelector('.search-panel .hint.mono')?.textContent ?? ''), { timeout: 10000 });
await page.type('.search-main', 'limiting reagent');
await sleep(300);
console.log('search:', await t('.search-panel .hint.mono'), '|', await page.$$eval('.search-hit', (els) => els.map((e) => e.querySelector('.search-hit-head').textContent.replace(/\s+/g, ' ').trim() + ' → ' + e.querySelector('.search-snippet').textContent.trim().slice(0, 60)).join(' || ')));
await page.screenshot({ path: `${out}-search.png`, fullPage: false });
// Coach gets a Materials block with the deck index and the picked slide.
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const seen = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  seen.push(JSON.parse(req.postData() ?? '{}'));
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'The limiting reagent runs out first (Topic3 Stoichiometry, page 2).' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
});
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.type('.chat-input input', 'what did we cover on the limiting reagent');
await page.$$eval('.chat-input button', (els) => els[0].click());
await page.waitForFunction(() => document.querySelectorAll('.chat-msg[data-role="assistant"]').length >= 1 && !document.querySelector('.chat-dots'), { timeout: 10000 });
const mat = seen[0]?.system?.find((b) => b.text.startsWith('Materials:'))?.text ?? '';
console.log('materials block:', /Decks on file:/.test(mat), '| index has both decks:', /Topic3 Stoichiometry/.test(mat) && /Week5 GasLaws/.test(mat), '| picked slide:', /Stoichiometry · slide 2\]\nLimiting reagent/.test(mat), '| rule:', /cite the deck title and slide number/.test(seen[0].system[0].text));
// Item link: a CHM-113 item titled with Topic 3 shows the deck.
await page.goto(`${BASE}#/calendar`, { waitUntil: 'networkidle0' });
const target = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('school-dashboard:v1')); const chm = s.courses.find((c) => c.code === 'CHM-113'); return s.items.find((i) => i.courseId === chm.id && /topic 3/i.test(i.title))?.label ?? null; });
console.log('item with Topic 3:', target);
await page.$$eval('button', (els) => els.find((b) => b.textContent.trim() === 'Agenda')?.click());
await sleep(300);
const opened = await page.evaluate((label) => { const el = [...document.querySelectorAll('.item-row .item-main')].find((e) => e.querySelector('.item-title')?.textContent.trim() === label); if (el) el.click(); return !!el; }, target);
await sleep(400);
console.log('opened item:', opened, '| slides line:', await page.$$eval('.modal .hint', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).find((x) => x.startsWith('Slides:')) ?? 'none'));
await page.keyboard.press('Escape');
// Delete the PDF file, keep the text: search still finds it.
await page.goto(`${BASE}#/library?v=slides`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.deck-card', { timeout: 5000 });
await page.$$eval('.deck-card', (els) => { const card = els.find((e) => /Stoichiometry/.test(e.textContent)); [...card.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Delete file').click(); });
await sleep(400);
console.log('after delete file:', await page.$$eval('.deck-card .hint.mono', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).find((x) => /Stoichiometry|text kept/.test(x))));
await page.goto(`${BASE}#/library?v=search`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => /on file/.test(document.querySelector('.search-panel .hint.mono')?.textContent ?? ''), { timeout: 10000 });
await page.type('.search-main', 'mole ratios');
await sleep(300);
console.log('search after file delete:', await page.$$eval('.search-hit', (els) => els.length), 'hit(s)');
await browser.close();
