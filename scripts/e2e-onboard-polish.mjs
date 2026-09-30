// Onboarding and Now polish (George, 2026-09-30), on the real backend with throwaway accounts:
//   1. The plan demo reads as a demo: title, device frame with "Example student", a FREE/PLUS/MAX pill, the caption
//      under the frame, tabs that jump; the animation is the same.
//   2. The gift screen: the Halo+ ring lights up in gold (SVG), no emoji anywhere in onboarding.
//   3. The bookmarks bar step always shows (desktop), with "My bookmarks bar is already showing".
//   4. The quiet invite line at the foot of Now: not on day one, not beside the invite card, dismissible for two weeks.
// Screens to docs/screens/onboard-polish/<device>-<scheme>/.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-onboard-polish.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const DAY = 86_400_000;
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const newUser = async () => {
  const email = `e2e-polish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const DESK = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { ...devices['iPhone 14'], deviceScaleFactor: 2 };

const onboarding = async (name, device, scheme) => {
  const OUT = `docs/screens/onboard-polish/${name}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const main = scheme === 'light';
  const say = (ok, line) => (main ? check(ok, `${name}: ${line}`) : ok || console.log(`note ${name}-${scheme}: ${line}`));
  const u = await newUser();
  // Motion on: the animations are what is being looked at.
  const ctx = await browser.newContext({ ...device, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('.onboard button:has-text("Start")').catch(() => undefined);
  await page.waitForTimeout(400);
  await page.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: u.session, key: `sb-${ref}-auth-token` });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.story', { timeout: 15000 }).catch(() => undefined);
  const title = await text(page, '.story-title');
  const tag = await text(page, '.story-device-tag');
  say(title === 'See what each plan does' && /^Example student/.test(tag), `the demo: "${title}", frame says "${tag}"`);
  const want = [
    ['FREE', 'You add everything yourself.'],
    ['PLUS', 'Everything from Halo, automatically. Hidden work found in announcements.'],
    ['MAX', 'Plus study plans, practice worksheets, and answers about your classes.'],
  ];
  for (const [i, [pill, cap]] of want.entries()) {
    await page.click(`.story-tabs button:nth-child(${i + 1})`);
    await page.waitForTimeout(2300);
    await page.screenshot({ path: `${OUT}/1-demo-${pill.toLowerCase()}.png` });
    const got = [await text(page, '.story-pill'), await text(page, '.story-caption'), await page.$eval(`.story-tabs button:nth-child(${i + 1})`, (b) => b.getAttribute('aria-selected')).catch(() => '')];
    say(got[0] === pill && got[1] === cap && got[2] === 'true', `tab ${pill}: pill "${got[0]}", caption "${got[1]}"`);
  }
  const frame = await page.$eval('.story-device', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, vw: window.innerWidth }; });
  say(frame.w < frame.vw * 0.95, `the frame is smaller than the screen (${Math.round(frame.w)} of ${frame.vw}px)`);
  // The gift.
  await page.click('.story-skip');
  await page.waitForSelector('.gift', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/2-gift-drawing.png` });
  await page.waitForTimeout(1900);
  await page.screenshot({ path: `${OUT}/3-gift-lit.png` });
  const gift = await text(page, '.gift');
  const ring = await page.$eval('.halo-up-ring', (e) => getComputedStyle(e).strokeDashoffset).catch(() => 'missing');
  say(!EMOJI.test(gift) && !(await page.$('.gift-bow')) && !!(await page.$('.halo-up svg')), 'the gift screen has the halo animation and no emoji');
  say(parseFloat(ring) < 0.05, `the ring has drawn itself (dash offset ${ring})`);
  await page.click('.gift .offer-go');
  await page.waitForTimeout(1000);
  if (name === 'desk') {
    await page.waitForSelector('[aria-label="Show your bookmarks bar"]', { timeout: 8000 }).catch(() => undefined);
    await page.screenshot({ path: `${OUT}/4-bookmarks-bar.png` });
    const bar = await text(page, '[aria-label="Show your bookmarks bar"]');
    say(/Show your bookmarks bar/.test(bar) && !!(await page.$('figure.kb')) && /My bookmarks bar is already showing/.test(bar), 'Connect Halo lands on the bookmarks bar step, with the keyboard and "My bookmarks bar is already showing"');
    // A browser that looks like it has the bar showing (tall chrome) still gets the step: nothing skips it now.
    await page.waitForTimeout(1500);
    say(!!(await page.$('[aria-label="Show your bookmarks bar"]')), 'it stays until the student moves on');
    await page.click('.bar-already');
    await page.waitForTimeout(700);
    say(/Drag this button/.test(await text(page, '.onboard')), 'one tap on "already showing" goes to the drag step');
  }
  const all = await page.evaluate(() => document.body.innerText);
  say(!/🎁/.test(all), 'no gift emoji anywhere');
  await ctx.close();
};

const nowLine = async (name, device, scheme) => {
  const OUT = `docs/screens/onboard-polish/${name}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const main = scheme === 'light';
  const say = (ok, line) => (main ? check(ok, `${name}: ${line}`) : ok || console.log(`note ${name}-${scheme}: ${line}`));
  const seeded = async (ageDays, extra = {}) => {
    const u = await newUser();
    const started = new Date(Date.now() - ageDays * DAY).toISOString();
    await admin.from('profiles').update({ trial_started_at: started, trial_ends_at: new Date(Date.now() - ageDays * DAY + 7 * DAY).toISOString() }).eq('user_id', u.id);
    const cid = randomUUID();
    const now = new Date().toISOString();
    const due = (n) => new Date(Date.now() + n * DAY).toISOString();
    await admin.from('courses').insert({ id: cid, user_id: u.id, updated_at: now, data: { id: cid, code: 'CHM-113', name: 'General Chemistry I', color: '#2E7D6B', credits: 3, instructors: [], meetings: [], online: false, termStart: '2026-09-01', termEnd: '2026-12-15', updatedAt: now } });
    const it = (title, n) => { const id = randomUUID(); return { id, user_id: u.id, updated_at: now, data: { id, courseId: cid, title, label: title, labelOverridden: false, type: 'homework', points: 20, opensAt: null, dueAt: due(n), estimatedMinutes: 60, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'manual', award: null, updatedAt: now } }; };
    await admin.from('items').insert([it('Topic 4 Homework', 2), it('Lab 5 Report', 5)]);
    const settings = { timezone: 'America/Phoenix', onboarding: { startedAt: started, step: 'done', doneAt: started, skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, welcomeList: { doneAt: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' }, ...extra };
    await admin.from('settings').upsert({ user_id: u.id, updated_at: now, data: settings });
    const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
    await ctx.addInitScript(({ s, key, settings }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: u.session, key: `sb-${ref}-auth-token`, settings });
    const page = await ctx.newPage();
    await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    return { u, ctx, page };
  };
  // Day two: the line.
  let { ctx, page } = await seeded(2);
  await page.waitForSelector('.invite-line', { timeout: 8000 }).catch(() => undefined);
  const line = await text(page, '.invite-line-go');
  await page.locator('.invite-line').scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/5-now-invite-line.png` });
  if (name === 'desk') await page.locator('.now-side').screenshot({ path: `${OUT}/5b-now-side.png` }).catch(() => undefined);
  const look = await page.$eval('.invite-line-go', (b) => { const s = getComputedStyle(b); const i = getComputedStyle(b.querySelector('.invite-line-icon')); return { size: parseFloat(s.fontSize), bg: s.backgroundColor, icon: i.color, border: s.borderStyle }; }).catch(() => null);
  say(line === 'Invite a friend, you both get 30 days of Plus free' && !!(await page.$('.invite-line svg')) && !EMOJI.test(line), `the line on Now: "${line}"`);
  say(!!look && look.size <= 14 && /rgba\(0, 0, 0, 0\)|transparent/.test(look.bg), `muted and small: ${JSON.stringify(look)}`);
  if (name === 'desk') {
    const side = await page.$eval('.invite-line', (e) => e.parentElement.lastElementChild === e && e.closest('.now-side') !== null).catch(() => false);
    say(side, 'at the foot of the side column (bottom right)');
    // One tap copies on a computer (the share sheet on a phone).
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.bringToFront();
    await page.click('.invite-line-go');
    await page.waitForTimeout(600);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    say(/#\/start\?ref=/.test(clip) && /Copied/.test(await text(page, '.invite-line-go')), 'one tap: the message and invite link are copied ("Copied. Paste it to a friend.")');
    await page.click('.invite-line-x');
    await page.waitForTimeout(600);
    const at = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.inviteLineAt);
    say(!(await page.$('.invite-line')) && !!at, 'dismissed: gone, and remembered');
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.inviteLineAt = new Date(Date.now() - 15 * 86_400_000).toISOString(); d.settings.updatedAt = new Date().toISOString(); localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  }
  await ctx.close();
  if (name !== 'desk' || !main) return;
  // Day one: nothing.
  ({ ctx, page } = await seeded(0.3));
  say(!(await page.$('.invite-line')), 'not in the first day');
  await ctx.close();
  // Two weeks after putting it away: back.
  ({ ctx, page } = await seeded(20, { inviteLineAt: new Date(Date.now() - 15 * DAY).toISOString(), inviteCardAt: new Date().toISOString() }));
  say(!!(await page.$('.invite-line')), 'back two weeks after it was put away');
  await ctx.close();
  ({ ctx, page } = await seeded(20, { inviteLineAt: new Date(Date.now() - 10 * DAY).toISOString(), inviteCardAt: new Date().toISOString() }));
  say(!(await page.$('.invite-line')), 'still away ten days after');
  await ctx.close();
  // Day four: the invite card is up, so the line waits (never both).
  ({ ctx, page } = await seeded(4));
  say(!!(await page.$('.invite-now')) && !(await page.$('.invite-line')), 'with the invite card showing, the line is not');
  await ctx.close();
};

try {
  for (const [name, device] of [['desk', DESK], ['phone', PHONE]]) {
    for (const scheme of ['light', 'dark']) {
      console.log(`--- ${name}-${scheme}`);
      await onboarding(name, device, scheme);
      await nowLine(name, device, scheme);
    }
  }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
