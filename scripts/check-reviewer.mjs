// Signs in to the reviewer account in a brand-new browser (nothing on the device, as a Web Store reviewer would) and
// checks it lands on Now with the account's own data: the six sample classes, "via extension", no onboarding. Then that
// the account's saved settings on the server were not replaced by the new device's defaults. Screens to
// docs/screens/reviewer/.
//   KEYS_ENV=... [BASE=https://haloplus.app/] node scripts/check-reviewer.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'https://haloplus.app/';
const EMAIL = process.env.EMAIL ?? 'richards.georger+review@gmail.com';
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
const uid = s.user.id;
const OUT = 'docs/screens/reviewer';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await ctx.addInitScript(({ s, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, { s: s.session, key: `sb-${ref}-auth-token` });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
await p.waitForTimeout(8000);
await p.click('.tour-tip button:has-text("Skip")', { timeout: 1500 }).catch(() => undefined);
await p.waitForTimeout(500);
const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const synced = await p.$eval('.synced', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
await p.screenshot({ path: `${OUT}/now.png` });
const overlay = await p.$('.onboard, .upgrade, [role="dialog"]');
check(!/Step \d of 5/.test(text) && !overlay, `lands on Now, nothing over it${overlay ? ` (covered by ${await overlay.getAttribute('class')})` : ''}`);
check(/via extension/.test(synced), `"${synced}"`);
for (const [name, hash] of [['classes', '#/classes'], ['grades', '#/grades'], ['inbox', '#/inbox'], ['calendar', '#/calendar']]) {
  await p.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${name}.png` });
}
const classes = await p.goto(`${BASE}#/classes`).then(() => p.waitForTimeout(2500)).then(() => p.evaluate(() => [...document.querySelectorAll('.class-card')].map((e) => e.innerText.split('\n')[0])));
check(classes.length === 6 && !classes.some((c) => /CHM|ENG-105|ESG|UNV-106/.test(c)), `six sample classes: ${classes.join(', ')}`);
const { data: cloud } = await admin.from('settings').select('data').eq('user_id', uid).single();
check(cloud.data.lastPull?.via === 'extension' && cloud.data.onboarding?.step === 'done', `the account's saved settings survived the new device (onboarding ${cloud.data.onboarding?.step}, last sync via ${cloud.data.lastPull?.via})`);
check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await b.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
