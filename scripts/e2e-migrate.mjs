// The upgrade path, from the state the user's browser is actually in: a version 2 store whose posts carry their
// read stamps on the post records, and no ledger. Opening the new build must carry those into the ledger, so the
// first sync after the upgrade reads nothing.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
let reads = 0;
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (!req.url().startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  reads++;
  const body = JSON.parse(req.postData() ?? '{}');
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'tool_use', id: 't', name: 'announcement_actions', input: { summary: 'x', actions: [] } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } }) });
});

// Load the app once so the planner store exists, then learn a course id.
await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle0' });
const chm = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113'));
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
const N = 30;

// Build the OLD store by hand: delete whatever the new build created, recreate at version 2, stamps on the posts.
// A static file on the same origin, so the app is not running and holding the store open.
const staticFile = await page.evaluate(() => document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? 'manifest.webmanifest');
await page.goto(new URL(staticFile, BASE).href, { waitUntil: 'domcontentloaded' }).catch(() => {});
const made = await page.evaluate(async (courseId, n) => {
  await new Promise((res, rej) => { const r = indexedDB.deleteDatabase('school-dashboard-announcements'); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('delete blocked: the app still has the store open')); });
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('school-dashboard-announcements', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('posts', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      d.createObjectStore('messages', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      d.createObjectStore('resources', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      d.createObjectStore('alerts', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = db.transaction('posts', 'readwrite');
  for (let i = 1; i <= n; i++) {
    tx.objectStore('posts').put({ id: `post-${i}`, courseId, forumId: 'f1', title: `Week ${i} note`, content: `<p>Reminder number ${i}.</p>`, text: `Reminder number ${i}.`, publishedAt: '2026-09-10T15:00:00.000Z', modifiedAt: '2026-09-10T15:05:00.000Z', author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [], pulledAt: '2026-09-20T00:00:00.000Z', readAt: null, processedAt: null, findings: null, review: {}, actionsAt: '2026-09-23T10:00:00.000Z', actionsModifiedAt: '2026-09-10T15:05:00.000Z', actionsSummary: 'News only.', actionCount: 0 });
  }
  await new Promise((res) => { tx.oncomplete = res; });
  const v = db.version;
  db.close();
  return v;
}, chm.id, N);
console.log(`old store built at version ${made}, ${N} posts stamped on the records, no ledger`);

// Open the new build: the upgrade runs.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await sleep(800);
const after = await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('school-dashboard-announcements'); r.onsuccess = () => res(r.result); });
  const n = db.objectStoreNames.contains('reads') ? await new Promise((res) => { const r = db.transaction('reads').objectStore('reads').count(); r.onsuccess = () => res(r.result); }) : -1;
  const v = db.version;
  db.close();
  return { version: v, ledger: n };
});
console.log(`after opening the new build: version ${after.version}, ledger entries ${after.ledger} (want ${N})`);

// First sync after the upgrade, carrying the same 30 posts.
const posts = Array.from({ length: N }, (_, i) => ({ id: `post-${i + 1}`, forumId: 'f1', title: `Week ${i + 1} note`, content: `<p>Reminder number ${i + 1}.</p>`, publishedAt: '2026-09-10T15:00:00.000Z', modifiedAt: '2026-09-10T15:05:00.000Z', author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] }));
const payload = { kind: 'halo-export', version: 1, build: 'e2e', exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [{ id: `h-${chm.id}`, slugId: 'X', classCode: `${chm.code}-X`, courseCode: chm.code, name: chm.name, instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [], announcements: posts, resources: [], discussions: [], messages: [] }], alerts: [], problems: [] };
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await sleep(2500);
const gate = await page.$$eval('.modal .hint', (els) => els.map((e) => e.textContent).find((t) => /About to read/.test(t)) ?? null);
console.log(`first sync after upgrade: ${reads} reads (want 0) | guard shown: ${!!gate}`);
await browser.close();
