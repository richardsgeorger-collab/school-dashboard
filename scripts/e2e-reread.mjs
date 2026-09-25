// Two identical syncs in a row, then one with a single post's body changed. Counts model calls and logs what the
// read stamp looked like before and after each sync, for three posts, so a re-read can be traced to its cause.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const POSTS = Number(process.env.POSTS ?? 30);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1400 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const reads = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (!req.url().startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  const user = typeof body.messages?.at(-1)?.content === 'string' ? body.messages.at(-1).content : '';
  reads.push((user.match(/^Title: (.+)$/m) ?? [])[1] ?? '?');
  const input = { summary: 'News only.', actions: [] };
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'tool_use', id: 't', name: 'announcement_actions', input }], stop_reason: 'tool_use', usage: { input_tokens: 1500, output_tokens: 60 } }) });
});

await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.reload({ waitUntil: 'networkidle0' });
const chm = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113'));

// Halo's real shape: every post carries a modifiedDate, and the same post comes back on every sync.
const post = (n, body) => ({ id: `post-${n}`, forumId: 'f1', title: `Week ${n} note`, content: `<p>${body ?? `Reminder number ${n}.`}</p>`, publishedAt: '2026-09-10T15:00:00.000Z', modifiedAt: '2026-09-10T15:05:00.000Z', author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] });
const payload = (posts) => ({
  kind: 'halo-export', version: 1, build: 'e2e', exportedAt: new Date().toISOString(), source: 'bookmarklet',
  classes: [{ id: `h-${chm.id}`, slugId: 'X', classCode: `${chm.code}-X`, courseCode: chm.code, name: chm.name, instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [], announcements: posts, resources: [], discussions: [], messages: [] }],
  alerts: [], problems: [],
});
const same = Array.from({ length: POSTS }, (_, i) => post(i + 1));

const stamps = () =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('school-dashboard-announcements'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const out = {};
    for (const store of ['posts', 'reads']) {
      if (!db.objectStoreNames.contains(store)) continue;
      const all = await new Promise((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); });
      for (const x of all) if (['post-1', 'post-2', 'post-3'].includes(x.id)) out[`${store}:${x.id}`] = { actionsAt: x.actionsAt ?? x.at ?? null, actionsModifiedAt: x.actionsModifiedAt ?? null, modifiedAt: x.modifiedAt ?? null, hash: x.hash ?? x.actionsHash ?? null };
    }
    db.close();
    return out;
  });

const sync = async (label, posts) => {
  reads.length = 0;
  await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload(posts));
  await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
  await sleep(1500);
  const gate = await page.$$eval('.modal .hint', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).find((t) => /before|costs about|Stop|more than half/i.test(t)) ?? null);
  if (gate) {
    console.log(`  [${label}] gate shown: ${gate.slice(0, 150)}`);
    const pressed = await page.$$eval('.modal .btn', (els) => { const b = els.find((e) => /Read them|Read \d+ anyway/.test(e.textContent)); if (!b) return false; b.click(); return true; });
    console.log(`  [${label}] pressed read: ${pressed}`);
  }
  await page.waitForFunction(() => /Read \d+ announcement|asks anything|From your announcements|could not be read/.test(document.querySelector('.modal-body')?.textContent ?? ''), { timeout: 30000 }).catch(() => {});
  await sleep(800);
  const line = await page.$$eval('.modal .hint', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).find((t) => /Read \d+|asks anything|From your|could not be read|came in/.test(t)) ?? '(no line)');
  await page.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Close|Cancel|Done/.test(e.textContent)) ?? els[0]).click());
  await sleep(500);
  return { reads: reads.length, gate: !!gate, line };
};

console.log(`--- ${POSTS} posts ---`);
const s1 = await sync('sync 1', same);
console.log(`sync 1: ${s1.reads} reads | ${s1.line.slice(0, 120)}`);
const before2 = await stamps();
const s2 = await sync('sync 2 identical', same);
const after2 = await stamps();
console.log(`sync 2 (identical): ${s2.reads} reads (want 0) | gate shown: ${s2.gate} | ${s2.line.slice(0, 120)}`);
console.log('\nstamp for three posts, before sync 2 -> after sync 2:');
for (const k of Object.keys({ ...before2, ...after2 }).sort()) console.log(`  ${k}\n    before: ${JSON.stringify(before2[k] ?? null)}\n    after:  ${JSON.stringify(after2[k] ?? null)}`);

const edited = same.map((p, i) => (i === 4 ? post(5, 'Reminder number 5. The quiz now covers 1.4 to 2.7.') : p));
const s3 = await sync('sync 3 one body changed', edited);
console.log(`\nsync 3 (one body changed): ${s3.reads} reads (want 1) | read: ${reads.join(', ')}`);
const s4 = await sync('sync 4 identical again', edited);
console.log(`sync 4 (identical again): ${s4.reads} reads (want 0)`);

await browser.close();
