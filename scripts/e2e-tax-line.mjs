// "plus tax where applicable" beside every price (George, 2026-09-30): prices are before tax and Stripe adds sales tax
// at checkout where it applies, so no price on screen may appear without it. Real backend, throwaway accounts.
// Landing plans (signed out), You's plans, the frozen banner, the peek, the end-of-trial choices, the last-day
// "Keep Max" card. Screens to docs/screens/tax-line/.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-tax-line.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/tax-line';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const DAY = 86_400_000;
const TAX = 'plus tax where applicable';
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const newUser = async () => {
  const email = `e2e-tax-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
const lastPull = new Date(Date.now() - 8 * DAY).toISOString();
const settingsOf = (extra = {}) => ({ timezone: 'America/Phoenix', lastPull: { at: lastPull, source: 'bookmarklet' }, onboarding: { startedAt: 'x', step: 'done', doneAt: lastPull, skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, ...extra });
const seedData = async (u, settings) => {
  const courseId = randomUUID();
  const now = new Date().toISOString();
  await admin.from('courses').insert({ id: courseId, user_id: u.id, updated_at: now, data: { id: courseId, code: 'CHM-113', name: 'General Chemistry I', color: '#2E7D6B', credits: 3, instructors: [], meetings: [], online: false, termStart: '2026-09-01', termEnd: '2026-12-15', haloClassId: 'hc-chm', updatedAt: now } });
  await admin.from('settings').upsert({ user_id: u.id, updated_at: now, data: settings });
};
const payload = () => ({ kind: 'halo-export', version: 1, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments'], classes: [{ id: 'hc-chm', slugId: 'chm', classCode: 'CHM-113-O500', courseCode: 'CHM-113', name: 'General Chemistry I', instructors: [], startDate: '2026-09-01', endDate: '2026-12-15', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [{ id: 'a9', title: 'Topic 4 Homework', dueDate: new Date(Date.now() + 5 * DAY).toISOString(), points: 20, type: 'ASSIGNMENT', status: null, score: null, description: '' }], announcements: [], resources: [], discussions: [], messages: [] }] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (u, settings, device, scheme, hash) => {
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  if (u) await ctx.addInitScript(({ s, key, settings }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: u.session, key: `sb-${ref}-auth-token`, settings });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  return { ctx, page };
};
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
// Every "$N.NN" on the page has the tax line within the same block.
const priced = (p, sel) => p.$$eval(sel, (els, TAX) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /\$\d+\.\d\d/.test(t)).map((t) => ({ t: t.slice(0, 90), ok: t.toLowerCase().includes(TAX) })), TAX);
const DESK = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { ...devices['iPhone 14'], deviceScaleFactor: 2 };
try {
  for (const scheme of ['light', 'dark']) {
    const main = scheme === 'light';
    const say = (ok, line) => (main ? check(ok, line) : ok || console.log(`note ${scheme}: ${line}`));
    // Landing, signed out.
    for (const [name, dev] of [['desk', DESK], ['phone', PHONE]]) {
      const { ctx, page } = await open(null, null, dev, scheme, '#/home');
      await page.locator('.landing-plans').scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForTimeout(500);
      await page.locator('.landing-plans').screenshot({ path: `${OUT}/landing-plans-${name}-${scheme}.png` }).catch(() => undefined);
      const rows = await priced(page, '.landing-plan-price');
      say(rows.length === 2 && rows.every((r) => r.ok), `landing (${name}): ${rows.map((r) => r.t).join(' | ')}`);
      await ctx.close();
    }
    // Free after the Max week, end screen not yet seen: the end-of-trial choices, then the banner, the peek, You.
    const u = await newUser();
    await admin.from('profiles').update({ tier: 'free', trial_started_at: new Date(Date.now() - 8 * DAY).toISOString(), trial_ends_at: new Date(Date.now() - DAY).toISOString() }).eq('user_id', u.id);
    const st = settingsOf();
    await seedData(u, st);
    let { ctx, page } = await open(u, st, DESK, scheme, '#/now');
    await page.waitForSelector('.plan-choices', { timeout: 10000 }).catch(() => undefined);
    await page.screenshot({ path: `${OUT}/trial-end-desk-${scheme}.png` });
    const choices = await page.$$eval('.plan-choice', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    const paid = choices.filter((t) => /\$\d/.test(t));
    say(paid.length === 2 && paid.every((t) => t.includes(TAX)), `trial end: ${paid.map((t) => t.slice(0, 70)).join(' | ')}`);
    await page.click('.plan-choices button:has-text("Stay on Free")').catch(() => undefined);
    await page.waitForTimeout(1200);
    await page.waitForSelector('.frozen-banner', { timeout: 8000 }).catch(() => undefined);
    const banner = await text(page, '.frozen-banner');
    await page.locator('.frozen-banner').screenshot({ path: `${OUT}/frozen-banner-desk-${scheme}.png` }).catch(() => undefined);
    say(/\$4\.99 a month/.test(banner) && banner.includes(TAX), `frozen banner: "${banner.slice(0, 140)}"`);
    await page.click('.frozen-banner button:has-text("Sync")');
    await page.waitForTimeout(800);
    await page.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
    await page.waitForSelector('.peek', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/peek-desk-${scheme}.png` });
    const peek = await text(page, '.peek-actions');
    say(/Plus \$4\.99/.test(peek) && /Max \$7\.99/.test(peek) && (peek.match(new RegExp(TAX, 'g')) ?? []).length === 2, `peek: "${peek}"`);
    await ctx.close();
    ({ ctx, page } = await open(u, { ...st, trialEndSeen: 'x' }, PHONE, scheme, '#/you?s=plan'));
    await page.waitForSelector('.plan-price', { timeout: 10000 }).catch(() => undefined);
    await page.locator('.plan-price').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/you-plans-phone-${scheme}.png` });
    const plans = await priced(page, '.plan-price');
    say(plans.length >= 2 && plans.every((r) => r.ok), `You → plans: ${plans.map((r) => r.t).join(' | ')}`);
    await ctx.close();
    // The last day of the Max week: "Keep Max, $7.99 a month" on You.
    const v = await newUser();
    await admin.from('profiles').update({ trial_started_at: new Date(Date.now() - 6.5 * DAY).toISOString(), trial_ends_at: new Date(Date.now() + 0.4 * DAY).toISOString() }).eq('user_id', v.id);
    const sv = settingsOf();
    await seedData(v, sv);
    ({ ctx, page } = await open(v, sv, DESK, scheme, '#/you'));
    const keep = page.locator('a:has-text("Keep Max")').first();
    await keep.waitFor({ timeout: 10000 }).catch(() => undefined);
    await keep.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/keep-max-desk-${scheme}.png` });
    const row = await keep.evaluate((a) => a.parentElement.innerText.replace(/\s+/g, ' ')).catch(() => '');
    say(/\$7\.99 a month/.test(row) && row.includes(TAX), `last day, Keep Max: "${row}"`);
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan', 'winback_sends']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
