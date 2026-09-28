// The reader on the real path, not a mock: a throwaway account, the app built against the real project, one post
// synced on "device A" and read through the deployed function, then "device B" (a fresh browser, signed in, never
// synced) must show the post already read with no model call. The throwaway is removed at the end.
//
// Needs a keys file OUTSIDE the repo with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SERVICE_ROLE (one per line),
// and the app built with the first two:  VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npx vite build --outDir dist-e2e
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-account.mjs
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { currentBuild } from './lib/build.mjs';
const keysPath = process.env.KEYS_ENV;
if (!keysPath) { console.error('KEYS_ENV is required (a keys file outside the repo).'); process.exit(2); }
const env = Object.fromEntries(readFileSync(keysPath, 'utf8').trim().split('\n').map((l) => l.split('=')));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BUILD = await currentBuild(BASE);
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const email = `e2e-account-${Date.now()}@example.invalid`;
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (cErr) throw cErr;
const userId = created.user.id;
const mint = async () => { const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); const { data } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }); return { session: data.session, client: c }; };
const first = await mint();
const { data: trial } = await first.client.rpc('start_trial');
console.log('throwaway', email, '· trial', JSON.stringify(trial));
const post = { id: 'e2e-account-1', forumId: 'f1', title: 'Office hours this week', content: '<p>Office hours move to Thursday 1 to 2 this week only. Also, the lab report template is attached; use it for Lab 3 or lose formatting points.</p>', publishedAt: '2026-09-25T15:00:00.000Z', modifiedAt: '2026-09-25T15:00:00.000Z', author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const done = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' };
async function device(name, { seed, sync }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const calls = [];
  page.on('response', (r) => { if (r.url().includes('/functions/v1/ai') && r.request().method() === 'POST') calls.push(r.status()); });
  const { session } = await mint();
  await page.goto(`${BASE}#/now${seed ? '?seed=1' : ''}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  await page.evaluate(({ s, ob, key }) => { const raw = localStorage.getItem('school-dashboard:v1'); if (raw) { const d = JSON.parse(raw); d.settings.onboarding = ob; d.settings.maxOnboarding = { startedAt: 'x', step: 'done', doneAt: 'x' }; d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); } localStorage.setItem(key, JSON.stringify(s)); }, { s: session, ob: done, key: `sb-${ref}-auth-token` });
  await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500);
  if (sync) {
    const chm = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113'));
    const payload = { kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'announcements'], classes: [{ id: `h-${chm.id}`, slugId: 'X', classCode: 'CHM-113-X', courseCode: 'CHM-113', name: chm.name, instructors: [], stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [], announcements: [post], resources: [], discussions: [], messages: [] }] };
    await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
    await page.waitForTimeout(1500); await page.keyboard.press('Escape');
  }
  let entry = null;
  for (let i = 0; i < 30 && !entry; i++) { await page.waitForTimeout(1000); entry = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('school-dashboard-announcements', 3); r.onsuccess = () => { const db = r.result; const g = db.transaction('reads').objectStore('reads').get('e2e-account-1'); g.onsuccess = () => { db.close(); res(g.result ?? null); }; g.onerror = () => res(null); }; r.onerror = () => res(null); })); }
  const courses = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1') ?? '{"courses":[]}').courses.length);
  await page.goto(`${BASE}#/inbox`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const inbox = await page.evaluate(() => ({ head: document.querySelector('.lib-head')?.innerText.replace(/\s+/g, ' ').slice(0, 80), rows: document.querySelectorAll('.news-summary').length }));
  console.log(`${name}: courses ${courses} · gateway calls ${JSON.stringify(calls)} · ledger ${entry ? 'yes' : 'none'} · inbox: ${inbox.head} · rows ${inbox.rows}`);
  await ctx.close();
  return { calls: calls.length, entry, rows: inbox.rows, courses };
}
let ok = false;
try {
  const a = await device('A (laptop: seed + sync)', { seed: true, sync: true });
  const b = await device('B (fresh phone: sign in only)', { seed: false, sync: false });
  const { data: log } = await admin.from('usage_log').select('kind, model, cost_usd').eq('user_id', userId);
  console.log('server usage_log:', JSON.stringify(log));
  ok = a.calls === 1 && b.calls === 0 && b.courses > 0 && !!b.entry && b.rows === 1 && (log ?? []).every((r) => r.model === 'claude-haiku-4-5-20251001');
} finally {
  await browser.close();
  for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements']) await admin.from(t).delete().eq('user_id', userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  console.log('throwaway removed:', error ? error.message : 'ok');
}
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
