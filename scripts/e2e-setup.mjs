// A brand new student who skips everything (George, 2026-10-01: a friend skipped onboarding, never synced, and was
// lost). On desktop, phone and iPad, light and dark, with a throwaway account on the real backend: Skip for now says
// how to come back, Now is one Connect Halo card, the gold "Not synced yet · Set up" pill (a bar on phones) opens only
// the Halo steps for that device, Calendar, Classes and Inbox point to Connect Halo, the free week keeps running,
// and after a first sync it is all gone. Signed out, Set up asks for an account first. Throwaways removed.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-setup.mjs
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/setup';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const DEVICES = {
  desk: { viewport: { width: 1280, height: 860 } },
  phone: { ...devices['iPhone 14'], deviceScaleFactor: 2 },
  ipad: { ...devices['iPad (gen 7)'], deviceScaleFactor: 2 },
};
const HALO_STEP = { desk: '[aria-label="Add the extension"]', phone: '[aria-label="Copy the bookmark"]', ipad: '.ipad-step' };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = async (dev, scheme, session) => {
  const ctx = await browser.newContext({ ...DEVICES[dev], colorScheme: scheme });
  if (session) await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  return ctx;
};
const pill = (dev) => (dev === 'phone' ? '.setup-bar' : '.setup-pill');
try {
  for (const dev of ['desk', 'phone', 'ipad']) for (const scheme of ['light', 'dark']) {
    const s = await kit.persona('new');
    const { data: before } = await db.from('profiles').select('trial_ends_at').eq('user_id', s.id).single();
    const ctx = await context(dev, scheme, s.session);
    const p = await ctx.newPage();
    const tag = `${dev} ${scheme}`;
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.onboard .onboard-skip', { timeout: 30000 });
    await p.waitForTimeout(600);
    // 1. Skip for now: one line on how to come back.
    await p.click('.onboard .onboard-skip');
    await p.waitForSelector('.skip-note', { timeout: 5000 });
    const note = (await p.locator('.skip-note').innerText()).replace(/\s+/g, ' ');
    check(/No problem\./.test(note) && (dev === 'phone' ? /Tap Set up at the top whenever you're ready\./ : /Tap Set up in the top right whenever you're ready\./).test(note), `${tag}: the skip line: "${note.slice(0, 90)}…"`);
    check(/Your free week of Max is already running\./.test(note), `${tag}: says the free week is running`);
    await p.screenshot({ path: `${OUT}/1-skip-${dev}-${scheme}.png` });
    // It moves on by itself; Go to Now is there to go sooner.
    const t0 = Date.now();
    await p.waitForSelector('.onboard', { state: 'detached', timeout: 9000 }).catch(() => undefined);
    // Desktop Chrome, once (2026-10-04): the extension setup comes next; skipping it, no "You haven't synced" on top
    // in the same visit (2026-10-06: that waits for the next open).
    if (await p.$('.ext-setup-sheet')) {
      await p.click('.ext-setup-sheet button.btn:has-text("Skip for now")');
      await p.waitForTimeout(1500);
    }
    check(!(await p.$('.onboard')) && /#\/now/.test(p.url()) && Date.now() - t0 > 2000, `${tag}: goes on to Now by itself after a few seconds (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    // 2. Now before the first sync: one card, and the pill.
    await p.waitForTimeout(800);
    check(!(await p.$('.now-head')) && /Connect Halo to see your classes, due dates, and grades\./.test(await p.locator('.connect-halo').innerText()) && (await p.locator('.connect-halo-btn').innerText()) === 'Connect Halo' && /Or add your classes yourself/.test(await p.locator('.connect-halo').innerText()), `${tag}: Now is one Connect Halo card`);
    check(await p.locator(pill(dev)).isVisible(), `${tag}: the Set up ${dev === 'phone' ? 'bar' : 'pill'} is visible`);
    check(!(await p.locator(dev === 'phone' ? '.setup-pill' : '.setup-bar').isVisible()), `${tag}: only one of pill and bar`);
    if (dev !== 'phone') {
      const box = await p.locator('.setup-pill').boundingBox();
      const add = await p.locator('.topbar button[aria-label="Add something"]').boundingBox();
      const vw = DEVICES[dev].viewport.width;
      check(box.y < 60 && box.x + box.width <= add.x + 2 && add.x - (box.x + box.width) < 40 && box.x + box.width <= vw, `${tag}: the pill sits in the top bar, right next to Add (${Math.round(box.x)},${Math.round(box.y)})`);
    }
    check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: no sideways scroll`);
    await p.screenshot({ path: `${OUT}/2-now-${dev}-${scheme}.png` });
    // 3. Set up: only the Halo steps for this device.
    await p.click(pill(dev));
    await p.waitForSelector(`.onboard ${HALO_STEP[dev]}`, { timeout: 8000 });
    const head = (await p.locator('.onboard-head').innerText()).replace(/\s+/g, ' ');
    check(/Connect Halo/.test(head) && !/Step \d of/.test(head) && /Not now/.test(head), `${tag}: Set up opens just "Connect Halo" for this device ("${head}")`);
    if (scheme === 'light') await p.screenshot({ path: `${OUT}/3-setup-${dev}-${scheme}.png` });
    await p.click('.onboard-skip');
    await p.waitForTimeout(600);
    check(!(await p.$('.onboard')) && !(await p.$('.skip-note')) && (await p.locator(pill(dev)).isVisible()), `${tag}: Not now closes it, the ${dev === 'phone' ? 'bar' : 'pill'} stays`);
    // The Connect Halo button opens the same thing.
    await p.click('.connect-halo-btn');
    await p.waitForSelector(`.onboard ${HALO_STEP[dev]}`, { timeout: 8000 });
    check(true, `${tag}: Connect Halo opens the same setup`);
    await p.click('.onboard-skip');
    await p.waitForTimeout(400);
    // 4. Calendar, Classes, Inbox.
    if (scheme === 'light') {
      for (const [route, re] of [['calendar', /Your due dates land here/], ['classes', /Your classes, with their grades/], ['inbox', /announcements arrive here/]]) {
        await p.goto(`${BASE}#/${route}`, { waitUntil: 'load' });
        await p.waitForSelector('.connect-halo-line', { timeout: 10000 }).catch(() => undefined);
        const line = await p.locator('.connect-halo-line').innerText().catch(() => '');
        check(re.test(line) && /Connect Halo/.test(line), `${tag}: ${route} points to Connect Halo`);
        if (dev !== 'ipad') await p.screenshot({ path: `${OUT}/4-${route}-${dev}-${scheme}.png` });
      }
    }
    // 5. The free week still runs.
    const { data: after } = await db.from('profiles').select('trial_ends_at').eq('user_id', s.id).single();
    check(!!after.trial_ends_at && after.trial_ends_at === before.trial_ends_at && Date.parse(after.trial_ends_at) > Date.now(), `${tag}: the free week of Max runs either way`);
    await ctx.close();
    // 6. After a first sync, the pill is gone for good.
    if (scheme === 'dark') {
      const { data: st } = await db.from('settings').select('data').eq('user_id', s.id).single();
      await db.from('settings').update({ data: { ...st.data, lastPull: { at: new Date().toISOString(), build: null, counts: { classes: 1 } } }, updated_at: new Date().toISOString() }).eq('user_id', s.id);
      const c2 = await context(dev, 'light', s.session);
      const p2 = await c2.newPage();
      await p2.goto(`${BASE}#/now`, { waitUntil: 'load' });
      await p2.waitForSelector('.now', { timeout: 20000 });
      await p2.waitForTimeout(2500);
      check(!(await p2.locator('.setup-pill, .setup-bar').count()) && !(await p2.$('.connect-halo')), `${dev}: after the first sync no pill, no Connect Halo card`);
      await c2.close();
    }
  }
  // Signed out: Set up asks for an account first, then Halo.
  {
    const ctx = await context('desk', 'light', null);
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/start`, { waitUntil: 'load' });
    await p.waitForSelector('.onboard .onboard-skip', { timeout: 20000 });
    await p.click('.onboard .onboard-skip');
    await p.click('.skip-note button:has-text("Go to Now")');
    await p.waitForTimeout(1500);
    if (await p.$('.ext-setup-sheet')) await p.click('.ext-setup-sheet button:has-text("Skip for now")');
    await p.waitForSelector('.setup-pill', { timeout: 8000 });
    check((await p.locator('.never-synced').count()) === 0, 'signed out: no "You haven\'t synced" sheet (it is for accounts with sync)');
    await p.click('.setup-pill');
    await p.waitForSelector('.onboard form.signin', { timeout: 8000 });
    check(/Sign up, then connect Halo/.test(await p.locator('.onboard-head').innerText()), 'signed out: Set up asks for an account first, then Halo');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
