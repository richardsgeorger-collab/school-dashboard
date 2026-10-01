// The end of the free week (George, 2026-10-01), on the real backend with throwaway students: the recap's numbers
// come from the account (server AI calls and announcement reads, the planner's classes and moved dates), the 1 to 10
// rating's three paths (low → comment into Feedback, high → invite, skip), the plans never blocked, the GCBC lines,
// and the Admin card. Screens: desktop and phone, light and dark. Throwaways removed.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-trial-end.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/trial-end';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const ago = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const DEVICES = { desk: { viewport: { width: 1280, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

/** A student whose free week ended two days ago, with a week of real use behind the numbers. */
async function student() {
  const s = await kit.persona('ended');
  const day = ago(5).slice(0, 10);
  await db.from('usage_log').insert([
    ...Array.from({ length: 4 }, () => ({ user_id: s.id, day, kind: 'tutor', model: 'claude-haiku-4-5', created_at: ago(5) })),
    ...Array.from({ length: 2 }, () => ({ user_id: s.id, day, kind: 'worksheet', model: 'claude-haiku-4-5', created_at: ago(4) })),
  ]);
  await db.from('read_ledger').insert(Array.from({ length: 5 }, (_, i) => ({ user_id: s.id, post_id: `e2e-post-${i}`, hash: 'h', read_at: ago(6), action_count: i < 2 ? 2 : 0 })));
  const { data: items } = await db.from('items').select('id, data').eq('user_id', s.id).limit(2);
  const src = { kind: 'announcement', id: 'e2e-post-0', title: 'Lab change', quote: 'Bring goggles', at: ago(6) };
  await db.from('items').update({ data: { ...items[0].data, dateChange: { from: ago(3), at: ago(5), source: src } }, updated_at: new Date().toISOString() }).eq('id', items[0].id);
  await db.from('items').update({ data: { ...items[1].data, requirements: [{ id: randomUUID(), text: 'Bring your own goggles', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: ago(6) }] }, updated_at: new Date().toISOString() }).eq('id', items[1].id);
  return s;
}

/** The whole trial screen in one picture: it scrolls inside its own layer, so it is laid out on the page for the shot. */
async function shotAll(p, path) {
  await p.evaluate(() => {
    const el = document.querySelector('.trial-ended');
    const style = document.createElement('style');
    style.textContent = '#root{display:none!important}.trial-ended{position:static!important;height:auto!important;max-height:none!important;overflow:visible!important}.trial-ended .onboard-inner{height:auto!important;max-height:none!important;overflow:visible!important}';
    document.head.appendChild(style);
    document.body.appendChild(el);
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path, fullPage: true });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (s, dev, scheme) => {
  const ctx = await browser.newContext({ ...DEVICES[dev], colorScheme: scheme });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.trial-ended', { timeout: 20000 });
  await p.waitForSelector('.ended-number', { timeout: 15000 }).catch(() => undefined);
  await p.waitForTimeout(1500);
  return { ctx, p };
};
try {
  const raters = [];
  // The screen as it first opens, four ways.
  const first = await student();
  raters.push(first);
  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    const { ctx, p } = await open(first, dev, scheme);
    const text = await p.locator('.trial-ended').innerText();
    if (dev === 'desk' && scheme === 'light') {
      const lines = await p.locator('.ended-number').allInnerTexts();
      const has = (re) => lines.some((l) => re.test(l.replace(/\s+/g, ' ')));
      check(has(/^6 classes synced from Halo/), `recap: classes synced (${lines.length} lines: ${lines.map((l) => l.replace(/\s+/g, ' ')).join(' | ')})`);
      check(has(/^5 announcements read for you/) && has(/^4 requirements found in announcements/), 'recap: announcements read and requirements found, from the server');
      check(has(/^1 due date change caught/), 'recap: a date an announcement moved, caught');
      check(has(/^2 study plans and practice sets built/) && has(/^4 questions answered/), 'recap: practice sets and questions, from the server');
      check(lines.every((l) => !/^0\b/.test(l.trim())), 'no zero lines');
      check(/How much did Halo\+ help this week\?/.test(text) && (await p.locator('.trial-rating-n').count()) === 10, 'the 1 to 10 question is there');
      check(await p.locator('button:has-text("Keep Max")').isEnabled(), 'the plans are usable without answering');
      check(/What you had this week/.test(text) && /About a small at GCBC\. Except this one actually helps\./.test(text) && /About a large at GCBC, minus the regret\./.test(text), 'Max is marked as this week; the GCBC lines sit with Plus (small) and Max (large)');
      check((text.match(/Cancel anytime/g) ?? []).length >= 2 && (text.match(/plus tax where applicable/g) ?? []).length >= 2, 'Cancel anytime and plus tax where applicable kept beside each price');
      const plus = await p.locator('.plan-choice:has-text("Plus ·") .gcbc .cup').getAttribute('data-size');
      const max = await p.locator('.plan-choice:has-text("Max ·") .gcbc .cup').getAttribute('data-size');
      check(plus === 'small' && max === 'large', 'small cup with Plus, large with Max');
    }
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!wide, `${dev} ${scheme}: no sideways scroll`);
    await shotAll(p, `${OUT}/1-ended-${dev}-${scheme}.png`);
    await ctx.close();
  }

  // Low: what would make it better → Feedback.
  const low = await student();
  raters.push(low);
  for (const [dev, scheme] of [['desk', 'light'], ['phone', 'dark']]) {
    await db.from('settings').select('data').eq('user_id', low.id).single().then(({ data }) => db.from('settings').update({ data: { ...data.data, trialRating: null } }).eq('user_id', low.id));
    const { ctx, p } = await open(low, dev, scheme);
    await p.click('.trial-rating-n:has-text("4")');
    await p.waitForSelector('.trial-rating textarea');
    await p.fill('.trial-rating textarea', 'Wish it read my discussion replies too.');
    await p.locator('.trial-rating').screenshot({ path: `${OUT}/2-low-${dev}-${scheme}.png` });
    await p.click('.trial-rating button:has-text("Send")');
    await p.waitForSelector('.trial-rating [role=status]', { timeout: 10000 });
    await ctx.close();
  }
  const { data: lowRow } = await db.from('trial_ratings').select('rating, comment').eq('user_id', low.id).single();
  const { data: fb } = await db.from('feedback').select('text, screen').eq('user_id', low.id);
  check(lowRow?.rating === 4 && /discussion replies/.test(lowRow?.comment ?? ''), 'a 4 is saved with its comment');
  check(fb?.some((f) => f.screen === '#trial-end' && /rated 4\/10: Wish it read/.test(f.text)), 'the comment lands in Feedback');

  // High: thanks and the invite, once.
  const high = await student();
  raters.push(high);
  for (const [dev, scheme] of [['desk', 'dark'], ['phone', 'light']]) {
    await db.from('settings').select('data').eq('user_id', high.id).single().then(({ data }) => db.from('settings').update({ data: { ...data.data, trialRating: null } }).eq('user_id', high.id));
    const { ctx, p } = await open(high, dev, scheme);
    await p.click('.trial-rating-n:has-text("9")');
    await p.waitForSelector('.trial-rating .plan-choice-invite', { timeout: 5000 });
    check((await p.locator('.trial-ended .plan-choice-invite').count()) === 1 && /both get 30 days of Plus free/.test(await p.locator('.trial-rating').innerText()), `${dev} ${scheme}: a 9 says thanks and offers the invite, once`);
    await p.locator('.trial-rating').screenshot({ path: `${OUT}/3-high-${dev}-${scheme}.png` });
    await ctx.close();
  }
  const { data: highRow } = await db.from('trial_ratings').select('rating').eq('user_id', high.id).single();
  check(highRow?.rating === 9, 'a 9 is saved');

  // Skip: gone, and the plans and invite are still there.
  const skip = await student();
  {
    const { ctx, p } = await open(skip, 'desk', 'light');
    await p.click('.trial-rating button:has-text("Skip")');
    await p.waitForTimeout(500);
    check((await p.locator('.trial-rating').count()) === 0 && (await p.locator('button:has-text("Keep Max")').isVisible()) && (await p.locator('.trial-ended .plan-choice-invite').count()) === 1, 'Skip removes the question; the plans and the invite stay');
    await ctx.close();
    const { count } = await db.from('trial_ratings').select('user_id', { count: 'exact', head: true }).eq('user_id', skip.id);
    check(count === 0, 'a skip saves no rating');
  }

  // Admin: the average and the comment (the raters counted as real for this check).
  const boss = await kit.persona('admin');
  const bossC = (await kit.signIn(boss.email)).c;
  for (const r of raters) await bossC.rpc('admin_set_test', { uid: r.id, test: false });
  const { data: stats } = await bossC.rpc('admin_trial_ratings');
  check(stats.n >= 2 && stats.comments.some((c) => /discussion replies/.test(c.comment)), `Admin: ${stats.n} ratings, average ${stats.average}, the comment listed`);
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: boss.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
    await p.waitForSelector('.admin-ratings', { timeout: 20000 });
    await p.waitForTimeout(1000);
    await p.locator('.admin-ratings').screenshot({ path: `${OUT}/4-admin-${scheme}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
