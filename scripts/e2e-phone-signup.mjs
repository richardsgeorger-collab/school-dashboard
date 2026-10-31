// The phone screen as a sign-up (Loop 299, George 2026-10-30), in WebKit (Safari's engine) at small and large iPhone
// sizes, as iPhone Safari and as Instagram's in-app browser:
// - the hook, Continue with Google first (in Instagram: the same page in Safari), "or sign up with email", the true line
//   with the live, rounded-down student count, Sign in; no "on your phone", no talk of emailing links; above the fold;
// - signing up with email (a throwaway at Resend's test inbox) lands on "You're in! 🎉": "We emailed you the link", the
//   share backup, Explore the preview (Maya Torres, labelled Preview, and back), Add to Home Screen (the steps);
// - the one reminder: the real email_queue_tick() run inside a transaction that is always rolled back (nothing it does
//   stays, for anyone), the throwaway a day old: one finish_setup, to the laptop page, the way they sign in;
// - every step counted; Admin's chart. haloplus.app is this build (dist-site); the backend is real; all removed after.
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/e2e-phone-signup.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, devices, webkit } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';
import { assertThrowaways } from './lib/guard.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/phone-signup';
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
const text = async (p, sel = 'body') => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ');
/** SQL on the live database through the CLI's own login: here only inside a transaction that is always rolled back. */
const rolledBack = (body) => {
  let t = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim().replace(/^go-keyring-base64:/, '');
  if (!t.startsWith('sbp_')) t = Buffer.from(t, 'base64').toString('utf8');
  const sql = `do $$ declare m jsonb; begin ${body} raise exception 'RESULT:%', coalesce(m::text, 'null'); end $$;`;
  const out = execFileSync('curl', ['-s', '-X', 'POST', '-H', `Authorization: Bearer ${t}`, '-H', 'content-type: application/json', '--data', JSON.stringify({ query: sql }), `https://api.supabase.com/v1/projects/${ref}/database/query`], { encoding: 'utf8' });
  let msg = out;
  try {
    msg = JSON.parse(out).message ?? out;
  } catch {
    /* not JSON */
  }
  const m = /RESULT:(\{.*\})/.exec(msg);
  return m ? JSON.parse(m[1]) : { error: String(msg).slice(0, 300) };
};
const hard = setTimeout(() => {
  console.log('HARD TIMEOUT');
  process.exit(3);
}, 900000);
const SIZES = [
  { name: 'iphone-se', w: 375, h: 667, igH: 520, d: devices['iPhone SE'] },
  { name: 'iphone-15', w: 393, h: 852, igH: 664, d: devices['iPhone 15'] ?? devices['iPhone 14'] },
];
let user = null;

const wk = await webkit.launch();
try {
  // ——— 1. The screen, at small and large sizes, in Safari and Instagram ———
  for (const s of SIZES) {
    for (const where of ['safari', 'instagram']) {
      const ctx = await wk.newContext({ ...s.d, viewport: { width: s.w, height: where === 'instagram' ? s.igH : s.h - 120 }, userAgent: where === 'instagram' ? IG(s.d.userAgent) : s.d.userAgent });
      watch(ctx);
      await ctx.route('https://haloplus.app/**', site);
      const p = await ctx.newPage();
      await p.goto('https://haloplus.app/?src=ig', { waitUntil: 'load' });
      await p.locator('.lp-onphone-title').waitFor({ timeout: 15000 });
      await p.waitForFunction(() => /Join \d+\+ GCU students already using it/.test(document.querySelector('.lp-onphone-why')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      await sleep(900);
      const t = await text(p, '.lp-onphone-card');
      const main = await p.evaluate(() => {
        const m = document.querySelector('.lp-onphone-main').getBoundingClientRect();
        const e = document.querySelector('.lp-onphone-email-btn').getBoundingClientRect();
        return { main: Math.round(m.bottom), email: Math.round(e.bottom), h: innerHeight };
      });
      const tag = `${s.name} ${where}`;
      check(/The Halo upgrade every GCU student needs\./.test(t) && (where === 'instagram' ? /\bor\b/.test(t) : /or sign up with email/.test(t)) && /Takes 10 seconds\. Free\. Join (\d+\+ )?GCU students already using it\./.test(t) && /Already have an account\? Sign in/.test(t), `${tag}: hook, Google, email, the true line, Sign in`);
      check(!/on your phone|Email me the link|AirDrop/i.test(t), `${tag}: no "on your phone", no emailing links on this first screen`);
      check(main.main <= main.h, `${tag}: the main button on screen without scrolling (bottom ${main.main} of ${main.h} px; the email button ${main.email})`);
      if (where === 'instagram') {
        // Inside Instagram (Loop 301): email first and gold, Google second, to Safari.
        const order = await p.evaluate(() => {
          const e = document.querySelector('.lp-onphone-email-btn').getBoundingClientRect().top;
          const g = document.querySelector('.lp-onphone-google').getBoundingClientRect().top;
          return { emailFirst: e < g, emailMain: document.querySelector('.lp-onphone-email-btn').classList.contains('primary') };
        });
        const href = await p.locator('.lp-onphone-google').getAttribute('href');
        check(order.emailFirst && order.emailMain && /^x-safari-https:\/\/haloplus\.app\/\?src=ig&go=google$/.test(href ?? '') && (await text(p, '.lp-onphone-google')) === 'Continue with Google' && (await text(p, '.lp-onphone-opens')) === 'Opens Safari', `${tag}: email first and main, then "Continue with Google" to Safari (${href})`);
      } else {
        const order = await p.evaluate(() => document.querySelector('.lp-onphone-google').getBoundingClientRect().top < document.querySelector('.lp-onphone-email-btn').getBoundingClientRect().top);
        check(order && /Continue with Google/.test(await text(p, '.lp-onphone-main')), `${tag}: Continue with Google first and main`);
      }
      // Polish (Loop 300): Google one line, the same height, width and corners as the email button; one Halo+ mark.
      const look = await p.evaluate(() => {
        const g = document.querySelector('.lp-onphone-google');
        const e = document.querySelector('.lp-onphone-email-btn');
        const gr = g.getBoundingClientRect();
        const er = e.getBoundingClientRect();
        const lines = Math.round(g.querySelector('span').getBoundingClientRect().height / parseFloat(getComputedStyle(g).fontSize));
        const marks = [...document.querySelectorAll('.lp-onphone-mark, .lp-head .brand-mark')].filter((m) => m.getBoundingClientRect().width > 0 && getComputedStyle(m).visibility !== 'hidden').length;
        return { gh: Math.round(gr.height), eh: Math.round(er.height), gw: Math.round(gr.width), ew: Math.round(er.width), gr: getComputedStyle(g).borderTopLeftRadius, er: getComputedStyle(e).borderTopLeftRadius, lines, marks };
      });
      check(look.lines === 1 && look.gh === look.eh && look.gw === look.ew && look.gr === look.er && look.marks === 1, `${tag}: Google on one line, the same size and corners as the email button, one Halo+ mark (${JSON.stringify(look)})`);
      const count = /Join (\d+)\+ GCU students already using it/.exec(t);
      if (s.name === 'iphone-se' && where === 'safari') {
        const live = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/public_student_count`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' }, body: '{}' })).json();
        check(count && Number(count[1]) === live && live % 10 === 0, `the student count is live and rounded down: "Join ${count?.[1]}+ GCU students" (server: ${live})`);
      }
      if (where === 'instagram' && s.name === 'iphone-15') {
        // Tapping Google: the page asks for Safari; a test browser cannot leave, so it stays: the hint shows.
        await p.locator('.lp-onphone-google').tap();
        const hint = await p.locator('.lp-onphone-stuck').waitFor({ timeout: 8000 }).then(() => true, () => false);
        check(hint && /Tap ••• at the top right, then Open in browser\./.test(await text(p, '.lp-onphone-stuck')) && (await p.locator('.lp-onphone-stuck .tp').count()) === 1, `${tag}: when Safari does not open, the hint with its picture: "${hint ? await text(p, '.lp-onphone-stuck') : 'none'}"`);
        await p.locator('.lp-onphone-stuck').scrollIntoViewIfNeeded();
        await p.screenshot({ path: `${OUT}/${s.name}-instagram-safari-hint.png` });
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.reload({ waitUntil: 'load' });
        await p.locator('.lp-onphone-title').waitFor();
        await sleep(900);
      }
      await remember(p);
      await p.screenshot({ path: `${OUT}/${s.name}-${where}.png` });
      await p.screenshot({ path: `${OUT}/${s.name}-${where}-full.png`, fullPage: true });
      await ctx.close();
    }
  }

  // ——— 2. Sign up with email in Safari: "You're in! 🎉" ———
  const email = `delivered+haloplus-signup-${Date.now()}@resend.dev`;
  const ctx = await wk.newContext({ ...devices['iPhone 14'] });
  watch(ctx);
  await ctx.route('https://haloplus.app/**', site);
  const p = await ctx.newPage();
  await p.goto('https://haloplus.app/?src=ig', { waitUntil: 'load' });
  await p.locator('#lp-onphone-email').waitFor();
  const a = await p.locator('#lp-onphone-email').evaluate((e) => ({ type: e.type, name: e.name, ac: e.autocomplete, im: e.inputMode }));
  check(a.type === 'email' && a.name === 'email' && a.ac === 'email' && a.im === 'email', `the email box asks the phone for their address: ${JSON.stringify(a)}`);
  await p.locator('#lp-onphone-email').tap();
  await p.locator('#lp-onphone-email').fill(email);
  await p.locator('.lp-onphone-email-btn').tap();
  await p.locator('#lp-onphone-password').waitFor({ timeout: 5000 });
  check((await p.locator('#lp-onphone-password').getAttribute('autocomplete')) === 'new-password', 'then a password, which the phone can suggest (autocomplete new-password)');
  await p.locator('#lp-onphone-password').fill('Throwaway-pass-2026!');
  const sent = new Promise((res) => ctx.on('request', (r) => r.url().endsWith('/functions/v1/laptop-link') && r.method() === 'POST' && res(r.headers().authorization ?? '')));
  const t0 = Date.now();
  await p.locator('.lp-onphone-email-btn').tap();
  await p.locator('.phone-welcome').waitFor({ timeout: 30000 });
  console.log(`STEP sign-up with email → "You're in!" in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  user = await p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.user?.id ?? null, `sb-${ref}-auth-token`);
  const auth = await Promise.race([sent, sleep(20000).then(() => '')]);
  check(/^Bearer ey/.test(auth), 'the laptop link is emailed automatically, from the account (no typing)');
  const ok = await p.waitForFunction(() => /We sent the link/.test(document.querySelector('.phone-welcome-mail')?.textContent ?? ''), null, { timeout: 20000 }).then(() => true, () => false);
  const inT = await text(p, '.phone-welcome');
  check(ok && /You’re in!/.test(inT) && /Check your email to get Halo\+ on your laptop\./.test(inT), `"You're in! 🎉": "${inT.slice(0, 220)}"`);
  check(/Text or AirDrop it to my laptop|Copy the link instead/.test(inT) && /Explore a preview/.test(inT), 'the share backup and a small "Explore a preview"');
  await sleep(1500);
  const extra = await p.evaluate(() => ({ onboard: !!document.querySelector('.onboard'), tiles: !!document.querySelector('.phone-in-tile'), plans: /Free|Max|\$0\.99/.test(document.querySelector('.phone-welcome').innerText) }));
  check(!extra.onboard && !extra.tiles && !extra.plans, `nothing else: no setup steps, no plan screens (${JSON.stringify(extra)})`);
  const prof = (await db.from('profiles').select('signup_source').eq('user_id', user).single()).data;
  check(prof?.signup_source === 'ig', `the account's source is Instagram (${prof?.signup_source})`);
  const row = (await db.from('laptop_links').select('vid, status').eq('vid', await p.evaluate(() => localStorage.getItem('school-dashboard:vid'))).maybeSingle()).data;
  check(row?.status === 'sent', 'the email went (one ledger row, the address only as a hash)');
  await remember(p);
  await sleep(500);
  await p.screenshot({ path: `${OUT}/youre-in.png` });
  await p.screenshot({ path: `${OUT}/youre-in-full.png`, fullPage: true });
  // Explore the preview, and back.
  await p.locator('.phone-welcome-preview').tap();
  await p.locator('.demo-chip-preview').waitFor({ timeout: 20000 });
  await sleep(1500);
  const chip = await text(p, '.demo-chip-preview');
  const nowT = await text(p);
  check(/Preview · Maya Torres, a made-up student\. Yours fills in from Halo\./.test(chip) && /Back to my account/.test(chip) && /#\/now/.test(p.url()), `the preview: "${chip}"`);
  check(/Topic 3/.test(nowT), 'the preview shows a full Now (Maya’s classes)');
  await p.screenshot({ path: `${OUT}/preview-now.png` });
  await p.goto('https://haloplus.app/#/calendar', { waitUntil: 'load' });
  await p.locator('.demo-chip-preview').waitFor({ timeout: 15000 });
  await sleep(1500);
  await p.screenshot({ path: `${OUT}/preview-calendar.png` });
  await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
  await p.locator('.demo-chip-preview').waitFor({ timeout: 15000 });
  await sleep(1500);
  await p.screenshot({ path: `${OUT}/preview-classes.png` });
  await p.locator('.demo-chip-preview .demo-chip-btn').tap();
  await p.waitForFunction(() => !document.querySelector('.demo-chip-preview') && !localStorage.getItem('school-dashboard:demo'), null, { timeout: 20000 });
  await sleep(1500);
  check(!/Maya Torres/.test(await text(p)) && (await p.locator('.phone-welcome').count()) === 1, 'Back to my account: the preview is gone, and "You\'re in!" again');
  await p.screenshot({ path: `${OUT}/back-to-account.png` });
  // Their laptop syncs while the phone is in the preview: the preview ends by itself and their own class is there.
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.locator('.phone-welcome-preview').tap();
  await p.locator('.demo-chip-preview').waitFor({ timeout: 20000 });
  const cid = crypto.randomUUID();
  const iso = new Date().toISOString();
  await db.from('courses').insert({ id: cid, user_id: user, updated_at: iso, data: { id: cid, code: 'ZZZ-299', name: 'Synced From The Laptop', color: '#7c5cff', credits: 3, instructors: [], meetings: [], meetingsFrom: null, online: true, haloClassId: 'e2e-299', haloSlugId: 'ZZZ-299-E2E', termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: iso } });
  const t1 = Date.now();
  const left = await p.waitForFunction(() => !document.querySelector('.demo-chip-preview') && !localStorage.getItem('school-dashboard:demo'), null, { timeout: 90000 }).then(() => true, () => false);
  await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
  const mine = await p.waitForFunction(() => /ZZZ-299/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true, () => false);
  check(left && mine && (await p.locator('.onboard, .phone-welcome').count()) === 0, `their laptop synced: the preview ended by itself in ${((Date.now() - t1) / 1000).toFixed(0)} s and their own class is on the phone (no setup screens)`);
  await p.screenshot({ path: `${OUT}/after-laptop-sync.png` });
  await ctx.close();
  // Back to "never synced" for the reminder below (a synced account gets no reminder, rightly).
  await db.from('courses').delete().eq('user_id', user);
  // The same account on a laptop: the usual onboarding (Connect Halo), not the phone's screen.
  {
    const lb = await chromium.launch();
    const lctx = await lb.newContext({ viewport: { width: 1280, height: 860 } });
    await lctx.route('https://haloplus.app/**', site);
    await lctx.route('**/functions/v1/report', (r2) => r2.fulfill({ status: 200, body: '{}' }));
    const { session } = await kit.signIn(email);
    await lctx.addInitScript(({ key, ses }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { key: `sb-${ref}-auth-token`, ses: session });
    const lp = await lctx.newPage();
    await lp.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
    const onb = await lp.waitForFunction(() => /Connect Halo/.test(document.querySelector('.onboard')?.innerText ?? ''), null, { timeout: 40000 }).then(() => true, () => false);
    await sleep(800);
    check(onb && (await lp.locator('.phone-welcome').count()) === 0, `on a laptop the same account gets the usual setup ("${onb ? (await text(lp, '.onboard')).slice(0, 90) : 'none'}")`);
    await lp.screenshot({ path: `${OUT}/laptop-usual-onboarding.png` });
    await lb.close();
  }
  check(['email-signup', 'preview', 'safari'].every((st) => seen.some((b) => b.step === st)), `counted: ${[...new Set(seen.map((b) => b.step))].join(', ')}`);

  // ——— 3. The one reminder, a day later (rolled back: nothing stays) ———
  const r = rolledBack(`update auth.users set created_at = now() - interval '25 hours' where id = '${user}'; perform public.email_queue_tick(); select jsonb_build_object('n', count(*), 'src', max(meta ->> 'src'), 'acct', max(meta ->> 'acct')) into m from public.email_outbox where user_id = '${user}' and kind = 'finish_setup';`);
  check(r.n === 1 && r.src === 'ig' && r.acct === 'email', `a day later, never synced: one reminder queued (${JSON.stringify(r)}); rolled back`);
  const again = rolledBack(`update auth.users set created_at = now() - interval '25 hours' where id = '${user}'; insert into public.email_outbox (user_id, to_email, kind, meta, sent_at) values ('${user}', 'x', 'finish_setup', '{}', now() - interval '8 days'); perform public.email_queue_tick(); select jsonb_build_object('n', count(*)) into m from public.email_outbox where user_id = '${user}' and kind = 'finish_setup';`);
  check(again.n === 1, `once ever: with the reminder already sent, nothing more is queued (${JSON.stringify(again)}); rolled back`);
  check(((await db.from('email_outbox').select('id').eq('user_id', user)).data ?? []).length === 0, 'nothing from those runs stayed in the outbox');

  // ——— 4. Admin's chart ———
  const cr = await chromium.launch();
  {
    const admin = await kit.persona('admin');
    const { c } = await kit.signIn(admin.email);
    const { data: f, error } = await c.rpc('admin_ig_funnel', { p_days: 1 });
    check(!error && f.email_signup >= 1 && f.preview >= 1 && f.safari >= 1 && f.signed_up_email >= 1, `admin_ig_funnel: sign-up started by email ${f?.email_signup}, accounts by email ${f?.signed_up_email}, preview ${f?.preview}, Home Screen steps ${f?.home_steps}${error ? ` (${error.message})` : ''}`);
    const actx = await cr.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await actx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
    await actx.route('https://haloplus.app/**', site);
    await actx.route('**/functions/v1/report', (r2) => r2.fulfill({ status: 200, body: '{}' }));
    const ap = await actx.newPage();
    await ap.goto('https://haloplus.app/#/admin', { waitUntil: 'load' });
    const card = ap.locator('.admin-ig-funnel');
    await card.locator('.ig-drop').waitFor({ timeout: 30000 });
    await card.scrollIntoViewIfNeeded();
    await sleep(800);
    await card.screenshot({ path: `${OUT}/admin-funnel.png` });
    await actx.close();
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
  if (user) {
    await assertThrowaways(db, [user], 'the phone sign-up throwaway');
    for (const t of ['pending_syncs', 'sync_keys', 'courses', 'items', 'settings', 'announcements', 'usage_events', 'onboarding_events', 'notification_prefs', 'trial_days', 'email_outbox', 'ext_installs']) await db.from(t).delete().eq('user_id', user);
    await db.auth.admin.deleteUser(user);
  }
  await wk.close();
  console.log(`removed ${await kit.cleanup()} throwaways (+${user ? 1 : 0})`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
