// Admin → Celebrations preview (George, 2026-10-02), on the real backend with a throwaway admin. Checks: admins only;
// every button plays its moment in the real components, with the Celebrations switch OFF on the account; the
// reduced-motion switch gives the soft versions; Play all runs the whole list; and, the point of it, NOTHING is
// saved: the account's settings, items, courses, profile, push rows and the browser's own storage are identical
// before and after, and no request that writes anything leaves the page. Screens of the section, light and dark.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-celebrations-preview.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/joy';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const open = async (who, scheme = 'light', viewport = { width: 1280, height: 1000 }) => {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  // The app's own background AI reading (it re-reads classes after a sync) writes items and its usage counter on its
  // own schedule; that is not the preview, so it is held off here to compare the account cleanly.
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: r.request().url().includes('/report') ? 200 : 503, body: '{}' }));
  const p = await ctx.newPage();
  const writes = [];
  p.on('request', (r) => {
    const u = r.url();
    if (!/supabase\.co/.test(u) || r.method() === 'GET' || r.method() === 'OPTIONS' || /\/auth\/v1\/(token|user)/.test(u) || /\/rest\/v1\/rpc\/(admin_|app_setting|my_)/.test(u)) return;
    // The screen-view counter ("screen:admin" for opening this page, sent a minute later) counts opening the screen, not the preview.
    if (/\/rpc\/bump_usage/.test(u) && (JSON.parse(r.postData() || '{}').p_keys ?? []).every((k) => k.startsWith('screen:'))) return;
    writes.push(`${r.method()} ${u.replace(/^https:\/\/[^/]+/, '')}`);
  });
  await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
  return { ctx, p, writes };
};
const snapshot = async (id) => {
  const get = async (t, cols = '*') => (await db.from(t).select(cols).eq('user_id', id)).data ?? [];
  return JSON.stringify({
    settings: (await get('settings')).map((r) => r.data),
    items: (await get('items')).map((r) => [r.id, r.data]).sort(),
    courses: (await get('courses')).map((r) => [r.id, r.data]).sort(),
    profile: (await get('profiles')).map(({ updated_at: _u, ...r }) => r),
    plan: (await get('notification_plan')).length,
    push: (await get('push_subscriptions')).length,
  });
};
const local = (p) => p.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !k.startsWith('sb-')).sort()));

try {
  const boss = await kit.persona('admin');
  // The account has Celebrations OFF: the preview must show them anyway.
  const { data: st } = await db.from('settings').select('data').eq('user_id', boss.id).single();
  await db.from('settings').update({ data: { ...st.data, celebrations: false, updatedAt: new Date().toISOString() } }).eq('user_id', boss.id);

  // Admins only.
  {
    const plus = await kit.persona('plus');
    const { ctx, p } = await open(plus);
    await p.waitForSelector('main, .empty', { timeout: 20000 });
    await p.waitForTimeout(3000);
    check((await p.locator('.admin-celebrations').count()) === 0 && /for the people who run the app/.test(await p.locator('body').innerText()), 'a Plus student does not see Admin or the preview');
    await ctx.close();
  }

  const { ctx, p, writes } = await open(boss, 'light');
  await p.waitForSelector('.admin-celebrations', { timeout: 30000 });
  await p.waitForTimeout(6000);
  const sec = p.locator('.admin-celebrations');
  const btn = (name) => sec.getByRole('button', { name, exact: true });
  const toastIs = async (re, label) => {
    try {
      await p.waitForSelector('.joy-toast', { timeout: 9000 });
      const deadline = Date.now() + 9000;
      let t = '';
      while (Date.now() < deadline) { t = (await p.locator('.joy-toast').innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); if (re.test(t)) break; await p.waitForTimeout(150); }
      check(re.test(t), `${label}: "${t}"`);
    } catch (e) { check(false, `${label}: no toast (${e.message.slice(0, 60)})`); }
  };
  const waitGone = () => p.waitForSelector('.joy-toast', { state: 'detached', timeout: 8000 }).catch(() => undefined);

  // The app has finished its own first-look recording: two looks, six seconds apart, agree.
  let before = await snapshot(boss.id);
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(6000); const again = await snapshot(boss.id); if (again === before) break; before = again; }
  const beforeLocal = await local(p);
  writes.length = 0; // whatever the app itself recorded while it loaded (a first look) is before this line
  check((await p.locator('.admin-celebrations .btn').count()) >= 30, `the section has its buttons (${await p.locator('.admin-celebrations .btn').count()})`);

  // Every button, the real components, Celebrations OFF on the account.
  await btn('Check-off burst').click();
  await p.waitForSelector('.joy-burst', { state: 'attached', timeout: 3000 });
  check(true, 'check-off: the gold burst plays at the button');
  await toastIs(/^\+50 pts done, 3 days early · CHM-113L is 34% complete$/, 'check-off toast');
  await waitGone();
  await btn('Sync celebration').click();
  const pieces = await p.waitForSelector('.joy-confetti i', { state: 'attached', timeout: 4000 }).then(() => p.locator('.joy-confetti i').count()).catch(() => 0);
  await toastIs(/^Nice\. 3 things turned in since last sync\.$/, 'sync celebration');
  check(pieces > 40, `confetti shows although Celebrations is off on this account (${pieces} pieces)`);
  await waitGone();
  for (const m of [25, 50, 75]) { await btn(`${m}%`).click(); await toastIs(new RegExp(`^CHM-113L is ${m}% done\\.$`), `milestone ${m}%`); await waitGone(); }
  await btn('100% · You finished').click();
  await p.waitForSelector('.joy-card', { timeout: 8000 });
  const cardPieces = await p.waitForSelector('.joy-confetti i', { state: 'attached', timeout: 4000 }).then(() => p.locator('.joy-confetti i').count()).catch(() => 0);
  check(/You finished CHM-113L\./.test(await p.locator('.joy-card').innerText()) && cardPieces > 40, 'the finished-class card with confetti');
  await p.locator('.joy-card button:has-text("Nice")').click();
  await waitGone();
  await btn('Ring fills · clear for today').click();
  await p.waitForSelector('.pv-stage .now-ring[data-clear]', { timeout: 6000 });
  await toastIs(/^You're clear for today\.$/, 'ring: clear for today');
  await waitGone();
  for (const d of [3, 7, 14, 30]) { await btn(`${d} days`).click(); await toastIs(new RegExp(`^${d}-day streak going\\.$`), `streak ${d}`); await waitGone(); }
  await btn('Level 5').click();
  await p.waitForSelector('.levelup', { timeout: 3000 });
  check(/Level 5\./.test(await p.locator('.levelup').innerText()) && (await p.locator('.pv-stage .brand-mark').getAttribute('data-level-step')) === '5', 'level 5: the level-up overlay and the halo at step 5');
  await p.locator('.levelup').click();
  await btn('All 8 levels').click();
  await p.waitForFunction(() => document.querySelector('.pv-stage .brand-mark')?.getAttribute('data-level-step') === '8', null, { timeout: 15000 });
  check(true, 'all 8 levels: the halo steps up to 8');
  await p.waitForTimeout(1800);
  check((await p.locator('.levelup').count()) === 0, 'the sweep closes its own overlay');
  for (const [label, name] of [['Early bird', 'Early bird'], ['No late work this week', 'No late work this week'], ['Survived a heavy week', 'Survived a heavy week'], ['Clean sweep', 'Clean sweep']]) { await btn(label).click(); await toastIs(new RegExp(`^Badge: ${name}\\.$`), `badge ${name}`); await waitGone(); }
  await btn('Grade up + push').click();
  await toastIs(/^Your CHM-113 grade went up to 91%\.$/, 'grade-up toast');
  check(/Grade up\s*Your CHM-113 grade went up to 91%\./.test((await p.locator('.pv-push').innerText()).replace(/\s+/g, ' ').replace('Grade up ', 'Grade up')), `what the push would say: "${(await p.locator('.pv-push').innerText()).replace(/\s+/g, ' ')}"`);
  await waitGone();
  await btn('Graded well').click(); await toastIs(/^Graded: 47\/50 on Lab 3\.$/, 'graded well'); await waitGone();
  await btn('Topic cleared').click(); await toastIs(/^CHM-113 · Topic 4 cleared\.$/, 'topic cleared'); await waitGone();
  await btn('Monday "Last week" card').click();
  await p.waitForSelector('.pv-stage .wrap-card', { timeout: 3000 });
  check(/Last week: 9 things turned in, 620 pts\. Best week yet\./.test(await p.locator('.pv-stage .wrap-card').innerText()), 'the Monday card (the real card)');
  await btn('Confetti on Halo').click();
  await p.waitForFunction(() => !!document.getElementById('haloplus-joy')?.shadowRoot?.querySelector('.card'), null, { timeout: 3000 });
  check((await p.evaluate(() => document.getElementById('haloplus-joy').shadowRoot.querySelector('.card').textContent.replace('×', '').trim())) === '+50 pts · CHM-113L now 36% done' && (await p.evaluate(() => document.getElementById('haloplus-joy').shadowRoot.querySelectorAll('.c').length)) > 40, 'the extension confetti and card, in-app: "+50 pts · CHM-113L now 36% done"');
  await p.waitForTimeout(6600);

  // Reduced motion.
  await sec.locator('.pv-switch input').check();
  await btn('Sync celebration').click();
  await p.waitForSelector('.joy-toast', { timeout: 6000 });
  await p.waitForTimeout(300);
  check((await p.locator('.joy-glow').count()) === 1 && (await p.locator('.joy-confetti').count()) === 0, 'reduced motion: a soft glow instead of confetti');
  await waitGone();
  await btn('Confetti on Halo').click();
  await p.waitForFunction(() => !!document.getElementById('haloplus-joy')?.shadowRoot?.querySelector('.card'), null, { timeout: 3000 });
  check((await p.evaluate(() => !!document.getElementById('haloplus-joy').shadowRoot.querySelector('.glow'))) && (await p.evaluate(() => document.getElementById('haloplus-joy').shadowRoot.querySelectorAll('.c').length)) === 0, 'reduced motion: the Halo card gets a glow, no falling pieces');
  check((await p.evaluate(() => document.documentElement.hasAttribute('data-preview-reduced'))) === true, 'reduced motion asked for by the page');
  await sec.locator('.pv-switch input').uncheck();
  await p.waitForTimeout(6600);

  // Play all (fake nothing: the whole list, one after another).
  await btn('Play all').click();
  const seen = new Set();
  const started = Date.now();
  while (Date.now() - started < 240000) {
    const t = (await p.locator('.joy-toast, .joy-card .joy-card-title').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (t) seen.add(t);
    if ((await sec.getByRole('button', { name: 'Play all', exact: true }).count()) > 0) break;
    await p.waitForTimeout(250);
  }
  const must = ['+50 pts done, 3 days early · CHM-113L is 34% complete', 'Nice. 3 things turned in since last sync.', 'CHM-113L is 25% done.', 'You finished CHM-113L.', "You're clear for today.", '3-day streak going.', '30-day streak going.', 'Badge: Early bird.', 'Badge: Clean sweep.', 'Your CHM-113 grade went up to 91%.', 'Graded: 47/50 on Lab 3.', 'CHM-113 · Topic 4 cleared.'];
  const missing = must.filter((m) => !seen.has(m));
  check(missing.length === 0 && (await sec.getByRole('button', { name: 'Play all', exact: true }).count()) === 1, `Play all ran the list to the end in ${Math.round((Date.now() - started) / 1000)}s (${seen.size} toasts${missing.length ? `, missing: ${missing.join(' | ')}` : ''})`);
  await p.waitForTimeout(4500);

  // Nothing was saved.
  await p.waitForTimeout(8000);
  const after = await snapshot(boss.id);
  if (after !== before) {
    const a = JSON.parse(before), b = JSON.parse(after);
    for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) if (k === 'items') { const am = new Map(a.items), bm = new Map(b.items); for (const [id, d] of bm) { const o = am.get(id); if (JSON.stringify(o) !== JSON.stringify(d)) console.log('   item', d.title, Object.keys(d).filter((x) => JSON.stringify(o?.[x]) !== JSON.stringify(d[x]))); } }
      console.log('   differs:', k, k === 'settings' ? JSON.stringify(Object.keys(b[k][0]).filter((x) => JSON.stringify(a[k][0][x]) !== JSON.stringify(b[k][0][x]))) : '');
  }
  check(after === before, 'NOTHING SAVED: the account (settings, items, courses, profile, push rows) is identical before and after');
  const nowLocal = await local(p);
  if (nowLocal !== beforeLocal) { const a = new Map(JSON.parse(beforeLocal)), b = new Map(JSON.parse(nowLocal)); for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) console.log('   storage differs:', k); }
  check(nowLocal === beforeLocal, 'NOTHING SAVED: the browser storage is identical before and after');
  check(writes.length === 0, `no request that writes anything left the page (${writes.length}${writes.length ? `: ${writes.slice(0, 4).join(', ')}` : ''})`);
  const s2 = JSON.parse(after).settings[0];
  check(s2.celebrations === false && !s2.joy?.pending && !s2.joy?.streakSeen, 'the account still has Celebrations off, no joy flags written');

  // Screens: the section, light and dark.
  for (const scheme of ['light', 'dark']) {
    await ctx.close().catch(() => undefined);
    const r = await open(boss, scheme);
    await r.p.waitForSelector('.admin-celebrations', { timeout: 30000 });
    await r.p.waitForTimeout(4000);
    const s = r.p.locator('.admin-celebrations');
    await s.getByRole('button', { name: 'Ring fills · clear for today', exact: true }).click();
    await s.getByRole('button', { name: 'Level 6', exact: true }).click();
    await r.p.locator('.levelup').click();
    await s.getByRole('button', { name: 'Grade up + push', exact: true }).click();
    await s.getByRole('button', { name: 'Monday "Last week" card', exact: true }).click();
    await r.p.waitForTimeout(2600);
    // Below the sticky top bar, so the heading shows.
    await r.p.evaluate(() => { const el = document.querySelector('.admin-celebrations'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76); });
    await r.p.waitForTimeout(300);
    const box = await s.boundingBox();
    await r.p.setViewportSize({ width: 1280, height: Math.ceil(box.height) + 100 });
    await r.p.evaluate(() => { const el = document.querySelector('.admin-celebrations'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76); });
    await r.p.waitForTimeout(300);
    await r.p.screenshot({ path: `${OUT}/admin-celebrations-${scheme}.png` });
    await r.ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
