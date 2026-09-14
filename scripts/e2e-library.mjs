// Library by class: home rows with counts, a top-level drop that asks once, class pages that file drops automatically,
// move and rename, scoped search with an all-classes toggle, collapsing, delete-or-keep materials, coach materials.
import fs from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const out = (process.argv[2] ?? 'library.png').replace(/\.png$/, '');
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
const files = {
  pdf: `${dir}CHM113_Topic3_Stoichiometry.pdf`,
  pptx: `${dir}CHM113_Week5_GasLaws.pptx`,
  syl: `${dir}CHM113 syllabus.txt`,
  wav: `${dir}memo.wav`,
};
fs.writeFileSync(files.pdf, makePdf([['Stoichiometry basics', 'Mole ratios from balanced equations'], ['Limiting reagent', 'The reactant that runs out first caps the product']]));
fs.writeFileSync(files.pptx, makeZip([{ name: 'ppt/slides/slide1.xml', text: slideXml(['Gas laws', 'Boyle: pressure times volume is constant']) }, { name: 'ppt/slides/slide2.xml', text: slideXml(['Charles: volume over temperature is constant']) }]));
fs.writeFileSync(files.syl, 'CHM-113 General Chemistry I syllabus.\nLate work: 10% per day, nothing after five days.\n' + 'Attendance is expected. '.repeat(20));
{ const sr = 16000, data = Buffer.alloc(sr * 2), h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40); fs.writeFileSync(files.wav, Buffer.concat([h, data])); }
const extra = [];
for (let i = 1; i <= 6; i++) { const p = `${dir}CHM113_Extra${i}.pdf`; fs.writeFileSync(p, makePdf([[`Extra deck ${i} on reaction kinetics`, `Rate laws relate concentration to speed of reaction`], [`Activation energy and the Arrhenius equation`, `Catalysts lower the barrier without being used up`]])); extra.push(p); }

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const rows = () => page.$$eval('.lib-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || '));
const upload = async (path) => (await page.$('.lib-drop input[type=file]')).uploadFile(path);
const waitNote = async (re) => page.waitForFunction((src) => [...document.querySelectorAll('.lib-notes li')].some((li) => new RegExp(src).test(li.textContent)), { timeout: 30000 }, re.source);

// Home: rows with counts, top-level drop asks once and remembers.
await page.goto(`${BASE}#/library`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.lib-row', { timeout: 5000 });
console.log('home rows:', await rows());
await upload(files.pdf);
await page.waitForSelector('.modal select', { timeout: 5000 });
console.log('asked:', await t('.modal .modal-head h2'), '| suggested:', await page.$eval('.modal select', (e) => e.selectedOptions[0].textContent.trim()), '| remember:', await t('.modal label.hint'));
await page.$$eval('.modal .btn.primary', (els) => els[0].click());
await waitNote(/CHM-113: CHM113 Topic3 Stoichiometry/);
console.log('first note:', await t('.lib-notes li'));
await upload(files.pptx);
await sleep(300);
console.log('second asked?', !!(await page.$('.modal')));
await waitNote(/CHM113 Week5 GasLaws/);
console.log('remembered:', await t('.lib-notes li'), '| map:', await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.materialsNameMap)));
await sleep(300);
console.log('home rows after:', (await rows()).split(' || ')[0]);
await page.screenshot({ path: `${out}-home.png`, fullPage: false });

// Class page: drops file automatically; sections; syllabus; rename; move; search scope; collapse.
await page.$$eval('.lib-row', (els) => els.find((e) => /CHM-113/.test(e.textContent)).click());
await page.waitForSelector('.lib-class-title', { timeout: 5000 });
console.log('class page:', await t('.lib-class-title'), '| drop label:', await t('.lib-drop b'));
await upload(files.wav);
await waitNote(/Recording saved/);
await upload(files.syl);
await waitNote(/Syllabus saved/);
await sleep(400);
console.log('sections:', await page.$$eval('.lib-section', (els) => els.map((e) => e.dataset.kind).join(' | ')), '| headings:', await page.$$eval('.lib-section .section-title', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
console.log('recording:', await t('.lib-section[data-kind="recordings"] .rec-card .inline-title'), '| decks:', await page.$$eval('.lib-section[data-kind="slides"] .deck-card .inline-title', (els) => els.map((e) => e.textContent.trim()).join(' | ')), '| syllabus:', await t('.syllabus-row .syllabus-status'));
console.log('no class headers inside class page:', !(await page.$('.lib-section .rec-group h3')));
// rename the stoichiometry deck
await page.$$eval('.deck-card .inline-title', (els) => els.find((e) => /Stoichiometry/.test(e.textContent)).click());
await page.waitForSelector('.inline-title-input', { timeout: 3000 });
await page.$eval('.inline-title-input', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'Stoichiometry lecture'); el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.keyboard.press('Enter');
await sleep(400);
console.log('renamed:', await page.$$eval('.deck-card .inline-title', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
// scoped search then all classes
await page.type('.search-main', 'gas laws');
await sleep(300);
console.log('search in class:', await t('.search-panel .hint.mono'));
// move Gas Laws to ESG-162
const esgId = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'ESG-162').id);
await page.$$eval('.deck-card', (els, esgId) => { const card = els.find((e) => /GasLaws/.test(e.textContent)); const sel = card.querySelector('select[aria-label^="Move"]'); sel.value = esgId; sel.dispatchEvent(new Event('change', { bubbles: true })); }, esgId);
await sleep(500);
console.log('after move, decks here:', await page.$$eval('.lib-section[data-kind="slides"] .deck-card .inline-title', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
await page.$eval('.search-main', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'gas laws'); el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(300);
console.log('scoped after move:', await t('.search-panel .hint.mono'));
await page.$$eval('.search-row .btn', (els) => els[0].click());
await sleep(300);
console.log('all classes:', await t('.search-row .btn'), '|', await t('.search-panel .hint.mono'), '|', await t('.search-hit .search-hit-head'));
// collapse: six more decks → 7 in CHM
for (const p of extra) { await upload(p); await waitNote(new RegExp(`Extra${p.match(/Extra(\d)/)[1]}`)); }
await sleep(500);
console.log('collapsed decks shown:', await page.$$eval('.lib-section[data-kind="slides"] .deck-card', (els) => els.length), '| toggle:', await t('.lib-section[data-kind="slides"] .diff-toggle'));
await page.$$eval('.lib-section[data-kind="slides"] .diff-toggle', (els) => els.find((e) => /Show all/.test(e.textContent))?.click());
await sleep(300);
console.log('expanded decks shown:', await page.$$eval('.lib-section[data-kind="slides"] .deck-card', (els) => els.length));
await page.screenshot({ path: `${out}-class.png`, fullPage: false });
// ESG page has the moved deck
await page.goto(`${BASE}#/library?c=${esgId}`, { waitUntil: 'networkidle0' });
await sleep(500);
console.log('ESG decks:', await page.$$eval('.deck-card .inline-title', (els) => els.map((e) => e.textContent.trim()).join(' | ')));
// Delete ESG-162 keeping materials → Unassigned row → move it back
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle0' });
await page.$$eval('.course-row', (els) => els.find((e) => /ESG-162(?!L)/.test(e.textContent) && !/Lab/.test(e.textContent)).click());
await page.waitForSelector('.modal form', { timeout: 5000 });
await page.waitForFunction(() => /slide deck/.test(document.querySelector('.class-admin .hint')?.textContent ?? ''), { timeout: 5000 });
console.log('admin text:', await t('.class-admin .hint'));
await page.$$eval('.modal .btn', (els) => els.find((e) => e.textContent.trim() === 'Delete class').click());
await sleep(200);
console.log('delete options:', await page.$$eval('.modal .btn.danger', (els) => els.map((e) => e.textContent.trim()).join(' || ')));
await page.$$eval('.modal .btn.danger', (els) => els.find((e) => /keep materials/.test(e.textContent)).click());
await sleep(500);
await page.goto(`${BASE}#/library`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.lib-row', { timeout: 5000 });
console.log('home has Unassigned:', /Unassigned/.test(await rows()));
await page.$$eval('.lib-row', (els) => els.find((e) => /Unassigned/.test(e.textContent)).click());
await sleep(600);
console.log('unassigned page:', await t('.lib-class-title'), '| decks:', await page.$$eval('.deck-card .inline-title', (els) => els.map((e) => e.textContent.trim()).join(' | ')), '| move options:', await page.$eval('.deck-card select[aria-label^="Move"]', (e) => [...e.options].map((o) => o.textContent.trim()).join(',')));
// Coach still gets materials
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const seen = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  seen.push(JSON.parse(req.postData() ?? '{}'));
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'ok (Stoichiometry lecture, page 2)' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
});
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.type('.chat-input input', 'what did we cover on the limiting reagent');
await page.$$eval('.chat-input button', (els) => els[0].click());
await page.waitForFunction(() => document.querySelectorAll('.chat-msg[data-role="assistant"]').length >= 1 && !document.querySelector('.chat-dots'), { timeout: 10000 });
const mat = seen[0]?.system?.find((b) => b.text.startsWith('Materials:'))?.text ?? '';
console.log('materials block:', /Decks on file:/.test(mat), '| picked:', /Stoichiometry lecture · slide 2\]\nLimiting reagent/.test(mat));
await browser.close();
