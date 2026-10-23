// The free trial in days of use (George, 2026-10-22), on the real backend with throwaways (marked Test, so no trial email
// is ever queued for them). Halo+ from the local build at haloplus.app in Chrome.
//   A. Opening Halo+ counts today, once: 2 earlier days of use + today = 3 used; the chip says "Max · 5 days left".
//   B. The 7th day of use: the trial now ends at midnight tonight, Phoenix; the chip says "Max · last day".
//   C. The 30-day limit nearer than the days of use: it wins ("Max · 2 days left").
//   D. A trial's floor (what it had before the switch) is never cut.
//   E. Back after days away on the trial: the welcome-back card at the top of Now, real numbers, Start here, days left;
//      once per return. On paid Max: the same card, no days-left line.
//   G. Admin: the Free trials table (real students, so counted, never screenshotted).
//   F. A new laptop whose first account load is dropped by the network (found on the way: setup started over the account's
//      saved state and showed Connect Halo): "Loading your classes…" with Try again, then Now by itself; setup untouched.
// Screens to docs/screens/trial-days/.
//   KEYS_ENV=... [LOCAL_SITE=dist-site] [ONLY=ABCDEFG] [TRACE=1] [LIVE=1] node scripts/e2e-trial-days.mjs
// dist-site must be built with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/trial-days';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 500) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(every); } return null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const DAY = 86_400_000;
const phx = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(t));
const today = phx(Date.now());
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const T0 = Date.now();
const ONLY = process.env.ONLY ?? 'ABCDEFG';
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 600000);

/** A throwaway on a trial that started at its first sync `synced` days ago, with `days` earlier days of use. */
async function onTrial(kind, synced, days, extra = {}) {
  const who = await kit.persona(kind);
  await db.from('profiles').update({ test_override: true, tier: 'free', trial_started_at: ago(synced + 1), trial_synced_at: ago(synced), trial_ends_at: new Date(Date.now() - synced * DAY + 30 * DAY).toISOString(), trial_days_used: 0, trial_floor_at: null, friend_from: null, ...extra }).eq('user_id', who.id);
  await db.from('trial_days').delete().eq('user_id', who.id);
  const rows = Array.from({ length: days }, (_, k) => ({ user_id: who.id, day: phx(Date.now() - (synced - k) * DAY) })).filter((r) => r.day < today);
  if (rows.length) await db.from('trial_days').insert(rows);
  await db.rpc('trial_recount', { uid: who.id });
  return who;
}
const profile = async (id) => (await db.from('profiles').select('trial_days_used, trial_last_day, trial_ends_at, trial_floor_at').eq('user_id', id).single()).data;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function open(who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  // F: the first loads of the account's classes fail, as a dropped connection does.
  // For dropMs from the first one: longer than supabase-js's own retries (1s, 2s, 4s), so the load itself fails.
  let dropped = 0;
  let first = 0;
  if (opts.dropMs)
    await ctx.route(/supabase\.co\/rest\/v1\/courses\?/, (route) => {
      first ||= Date.now();
      if (route.request().method() !== 'GET' || Date.now() - first > opts.dropMs) return route.fallback();
      dropped++;
      return route.abort('connectionfailed');
    });
  // LIVE=1: the deployed site itself, not the local build.
  if (!process.env.LIVE) await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.addInitScript(({ ses, key, seen, snap, uid }) => {
    if (location.hostname !== 'haloplus.app') return;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses));
    if (seen && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('school-dashboard:last-seen', seen);
      if (snap) localStorage.setItem(`school-dashboard:now-snapshot:${uid}`, snap);
      sessionStorage.setItem('seeded', '1');
    }
  }, { ses: who.session, key: `sb-${ref}-auth-token`, seen: opts.seen ?? null, snap: opts.snap ?? null, uid: who.id });
  const p = await ctx.newPage();
  p.on('requestfailed', (r) => process.env.TRACE && console.log('  failed', ((Date.now() - T0) / 1000).toFixed(1), r.method(), r.url().replace(/\?.*/, '').slice(0, 110), r.failure()?.errorText));
  if (process.env.TRACE && opts.seen) {
    p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('  console', m.type(), m.text().slice(0, 200)));
    p.on('response', (r) => /supabase/.test(r.url()) && console.log('  res', ((Date.now() - T0) / 1000).toFixed(1), r.status(), r.request().method(), r.url().slice(0, 140)));
    p.on('request', (r) => /settings|rpc|courses|items/.test(r.url()) && console.log('  req', ((Date.now() - T0) / 1000).toFixed(1), r.method(), r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 120)));
  }
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.now-head', { timeout: 30000 }).catch(() => undefined);
  return { ctx, p, dropped: () => dropped };
}
const chip = (p) => p.locator('.trial-chip .chip-long').innerText().catch(() => '');

try {
  // ---- A ------------------------------------------------------------------------------------------------------------
  if (ONLY.includes('A')) {
    const who = await onTrial('synced', 4, 2);
    const before = await profile(who.id);
    const { ctx, p } = await open(who);
    const after = await until(async () => { const r = await profile(who.id); return r.trial_days_used === 3 ? r : null; }, 20000);
    check(before.trial_days_used === 2 && !!after, `opening Halo+ counts today: ${before.trial_days_used} days of use before, ${after?.trial_days_used} after`);
    const c = await until(async () => { const t = await chip(p); return /5 days left/.test(t) ? t : null; }, 15000);
    check(!!c, `the chip: "${c ?? (await chip(p))}"`);
    await p.reload({ waitUntil: 'load' });
    await sleep(4000);
    check((await profile(who.id)).trial_days_used === 3, 'opening it again the same day does not count twice');
    await p.locator('.trial-chip').click();
    await sleep(600);
    const sheet = await p.locator('.trial-sheet').innerText().catch(() => '');
    check(/5 days of use left\./.test(sheet) && /A day counts when you open Halo\+, and you've used 3 of 7\./.test(sheet) && /It ends after your 7th day of use, or on [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+, whichever comes first/.test(sheet), `the trial sheet explains it: "${sheet.split('\n')[0]}"`);
    await p.screenshot({ path: `${OUT}/1-chip-sheet.png` });
    await ctx.close();
  }
  // ---- B ------------------------------------------------------------------------------------------------------------
  if (ONLY.includes('B')) {
    const who = await onTrial('synced', 10, 6);
    const { ctx, p } = await open(who);
    const r = await until(async () => { const x = await profile(who.id); return x.trial_days_used === 7 ? x : null; }, 20000);
    const midnight = phx(Date.parse(r?.trial_ends_at ?? 0) - 1000) === today && new Date(r?.trial_ends_at ?? 0).getUTCHours() === 7 && new Date(r?.trial_ends_at ?? 0).getUTCMinutes() === 0;
    check(!!r && midnight, `the 7th day of use: it ends at midnight tonight, Phoenix (${r?.trial_ends_at})`);
    const c = await until(async () => { const t = await chip(p); return /last day/.test(t) ? t : null; }, 15000);
    check(!!c, `the chip: "${c ?? (await chip(p))}"`);
    await p.screenshot({ path: `${OUT}/2-last-day.png` });
    await ctx.close();
  }
  // ---- C ------------------------------------------------------------------------------------------------------------
  if (ONLY.includes('C')) {
    const who = await onTrial('synced', 28.6, 1);
    const { ctx, p } = await open(who);
    const c = await until(async () => { const t = await chip(p); return /2 days left|last day/.test(t) ? t : null; }, 20000);
    check(!!c && /2 days left/.test(c), `the 30-day limit is nearer than the days of use: "${c ?? (await chip(p))}"`);
    await ctx.close();
  }
  // ---- D ------------------------------------------------------------------------------------------------------------
  if (ONLY.includes('D')) {
    const floor = new Date(Date.now() + 5 * DAY).toISOString();
    const who = await onTrial('synced', 12, 7, { trial_floor_at: floor });
    const r = await profile(who.id);
    check(Date.parse(r.trial_ends_at) >= Date.parse(floor) - 1000, `seven days used, but a trial is never cut below what it had (ends ${r.trial_ends_at}, floor ${floor})`);
    // The student's own client cannot move the first sync (the 30-day limit) or the count (migration 0041).
    const { c } = await kit.signIn(who.email);
    await c.from('profiles').update({ trial_synced_at: new Date(Date.now() + 300 * DAY).toISOString(), trial_days_used: 0, trial_floor_at: new Date(Date.now() + 300 * DAY).toISOString(), trial_last_day: null }).eq('user_id', who.id);
    await c.rpc('trial_touch');
    const g = (await db.from('profiles').select('trial_synced_at, trial_days_used, trial_floor_at, trial_ends_at').eq('user_id', who.id).single()).data;
    check(Date.parse(g.trial_synced_at) < Date.now() && g.trial_days_used >= 7 && Date.parse(g.trial_floor_at) <= Date.parse(floor) + 1000 && Date.parse(g.trial_ends_at) < Date.now() + 6 * DAY, `the student's own client cannot stretch it (ends ${g.trial_ends_at})`);
  }
  // ---- E ------------------------------------------------------------------------------------------------------------
  for (const plan of ONLY.includes('E') ? ['trial', 'max'] : []) {
    const who = plan === 'trial' ? await onTrial('synced', 6, 3) : await kit.persona('max');
    if (plan === 'max') await db.from('profiles').update({ test_override: true }).eq('user_id', who.id);
    // Last seen three days ago on this device and on the account; the picture from then lacks two assignments and has
    // another one a day earlier.
    const items = ((await db.from('items').select('data').eq('user_id', who.id)).data ?? []).map((r) => r.data).filter((i) => !i.deletedAt);
    const halo = items.filter((i) => i.source === 'halo');
    const pick = halo.length >= 3 ? halo : items;
    const snap = { v: 1, at: ago(3), items: {} };
    const dayOf = (iso) => phx(Date.parse(iso));
    for (const i of items) snap.items[i.id] = [dayOf(i.dueAt), i.score ?? null, (i.requirements ?? []).map((r) => r.id)];
    delete snap.items[pick[0].id];
    delete snap.items[pick[1].id];
    snap.items[pick[2].id][0] = phx(Date.parse(pick[2].dueAt) - DAY);
    const seen = phx(Date.now() - 3 * DAY);
    const st = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
    await db.from('settings').update({ data: { ...st, lastSeenDay: seen, updatedAt: new Date().toISOString() } }).eq('user_id', who.id);
    const { ctx, p } = await open(who, { seen, snap: JSON.stringify(snap) });
    const card = await until(async () => (await p.locator('.welcome-back-title').count()) ? await p.locator('.welcome-back-card').evaluate((el) => [...el.children].filter((c) => !c.matches('.welcome-back-x')).map((c) => c.innerText).join('\n')) : null, 20000);
    if (!card) {
      await p.screenshot({ path: `${OUT}/debug-${plan}.png` });
      const sd = (await db.from('settings').select('updated_at, data').eq('user_id', who.id).single()).data;
      const nc = (await db.from('courses').select('id', { count: 'exact', head: true }).eq('user_id', who.id)).count;
      console.log('DEBUG', who.email, JSON.stringify({ upd: sd.updated_at, lastPull: !!sd.data.lastPull, ob: sd.data.onboarding, courses: nc, st: Object.keys(st).length }));
    }
    if (plan === 'trial') {
      check(!!card && /^Welcome back to Max! Here's what you missed:/.test(card) && /new assignment/.test(card) && /Start here:/.test(card) && /\d+ days of Max left\./.test(card), `trial: "${(card ?? '').replace(/\s+/g, ' ').slice(0, 170)}"`);
      check((await p.locator('.since-looked-line').count()) === 0, 'the "Since you last looked" line steps aside while the card shows');
      await p.screenshot({ path: `${OUT}/3-welcome-back-trial.png` });
    } else {
      check(!!card && /^Welcome back to Max!/.test(card) && !/days of Max left/.test(card), `paid Max: the same card, no days-left line: "${(card ?? '').replace(/\s+/g, ' ').slice(0, 120)}"`);
      await p.screenshot({ path: `${OUT}/4-welcome-back-paid.png` });
    }
    await p.reload({ waitUntil: 'load' });
    await sleep(5000);
    if (plan === 'trial') check((await p.locator('.welcome-back-card').count()) === 0, 'once per return: a reload the same day shows nothing');
    await ctx.close();
  }
  // ---- F ------------------------------------------------------------------------------------------------------------
  if (ONLY.includes('F')) {
    const who = await onTrial('synced', 3, 1);
    const { ctx, p, dropped } = await open(who, { dropMs: 12000 });
    if (process.env.TRACE) for (let k = 0; k < 10; k++) { console.log('  t', k * 2, dropped(), (await p.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60)); await sleep(2000); }
    const waiting = await until(async () => /didn't answer yet/.test(await p.locator('.account-loading').innerText()), 20000, 250);
    check(waiting && (await p.getByRole('button', { name: 'Try again' }).count()) === 1, 'a dropped first load: "Loading your classes…" says so, with Try again');
    await p.screenshot({ path: `${OUT}/5-first-load-dropped.png` });
    const now = await until(async () => (await p.locator('.account-loading').count()) === 0 && (await p.locator('.now-head').isVisible()), 60000);
    console.log(`  (${dropped()} reads dropped)`);
    if (!now) { await p.screenshot({ path: `${OUT}/debug-f.png` }); console.log('  body', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)); }
    const ob = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data.onboarding;
    check(!!now && (await p.locator('.onboard').count()) === 0, 'then Now by itself once the account answers (no reload, no tap), and never Connect Halo');
    check(ob?.step === 'done' && !!ob?.doneAt, `the account's setup is untouched (step ${ob?.step})`);
    await ctx.close();
  }
  // ---- G ------------------------------------------------------------------------------------------------------------
  if (ONLY.includes('G')) {
    const who = await kit.persona('admin');
    const { ctx, p } = await open(who);
    await p.goto('https://haloplus.app/#/admin', { waitUntil: 'load' });
    const card = p.locator('.admin-trials');
    await card.waitFor({ timeout: 30000 }).catch(() => undefined);
    await until(async () => !/Loading…/.test(await card.innerText()), 20000);
    const heads = await card.locator('thead th').allInnerTexts();
    const rows = await card.locator('tbody tr').count();
    check(['Days of use', 'Calendar days'].every((h) => heads.includes(h)) && rows > 0, `Admin > Free trials: ${rows} students, columns ${heads.join(' | ')}`);
    await ctx.close();
  }
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.message);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
