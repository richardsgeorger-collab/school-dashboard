// The class grade the extension reads from Halo's page goes to the account (extension 0.11.1): sync-drop's `grade`, on
// the real backend with a throwaway on Free (no sync, nothing else touched). Checks: the class's Halo grade is replaced
// by a newer one, an older one is ignored, another class and every item stay as they were, a wrong key is refused,
// and Halo+ (the local build) shows the new grade on Classes.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-grade-save.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const DROP = `${env.VITE_SUPABASE_URL}/functions/v1/sync-drop`;
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const post = (body) => fetch(DROP, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://halo.gcu.edu' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

try {
  const who = await kit.persona('ended');
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await c.auth.setSession({ access_token: who.session.access_token, refresh_token: who.session.refresh_token });
  const { data: k } = await c.rpc('my_sync_key');
  const key = k?.key ?? k;
  const courses = (await db.from('courses').select('id, data').eq('user_id', who.id)).data;
  const [one, two] = courses;
  const slug = one.data.haloSlugId;
  const itemsBefore = JSON.stringify((await db.from('items').select('id, data').eq('user_id', who.id).order('id')).data);
  const at = new Date().toISOString();

  let r = await post({ key, grade: { slug, letter: 'A-', points: 452, maxPoints: 500, at } });
  const after = (await db.from('courses').select('data').eq('id', one.id).single()).data.data.haloGrade;
  check(r.status === 200 && r.j?.ok && after.letter === 'A-' && Math.abs(after.percent - 90.4) < 0.01 && after.at === at, `a newer grade replaces the class's Halo grade (${r.status} → ${after.letter} ${after.percent?.toFixed(1)}%)`);
  r = await post({ key, grade: { slug, letter: 'C', points: 350, maxPoints: 500, at: new Date(Date.now() - 3_600_000).toISOString() } });
  const still = (await db.from('courses').select('data').eq('id', one.id).single()).data.data.haloGrade;
  check(r.j?.already && still.letter === 'A-', 'an older reading is ignored');
  const twoAfter = (await db.from('courses').select('data').eq('id', two.id).single()).data.data.haloGrade;
  check(JSON.stringify(twoAfter) === JSON.stringify(two.data.haloGrade), 'another class is untouched');
  check(JSON.stringify((await db.from('items').select('id, data').eq('user_id', who.id).order('id')).data) === itemsBefore, 'no item changed, nothing synced');
  r = await post({ key: 'b'.repeat(48), grade: { slug, letter: 'F', points: 1, maxPoints: 500, at: new Date().toISOString() } });
  check(r.status === 401, `a key that is not the student's is refused (${r.status})`);
  r = await post({ key, grade: { slug: 'NOT-A-CLASS', letter: 'A', points: 1, maxPoints: 1, at: new Date().toISOString() } });
  check(r.status === 404, `a class that is not theirs is refused (${r.status})`);

  // Halo+ shows it.
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(({ ses, key: k2 }) => { if (!localStorage.getItem(k2)) localStorage.setItem(k2, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (rr) => rr.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await p.waitForTimeout(6000);
  for (const sel of ['.trial-end-choices button:has-text("Stay on Free")', '.joy-card button:has-text("Nice")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  await p.waitForTimeout(1500);
  const card = (await p.locator('.class-card', { hasText: one.data.code }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/90\.4%/.test(card) && /A-/.test(card), `Classes shows the new grade ("${card.slice(0, 90)}")`);
  await p.screenshot({ path: 'docs/screens/halo-grades/app-classes-after-grade.png' });
  await browser.close();
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
