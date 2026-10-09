// A check-off while the announcement reader is working (George's quality-of-life loop, 2026-10-08): on a first open
// the reader reads the posts (live AI, tens of seconds) and attaches what it finds; a Done pressed meanwhile used to
// come back as "to do" when the reader wrote. Real backend, a throwaway Max student: press Done on the hero right
// after the first open, wait for the reader, and the item must still be done on the server, on the device, and after
// a reload, with the reader's parts attached.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-read-race.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const s = await kit.persona('max');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.hero', { timeout: 30000 });
  await sleep(1500);
  for (const sel of ['.ext-setup-sheet button.btn:has-text("Skip for now")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  const title = (await p.locator('.hero .hero-title, .hero h2').first().innerText()).trim();
  const row = (await db.from('items').select('id, data').eq('user_id', s.id)).data.find((r) => r.data.title === title || r.data.label === title);
  check(!!row, `the hero is "${title}"`);
  await p.locator('[data-tour="done"]').click();
  await sleep(2500);
  const server = async () => (await db.from('items').select('data').eq('id', row.id).single()).data.data;
  check((await server()).status === 'done', '2 s after Done: done on the server');
  // The reader: three posts on a first open, well under half a minute.
  await sleep(35000);
  const after = await server();
  check(after.status === 'done' && !!after.completedAt, `35 s later, with the reader done: still done on the server (requirements attached: ${(after.requirements ?? []).length})`);
  const local = await p.evaluate((id) => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.id === id)?.status, row.id);
  check(local === 'done', `still done on the device (${local})`);
  await p.reload({ waitUntil: 'load' });
  await sleep(4000);
  const inThen = await p.locator('.then').innerText().then((t) => t.includes(title)).catch(() => false);
  check(!inThen && (await p.evaluate((id) => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.id === id)?.status, row.id)) === 'done', 'after a reload: still done, not back in Then');
  await ctx.close();
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
