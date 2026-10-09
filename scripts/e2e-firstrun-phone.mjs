// A brand-new student's first run on a phone (George, 2026-10-08), at iPhone and Android sizes, light and dark:
// the landing page, sign-up (email, then password), the gift, the Halo step, Skip for now, Now's empty state, and the
// never-synced sheet on the next open. Screens to docs/screens/firstrun-phone/ for a look by eye, plus the checks a
// script can make: no sideways scroll, every button at least 40px tall, no text clipped past the right edge, the
// main steps quick. Real backend, sign-ups made through the real form and removed after.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-firstrun-phone.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/firstrun-phone';
mkdirSync(OUT, { recursive: true });
const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const made = [];
const DEV = { iphone: devices['iPhone 14'], android: devices['Pixel 7'] };

/** What a script can see on any screen: sideways scroll, small buttons, text past the edge. */
async function audit(p, name) {
  const r = await p.evaluate(() => {
    const vw = window.innerWidth;
    const scroll = document.documentElement.scrollWidth > vw + 1;
    const small = [];
    const clipped = [];
    for (const el of document.querySelectorAll('button, a.btn, [role="button"]')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.height < 40 && !el.closest('.hero-inline, .diff-toggle, .signin-switch, .landing-nav, footer')) small.push(`${el.className || el.tagName}: ${Math.round(b.height)}px "${(el.textContent || '').trim().slice(0, 24)}"`);
    }
    for (const el of document.querySelectorAll('h1, h2, h3, p, li, button, a, span')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.right > vw + 2 && getComputedStyle(el).visibility !== 'hidden') clipped.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(b.right)}`);
    }
    return { scroll, small: [...new Set(small)].slice(0, 6), clipped: [...new Set(clipped)].slice(0, 6) };
  });
  check(!r.scroll, `${name}: no sideways scroll`);
  check(r.small.length === 0, `${name}: buttons at least 40px tall${r.small.length ? ` (${r.small.join('; ')})` : ''}`);
  check(r.clipped.length === 0, `${name}: nothing past the right edge${r.clipped.length ? ` (${r.clipped.join('; ')})` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [dev, device] of Object.entries(DEV)) for (const scheme of ['light', 'dark']) {
    const tag = `${dev}-${scheme}`;
    const email = `e2e-audit-firstrun-${Date.now()}-${dev[0]}${scheme[0]}@example.invalid`;
    made.push(email);
    const ctx = await browser.newContext({ ...device, colorScheme: scheme });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    // 1. The landing page.
    const t0 = Date.now();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForSelector('.landing', { timeout: 30000 });
    const landed = Date.now() - t0;
    await sleep(800);
    check(landed < 4000, `${tag}: landing drawn in ${landed} ms`);
    await p.screenshot({ path: `${OUT}/1-landing-${tag}.png` });
    await p.screenshot({ path: `${OUT}/1b-landing-full-${tag}.png`, fullPage: true });
    await audit(p, `${tag} landing`);
    // 2. Try it free → sign-up.
    const cta = p.locator('.landing a.btn.primary, .landing .btn.primary').first();
    const box = await cta.boundingBox();
    check(!!box && box.y < device.viewport.height, `${tag}: "Try it free" is above the fold (y=${Math.round(box?.y ?? -1)})`);
    await cta.click();
    await p.waitForSelector('.signin[data-step="email"]', { timeout: 30000 });
    await sleep(600);
    await p.screenshot({ path: `${OUT}/2-signup-email-${tag}.png` });
    await audit(p, `${tag} sign-up email`);
    await p.fill('.signin input[name="email"]', email);
    await p.click('.signin button[type="submit"]');
    await p.waitForSelector('.signin[data-step="password"]', { timeout: 15000 });
    await sleep(400);
    await p.screenshot({ path: `${OUT}/3-signup-password-${tag}.png` });
    await audit(p, `${tag} sign-up password`);
    const t1 = Date.now();
    await p.fill('.signin input[name="password"]', 'firstrun-pass-2026');
    await p.click('.signin button[type="submit"]');
    // 3. The plan story (fifteen seconds, or Skip the example), then the gift.
    await p.waitForSelector('.gift, .story-skip', { timeout: 30000 });
    if (await p.locator('.story-skip').count()) {
      await sleep(1200);
      await p.screenshot({ path: `${OUT}/3b-plan-story-${tag}.png` });
      await audit(p, `${tag} plan story`);
      await p.click('.story-skip');
    }
    await p.waitForSelector('.gift', { timeout: 30000 });
    const gifted = Date.now() - t1;
    check(gifted < 12000, `${tag}: account made, story skipped, gift shown in ${gifted} ms`);
    await sleep(900);
    await p.screenshot({ path: `${OUT}/4-gift-${tag}.png` });
    await audit(p, `${tag} gift`);
    await p.click('.gift .offer-go');
    // 4. The Halo step on a phone, then Skip for now.
    await p.waitForSelector('.onboard-step', { timeout: 30000 });
    await sleep(800);
    await p.screenshot({ path: `${OUT}/5-halo-step-${tag}.png` });
    await audit(p, `${tag} Halo step`);
    await p.click('.onboard .onboard-skip');
    await p.waitForSelector('.skip-note', { timeout: 8000 });
    await sleep(500);
    await p.screenshot({ path: `${OUT}/6-skip-${tag}.png` });
    await p.click('.skip-note button:has-text("Go to Now")').catch(() => undefined);
    // 5. Now's empty state.
    await p.waitForSelector('.now, .connect-halo', { timeout: 30000 });
    await sleep(1500);
    for (const sel of ['.ext-setup-sheet button.btn:has-text("Skip for now")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
    await sleep(600);
    check((await p.locator('.connect-halo').count()) === 1 && (await p.locator('.never-synced').count()) === 0, `${tag}: Now is the Connect Halo card, no sheet on the same visit`);
    await p.screenshot({ path: `${OUT}/7-now-empty-${tag}.png` });
    await audit(p, `${tag} Now empty`);
    // 6. The next open: the never-synced sheet.
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.never-synced', { timeout: 30000 });
    await sleep(800);
    check(/You haven't synced Halo yet!/.test(await text(p, '.never-synced')), `${tag}: the next open shows the never-synced sheet`);
    await p.screenshot({ path: `${OUT}/8-never-synced-${tag}.png` });
    await audit(p, `${tag} never-synced sheet`);
    await ctx.close();
  }
} finally {
  await browser.close();
  let n = 0;
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const email of made) {
    const u = data?.users?.find((x) => x.email === email);
    if (!u) continue;
    for (const t of ['email_outbox', 'onboarding_events', 'settings', 'courses', 'items', 'usage_events', 'notification_prefs', 'notification_plan']) await db.from(t).delete().eq('user_id', u.id);
    await db.auth.admin.deleteUser(u.id);
    n++;
  }
  console.log(`removed ${n} sign-ups`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
