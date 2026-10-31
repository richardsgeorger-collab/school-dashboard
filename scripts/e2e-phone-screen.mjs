// The phone screen, round 2 (Loop 298, George 2026-10-30): email first and big, the reason under it, share second,
// and starting on the phone with Google (Apple once it is set up). In WebKit (Safari's engine) at iPhone sizes, as
// iPhone Safari and as Instagram's in-app browser (its user agent, no share sheet). Checks:
// - the main button is on screen without scrolling on small iPhones inside Instagram's browser (its bars take room);
// - the email box asks the phone for the student's own address (type, name, autocomplete, inputmode, no capitals);
// - Safari: Continue with Google goes to Google through Supabase and back to haloplus.app; Instagram: the button is
//   "Open in Safari to continue with Google" (Google refuses to sign in inside in-app browsers), a link to the same
//   page in Safari that carries on with Google there;
// - after a phone sign-up the laptop link is emailed to the account at once, and the laptop page and the welcome tab
//   offer the same one tap;
// - every step is counted; Admin's chart.
// haloplus.app is this build (dist-site); the backend is real; throwaways only, all removed after.
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/e2e-phone-screen.mjs
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, devices, webkit } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';
import { assertThrowaways } from './lib/guard.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/phone-screen';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => {
  checks.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const site = (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
  let file = join(LOCAL_SITE, path || 'index.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(LOCAL_SITE, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
};
const IG = (ua) => ua.replace(/Version\/[\d.]+ Mobile\/(\w+) Safari\/[\d.]+/, 'Mobile/$1 Instagram 312.0.0.32.112 (iPhone15,3; iOS 17_5; en_US; en; scale=3.00; 1290x2796; 548339486)');
const vids = new Set();
const seen = [];
const watch = (ctx) =>
  ctx.on('request', (r) => {
    if (!r.url().endsWith('/functions/v1/report') || r.method() !== 'POST') return;
    try {
      const b = JSON.parse(r.postData() || '{}');
      if (b.kind === 'funnel') {
        seen.push(b);
        vids.add(b.vid);
      }
    } catch {
      /* not JSON */
    }
  });
const remember = async (p) => {
  const v = await p.evaluate(() => localStorage.getItem('school-dashboard:vid')).catch(() => null);
  if (v) vids.add(v);
};
const hard = setTimeout(() => {
  console.log('HARD TIMEOUT');
  process.exit(3);
}, 600000);
// The visible area inside Instagram's browser (its top bar and bottom toolbar take ~140–180 px of the screen).
const SIZES = [
  { name: 'iphone-se', w: 375, h: 667, igH: 520, d: devices['iPhone SE'] },
  { name: 'iphone-13-mini', w: 375, h: 812, igH: 630, d: devices['iPhone 13 Mini'] ?? devices['iPhone 12 Mini'] },
  { name: 'iphone-15', w: 393, h: 852, igH: 664, d: devices['iPhone 15'] ?? devices['iPhone 14'] },
];
let phoneUser = null;

const wk = await webkit.launch();
try {
  // ——— 1. Above the fold, and the screenshots: Safari and Instagram at three iPhone sizes ———
  for (const s of SIZES) {
    for (const where of ['safari', 'instagram']) {
      const ctx = await wk.newContext({ ...s.d, viewport: { width: s.w, height: where === 'instagram' ? s.igH : s.h - 120 }, userAgent: where === 'instagram' ? IG(s.d.userAgent) : s.d.userAgent });
      watch(ctx);
      await ctx.route('https://haloplus.app/**', site);
      if (where === 'instagram') await ctx.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }));
      const p = await ctx.newPage();
      await p.goto('https://haloplus.app/?src=ig', { waitUntil: 'load' });
      await p.locator('.lp-onphone-title').waitFor({ timeout: 15000 });
      await sleep(1200);
      const fold = await p.evaluate(() => {
        const b = document.querySelector('.lp-onphone-mail button[type="submit"]').getBoundingClientRect();
        return { bottom: Math.round(b.bottom), h: innerHeight, text: document.querySelector('.lp-onphone-mail button[type="submit"]').textContent };
      });
      check(fold.bottom <= fold.h && fold.text === 'Email me the link', `${s.name} ${where}: "Email me the link" on screen without scrolling (bottom ${fold.bottom} of ${fold.h} px)`);
      await remember(p);
      await p.screenshot({ path: `${OUT}/${s.name}-${where}.png` });
      if (s.name === 'iphone-15') await p.screenshot({ path: `${OUT}/${s.name}-${where}-full.png`, fullPage: true });
      if (s.name === 'iphone-15' && where === 'instagram') {
        const g = p.locator('.lp-onphone-google');
        const href = await g.getAttribute('href');
        check((await g.innerText()).includes('Open in Safari to continue with Google') && /^x-safari-https:\/\/haloplus\.app\/\?src=ig&go=google$/.test(href ?? ''), `Instagram: Google becomes "Open in Safari to continue with Google" → ${href}`);
        await p.evaluate(() => document.querySelector('.lp-onphone-google').addEventListener('click', (e) => e.preventDefault()));
        await g.click();
        for (let i = 0; i < 40 && !seen.some((b) => b.step === 'safari'); i++) await sleep(100);
      }
      if (s.name === 'iphone-15' && where === 'safari') {
        // The email box asks the phone for the student's own address.
        const a = await p.locator('#lp-onphone-email').evaluate((e) => ({ type: e.type, name: e.name, ac: e.autocomplete, im: e.inputMode, cap: e.getAttribute('autocapitalize'), corr: e.getAttribute('autocorrect'), spell: e.spellcheck, label: document.querySelector('label[for="lp-onphone-email"]')?.textContent }));
        check(a.type === 'email' && a.name === 'email' && a.ac === 'email' && a.im === 'email' && a.cap === 'none' && a.corr === 'off' && a.spell === false && a.label === 'Your email', `the email box: ${JSON.stringify(a)}`);
        await p.locator('#lp-onphone-email').tap();
        await sleep(300);
        // Continue with Google, from Safari: to Google through Supabase, back to haloplus.app.
        const authz = new Promise((res) => p.on('request', (r) => r.url().includes('/auth/v1/authorize') && res(r.url())));
        await p.route('**/auth/v1/authorize**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google (stand-in)</p>' }));
        await p.locator('.lp-onphone-google').click();
        const u = new URL(await Promise.race([authz, sleep(8000).then(() => 'https://x/none')]));
        check(u.searchParams.get('provider') === 'google' && u.searchParams.get('redirect_to') === 'https://haloplus.app/', `Safari: Continue with Google → Supabase's Google sign-in, back to ${u.searchParams.get('redirect_to')}`);
        // Google's page is another site: back on haloplus.app to read what the phone remembered.
        await p.goto('https://haloplus.app/laptop/', { waitUntil: 'load' });
        check((await p.evaluate(() => localStorage.getItem('school-dashboard:phone-start'))) === 'google', 'the phone remembers it started with Google (for the laptop email)');
      }
      await ctx.close();
    }
  }
  check(seen.some((b) => b.step === 'fold') && seen.some((b) => b.step === 'email-focus') && seen.some((b) => b.step === 'google') && seen.some((b) => b.step === 'safari'), `counted: ${[...new Set(seen.map((b) => b.step))].join(', ')}`);

  // ——— 2. Arriving in Safari from "Open in Safari": straight on to Google ———
  {
    const ctx = await wk.newContext({ ...devices['iPhone 14'] });
    await ctx.route('https://haloplus.app/**', site);
    const p = await ctx.newPage();
    const authz = new Promise((res) => p.on('request', (r) => r.url().includes('/auth/v1/authorize') && res(r.url())));
    await p.route('**/auth/v1/authorize**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google (stand-in)</p>' }));
    await p.goto('https://haloplus.app/?src=ig&go=google', { waitUntil: 'load' });
    const u = await Promise.race([authz, sleep(10000).then(() => null)]);
    check(!!u && u.includes('provider=google'), 'arriving in Safari with go=google: on to Google at once (no second tap)');
    await remember(p);
    await ctx.close();
  }

  // ——— 3. After a Google sign-up on the phone: the laptop link is emailed to the account at once ———
  {
    const email = `delivered+haloplus-phone-${Date.now()}@resend.dev`;
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { provider: 'google', providers: ['google'] } });
    if (error) throw error;
    phoneUser = data.user.id;
    const { session } = await kit.signIn(email);
    const ctx = await wk.newContext({ ...devices['iPhone 14'] });
    watch(ctx);
    await ctx.route('https://haloplus.app/**', site);
    await ctx.addInitScript(({ key, ses }) => {
      if (localStorage.getItem('school-dashboard:phone-start-set')) return;
      localStorage.setItem('school-dashboard:phone-start-set', '1');
      localStorage.setItem(key, JSON.stringify(ses));
      localStorage.setItem('school-dashboard:phone-start', 'google');
      localStorage.setItem('school-dashboard:src', 'ig');
    }, { key: `sb-${ref}-auth-token`, ses: session });
    const sent = new Promise((res) => ctx.on('request', (r) => r.url().endsWith('/functions/v1/laptop-link') && r.method() === 'POST' && res({ auth: r.headers().authorization ?? '', body: r.postData() })));
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/', { waitUntil: 'load' });
    const req = await Promise.race([sent, sleep(30000).then(() => null)]);
    try {
      const v = JSON.parse(req?.body ?? '{}').vid;
      if (v) vids.add(v);
    } catch {
      /* no body */
    }
    check(!!req && /^Bearer ey/.test(req.auth) && !/"email"/.test(req.body ?? ''), `after the phone sign-up the laptop link is asked for with the account (no typing): ${req ? req.body : 'none'}`);
    const ok = await p.waitForFunction(() => /Sent/.test(document.querySelector('.phone-connect-mail')?.textContent ?? ''), null, { timeout: 20000 }).then(() => true, () => false);
    check(ok, `the phone says so: "${ok ? await p.locator('.phone-connect-mail').first().innerText() : 'nothing'}"`);
    const prof = (await db.from('profiles').select('signup_source').eq('user_id', phoneUser).single()).data;
    check(prof?.signup_source === 'ig', `the account's source is Instagram (${prof?.signup_source})`);
    await new Promise((r) => setTimeout(r, 3000));
    const still = await p.evaluate(() => ({ msg: document.querySelector('.phone-connect-mail')?.textContent ?? '', again: [...document.querySelectorAll('.phone-connect-actions button')].some((b) => b.textContent === 'Email me the link'), copies: document.querySelectorAll('.phone-connect').length }));
    check(/Sent/.test(still.msg) && !still.again, `three seconds later it still says sent, with no second "Email me the link" (${JSON.stringify(still)})`);
    await p.screenshot({ path: `${OUT}/after-google-signup-phone.png` });
    await remember(p);
    await ctx.close();
  }

  // ——— 4. The laptop: the emailed link, then the welcome tab's one tap ———
  const cr = await chromium.launch();
  {
    const ctx = await cr.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route('https://haloplus.app/**', site);
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/laptop/?src=ig&via=email&acct=google', { waitUntil: 'load' });
    const step2 = await p.locator('#step2').innerText();
    check(/Continue with Google, the same account as on your phone \(one tap\)/.test(step2), `the laptop page: "${step2}"`);
    await p.screenshot({ path: `${OUT}/laptop-page-google.png` });
    await p.goto('https://haloplus.app/#/welcome?src=store', { waitUntil: 'load' });
    await p.locator('.welcome-one-tap').waitFor({ timeout: 15000 });
    await p.route('**/auth/v1/authorize**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google (stand-in)</p>' }));
    await p.screenshot({ path: `${OUT}/laptop-welcome-one-tap.png` });
    const authz = new Promise((res) => p.on('request', (r) => r.url().includes('/auth/v1/authorize') && res(r.url())));
    await p.locator('.welcome-one-tap button').click();
    const u = await Promise.race([authz, sleep(8000).then(() => null)]);
    check(!!u && u.includes('provider=google'), 'the welcome tab after the install: Continue with Google, one tap');
    await ctx.close();
  }

  // ——— 5. Admin's chart ———
  {
    const admin = await kit.persona('admin');
    const { c } = await kit.signIn(admin.email);
    const { data: f, error } = await c.rpc('admin_ig_funnel', { p_days: 1 });
    check(!error && f.fold >= 1 && f.email_focus >= 1 && f.google >= 1 && f.safari >= 1, `admin_ig_funnel has the new steps (${error?.message ?? `fold ${f.fold}, email box ${f.email_focus}, google ${f.google}, safari ${f.safari}, phone accounts ${f.signed_up_phone}`})`);
    const ctx = await cr.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
    await ctx.route('https://haloplus.app/**', site);
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/#/admin', { waitUntil: 'load' });
    const card = p.locator('.admin-ig-funnel');
    await card.locator('.ig-drop').waitFor({ timeout: 30000 });
    await card.scrollIntoViewIfNeeded();
    await sleep(800);
    await card.screenshot({ path: `${OUT}/admin-drop-off.png` });
    check((await card.locator('.ig-drop-row').count()) === 12, 'Admin: the drop-off chart, twelve steps');
    await ctx.close();
  }
  await cr.close();
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  for (const v of vids) {
    await db.from('funnel_events').delete().eq('vid', v);
    await db.from('laptop_links').delete().eq('vid', v);
  }
  if (phoneUser) {
    await assertThrowaways(db, [phoneUser], 'the phone sign-up throwaway');
    for (const t of ['pending_syncs', 'sync_keys', 'courses', 'items', 'settings', 'announcements', 'usage_events', 'onboarding_events', 'notification_prefs', 'trial_days', 'email_outbox']) await db.from(t).delete().eq('user_id', phoneUser);
    await db.auth.admin.deleteUser(phoneUser);
  }
  await wk.close();
  console.log(`removed ${await kit.cleanup()} throwaways (+${phoneUser ? 1 : 0})`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
