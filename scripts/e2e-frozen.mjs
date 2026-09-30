// The plans on the real backend (2026-09-28): a new account starts the 7-day Max trial by itself; when the trial ends
// with nothing paid, Halo sync pauses and every screen says so ("Halo sync paused since …", "as of …" on due dates),
// a bookmark that arrives is not applied, and the one-tap upgrade opens a Stripe TEST checkout. Screenshots of the
// frozen state, light and dark, desktop and phone, go to docs/screens/frozen/. The throwaway is removed at the end.
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-frozen.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BUILD = await currentBuild(BASE);
const OUT = 'docs/screens/frozen';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const email = `e2e-frozen-${Date.now()}@example.invalid`;
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (cErr) throw cErr;
const userId = created.user.id;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // 1. The trial started by itself, for seven days.
  const { data: p0 } = await admin.from('profiles').select('tier, trial_started_at, trial_ends_at').eq('user_id', userId).single();
  const days = (Date.parse(p0.trial_ends_at) - Date.parse(p0.trial_started_at)) / 86_400_000;
  check(p0.tier === 'free' && !!p0.trial_started_at && Math.abs(days - 7) < 0.01, `signup started the trial on its own: ${p0.trial_started_at?.slice(0, 16)} → ${p0.trial_ends_at?.slice(0, 16)} (${days.toFixed(2)} days)`);
  // 2. It ended yesterday, nothing paid.
  const ended = new Date(Date.now() - 86_400_000).toISOString();
  await admin.from('profiles').update({ trial_started_at: new Date(Date.now() - 8 * 86_400_000).toISOString(), trial_ends_at: ended }).eq('user_id', userId);
  const mint = async () => { const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); const { data } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }); return data.session; };
  const done = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' };
  const lastPull = new Date(Date.now() - 2 * 86_400_000).toISOString();
  let first = true;
  for (const [vp, device] of [['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
      const session = await mint();
      await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      // A student who synced Halo two days ago: classes linked, items from Halo, the last pull stamped.
      await page.evaluate(({ s, ob, key, lastPull }) => {
        const d = JSON.parse(localStorage.getItem('school-dashboard:v1'));
        d.settings.onboarding = ob;
        d.settings.maxOnboarding = { startedAt: 'x', step: 'done', doneAt: 'x' };
        d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true };
        d.settings.lastPull = { at: lastPull, build: 'x', counts: {} };
        d.courses = d.courses.map((c) => ({ ...c, haloClassId: c.haloClassId ?? `h-${c.id}` }));
        d.items = d.items.map((i) => ({ ...i, haloId: i.haloId ?? `h-${i.id}`, source: 'halo' }));
        localStorage.setItem('school-dashboard:v1', JSON.stringify(d));
        localStorage.setItem(key, JSON.stringify(s));
        localStorage.setItem('school-dashboard:seen-level', '99');
      }, { s: session, ob: done, key: `sb-${ref}-auth-token`, lastPull });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3500);
      // The trial-ended screen comes first (loop 131); choosing Free goes on to the paused planner.
      if (await page.$('.trial-ended')) {
        if (first) await page.screenshot({ path: `${OUT}/ended-${vp}-${scheme}.png` });
        await page.getByRole('button', { name: 'Stay on Free' }).click();
        await page.waitForTimeout(800);
      }
      const banner = await page.$eval('.frozen-banner', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
      const asOf = await page.$$eval('.as-of', (els) => els.length);
      if (first) {
        check(!!banner && /Halo sync paused since/.test(banner) && /see what's changed/.test(banner), `banner on Now: ${banner?.slice(0, 120)}`);
        check(asOf > 0, `"as of" on ${asOf} due dates on Now`);
        // One date everywhere: the banner's "since" is the last sync, the same day every "as of" names.
        const sinceDay = banner?.match(/paused since ([A-Z][a-z]{2} \d+)/)?.[1];
        const asOfDays = await page.$$eval('.as-of', (els) => [...new Set(els.map((e) => e.textContent.replace(/.*as of /, '').trim()))]);
        check(!!sinceDay && asOfDays.length === 1 && asOfDays[0] === sinceDay, `banner and every "as of" name the same day, the last sync: ${sinceDay} / ${asOfDays.join(', ')}`);
      }
      await page.screenshot({ path: `${OUT}/now-${vp}-${scheme}.png` });
      if (vp === 'desk') {
        await page.goto(`${BASE}#/calendar`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
        if (first) check(!!(await page.$('.frozen-banner')) && (await page.$$('.as-of')).length > 0, 'banner and "as of" on Calendar');
        await page.screenshot({ path: `${OUT}/calendar-${vp}-${scheme}.png` });
        // A bookmark that arrives while paused is not applied: the plan card shows instead.
        const before = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.length);
        const c0 = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses[0]);
        const payload = { kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments'], classes: [{ id: c0.haloClassId, slugId: 'X', classCode: `${c0.code}-X`, courseCode: c0.code, name: c0.name, instructors: [], stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [{ id: 'frozen-new', title: 'A brand new assignment', dueDate: '2026-11-20T06:59:00.000Z', points: 50, type: 'ASSIGNMENT', status: null, score: null, description: '' }], announcements: [], resources: [], discussions: [], messages: [] }] };
        await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
        await page.waitForTimeout(1500);
        // Since loop 150 a bookmark while paused is a peek: what Halo has, counted, nothing applied.
        const wall = await page.$eval('[role="dialog"][aria-label="What Halo has that your planner doesn\'t"], .plan-wall', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
        await page.screenshot({ path: `${OUT}/bookmark-${vp}-${scheme}.png` });
        await page.keyboard.press('Escape');
        const after = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.length);
        if (first) check(!!wall && after === before, `bookmark while paused shows the plan card and applies nothing (${before} → ${after} items): ${wall?.slice(0, 90)}`);
        // One tap: the upgrade opens a Stripe test checkout.
        if (first) {
          await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
          const [nav] = await Promise.all([page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 }).then(() => page.url()).catch(() => null), page.locator('.frozen-banner button', { hasText: '$4.99' }).click()]);
          check(!!nav && nav.includes('checkout.stripe.com'), `upgrade button opens Stripe checkout: ${nav ? nav.slice(0, 60) : 'no navigation'}`);
          if (nav) {
            // Stripe's own page is not needed: the session says what it charges. Read-only, with the live key from the
            // macOS keychain; without it this check is skipped, never faked.
            const id = nav.match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0];
            let sess = null;
            try {
              const key = execFileSync('security', ['find-generic-password', '-s', id.startsWith('cs_live') ? 'Stripe live secret key' : 'Stripe test secret key', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
              const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, { headers: { Authorization: `Bearer ${key}` } });
              if (r.ok) sess = await r.json();
            } catch {
              /* no key on this machine */
            }
            if (!sess) console.log('skip checkout amount: no Stripe key');
            if (sess) check(sess.amount_subtotal === 499 && sess.mode === 'subscription', `checkout session: $${(sess.amount_subtotal / 100).toFixed(2)} ${sess.mode}, livemode ${sess.livemode}`);
          }
        }
      }
      first = false;
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'subscriptions', 'notification_plan', 'notification_prefs', 'push_subscriptions', 'onboarding_events']) await admin.from(t).delete().eq('user_id', userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  console.log('throwaway removed:', error ? error.message : 'ok');
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
