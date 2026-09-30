// The Admin page's growth section and account list (George, 2026-09-30), on the real backend. Makes a throwaway admin
// and throwaway "students" in known states, marks them real for the check (the rule would count every
// @example.invalid account as test), then checks: each lands in exactly one plan bucket, the totals move by exactly
// what was added, the Test toggle takes an account out of every number, and nothing on the page is monospace.
// Screenshots in dark and light to docs/screens/admin/. Every throwaway is removed at the end.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-admin-growth.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/admin';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const boss = await kit.persona('admin');
  const growth = async () => (await (await kit.signIn(boss.email)).c.rpc('admin_growth')).data;
  const before = await growth();
  // Students in known states, counted as real for this check.
  const made = {};
  for (const kind of ['synced', 'trial-1d', 'ended', 'plus', 'max', 'friend', 'invited']) made[kind] = await kit.persona(kind);
  const ids = Object.values(made).map((p) => p.id);
  const bossC = (await kit.signIn(boss.email)).c;
  for (const id of ids) await bossC.rpc('admin_set_test', { uid: id, test: false });
  const after = await growth();
  const diff = (k) => (after.plans[k] ?? 0) - (before.plans[k] ?? 0);
  check(after.total - before.total === ids.length, `real students +${after.total - before.total} (added ${ids.length})`);
  check(after.new_today - before.new_today === ids.length, `+${after.new_today - before.new_today} today`);
  const expected = { trial: 3, free: 1, plus_paid: 1, max_paid: 1, max_friend: 1 }; // synced, trial-1d, invited on the trial; ended on Free
  for (const [k, n] of Object.entries(expected)) check(diff(k) === n, `plan "${k}": +${diff(k)} (expected +${n})`);
  const sumBuckets = Object.values(after.plans).reduce((a, n) => a + n, 0);
  check(sumBuckets === after.total, `the plans add up to the total: ${sumBuckets} = ${after.total}`);
  check(after.paying.length - before.paying.length === 2, `paying +${after.paying.length - before.paying.length} (the Plus and Max throwaways)`);
  // Marking one as test takes it out of every number.
  await bossC.rpc('admin_set_test', { uid: made.plus.id, test: true });
  const marked = await growth();
  check(marked.total === after.total - 1 && (marked.plans.plus_paid ?? 0) === (after.plans.plus_paid ?? 0) - 1 && marked.paying.length === after.paying.length - 1, 'marking an account as test takes it out of the total, its plan and paying');
  // The page, dark and light.
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
    await ctx.addInitScript(({ s, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, { s: boss.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const page = await ctx.newPage();
    await page.goto(`${BASE}#/admin`, { waitUntil: 'load' });
    await page.waitForSelector('.growth-num', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/admin-${scheme}.png` });
    await page.screenshot({ path: `${OUT}/admin-${scheme}-full.png`, fullPage: true });
    if (scheme === 'dark') {
      const mono = await page.$$eval('.admin-grid *', (els) => els.filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && /mono|Menlo|Courier|SF Mono/i.test(getComputedStyle(e).fontFamily)).map((e) => e.tagName + '.' + e.className).slice(0, 5));
      check(mono.length === 0, `no monospace on the page${mono.length ? `: ${mono.join(', ')}` : ''}`);
      const total = await page.$eval('.growth-main .growth-num', (e) => e.textContent).catch(() => '');
      check(Number(total) === marked.total, `the page shows ${total} real students`);
      const rows = await page.$$eval('.acct-table tbody tr', (r) => r.length);
      const greyed = await page.$$eval('.acct-table tbody tr[data-test]', (r) => r.length);
      check(rows > 0 && greyed > 0, `the account list: ${rows} rows, ${greyed} test accounts greyed`);
      await page.fill('input[aria-label="Search by email"]', made.max.email.slice(0, 22));
      await page.waitForTimeout(400);
      check((await page.$$eval('.acct-table tbody tr', (r) => r.length)) === 1, 'search by email finds the one account');
      await page.fill('input[aria-label="Search by email"]', '');
      await page.selectOption('select[aria-label="Plan"]', 'max_paid');
      await page.waitForTimeout(300);
      const plans = await page.$$eval('.acct-table tbody tr td:nth-child(4)', (t) => [...new Set(t.map((x) => x.textContent))]);
      check(plans.length === 1 && plans[0] === 'Max (paid)', `filter by plan: ${plans.join(', ')}`);
      await page.selectOption('select[aria-label="Plan"]', 'all');
      await page.locator('.admin-accounts').screenshot({ path: `${OUT}/accounts-${scheme}.png` });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
