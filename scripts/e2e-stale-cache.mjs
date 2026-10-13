// Never scare a student when everything is fine (George, 2026-10-12). Real account rows (throwaways), the e2e build.
//   (a) The laptop synced a minute ago. A phone-sized Safari opens with a ten-day-old cache whose settings it stamped a
//       moment ago (the case that dragged George's account back to "Oct 1"): within seconds the line says the fresh
//       time, and at no moment is there a red banner, "N days ago" or "Welcome back"; the account on the server keeps
//       its fresh last sync and every setting the old copy lacked. Sync now on the phone says syncs happen on the laptop.
//   (b) The same on a laptop-sized window with a stale cache.
//   (c) An account whose last sync really is eleven days old still gets the red banner, after the check.
//   (d) Another device's sync reaches an open tab within a minute, no reload.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-stale-cache.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/stale-cache';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 300) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
const dayStr = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const IPHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const LAPTOP = { viewport: { width: 1280, height: 860 } };

/** An account whose last sync was `days` ago on the server, with a reminders setting an old device copy will lack. */
async function account(days) {
  const who = await kit.persona('plus');
  const st = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
  const at = ago(days);
  const pulls = Object.fromEntries(Object.entries(st.haloPulls ?? {}).map(([k, v]) => [k, Object.fromEntries(Object.keys(v).map((kk) => [kk, at]))]));
  const stamp = ago(10 / 1440);
  const data = { ...st, lastPull: { ...(st.lastPull ?? {}), at, via: 'extension' }, haloPulls: pulls, reminders: { ...(st.reminders ?? {}), morningTime: '08:00' }, lastSeenDay: dayStr(days < 1 ? 0 : days), updatedAt: stamp };
  await db.from('settings').update({ data, updated_at: stamp }).eq('user_id', who.id);
  return { who, settings: data };
}

/** A device whose cache is the account as it was ten days ago, stamped a minute ago (it changed a small setting). */
async function staleCache(who, settings) {
  const courses = (await db.from('courses').select('data').eq('user_id', who.id)).data.map((r) => r.data);
  const items = (await db.from('items').select('data').eq('user_id', who.id)).data.map((r) => r.data);
  const old = ago(11);
  const pulls = Object.fromEntries(Object.entries(settings.haloPulls ?? {}).map(([k, v]) => [k, Object.fromEntries(Object.keys(v).map((kk) => [kk, old]))]));
  const { reminders: _dropped, lastSeenDay: _gone, ...rest } = settings;
  // The device changed one thing a minute ago (its theme, stamped as changed); everything else is ten days old.
  return { courses, items, settings: { ...rest, lastPull: { ...(settings.lastPull ?? {}), at: old }, haloPulls: pulls, theme: 'dark', stamps: { theme: ago(1 / 1440) }, updatedAt: ago(1 / 1440), supabaseUrl: env.VITE_SUPABASE_URL, supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY } };
}

async function open(browser, who, device, cache, lastSeen) {
  const ctx = await browser.newContext({ ...device });
  await ctx.addInitScript(({ ses, key, cache, owner, lastSeen }) => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem(key, JSON.stringify(ses));
    if (cache) {
      localStorage.setItem('school-dashboard:v1', JSON.stringify(cache));
      localStorage.setItem('school-dashboard:owner', owner);
      localStorage.setItem('school-dashboard:db-owner', owner);
    }
    if (lastSeen) localStorage.setItem('school-dashboard:last-seen', lastSeen);
  }, { ses: who.session, key: `sb-${ref}-auth-token`, cache, owner: who.id, lastSeen });
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  return { ctx, p };
}

/** Watches the first seconds for anything alarming, every 150 ms. */
async function watchScary(p, ms) {
  const seen = [];
  const t = Date.now();
  while (Date.now() - t < ms) {
    const s = await p.evaluate(() => {
      const red = document.querySelector('.sync-reminder[data-level="red"], .sync-reminder[data-level="amber"]');
      const body = document.body.innerText;
      return [red ? `banner: ${red.textContent.slice(0, 60)}` : '', /days away|Welcome back/.test(body) ? 'welcome back' : '', /Last synced \d+ days ago|never been synced/.test(body) ? 'days-ago text' : ''].filter(Boolean);
    }).catch(() => []);
    for (const x of s) if (!seen.includes(x)) seen.push(x);
    await sleep(150);
  }
  return seen;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [tag, device] of process.env.ONLY === 'd' ? [] : [['a', IPHONE], ['b', LAPTOP]]) {
    const { who, settings } = await account(1 / 1440);
    const cache = await staleCache(who, settings);
    const { ctx, p } = await open(browser, who, device, cache, dayStr(10));
    const t0 = Date.now();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    const scary = await watchScary(p, 8000);
    const name = tag === 'a' ? 'phone' : 'laptop';
    check(scary.length === 0, `${tag}. ${name} with a ten-day-old cache: nothing alarming in the first 8 s${scary.length ? ` (saw: ${scary.join('; ')})` : ''}`);
    const line = await until(async () => { const t = (await p.locator('.synced-when').first().innerText().catch(() => '')).trim(); return /Synced from Halo (just now|\d+ min ago)/.test(t) ? t : null; }, 8000);
    check(!!line, `${tag}. the line says the account's fresh sync: "${line ?? (await p.locator('.synced-when').first().innerText().catch(() => ''))}" (${Math.round((Date.now() - t0) / 1000)} s)`);
    await sleep(2500);
    const server = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
    check(server.lastPull?.at === settings.lastPull.at, `${tag}. the account kept its fresh last sync on the server (${server.lastPull?.at?.slice(11, 19)})`);
    check(server.reminders?.morningTime === '08:00' && server.theme === 'dark', `${tag}. the account kept the setting the old copy lacked, and took the device's own newer one`);
    if (tag === 'a') await p.screenshot({ path: `${OUT}/a-phone-fresh.png` });
    await ctx.close();
  }

  // c. Really eleven days old: the warning, after the check.
  if (process.env.ONLY !== 'd') {
    const { who } = await account(11);
    const { ctx, p } = await open(browser, who, LAPTOP, null, null);
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    const banner = await until(async () => { const b = p.locator('.sync-reminder[data-level="red"]'); return (await b.count()) ? await b.innerText() : null; }, 15000);
    check(!!banner && /Last synced 11 days ago\./.test(banner), `c. a truly old account gets the red banner: "${(banner ?? '').split('\n')[0]}"`);
    await ctx.close();
    // On a phone, Sync now says where syncs happen, never pretends.
    const ph = await open(browser, who, IPHONE, null, null);
    await ph.p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    const b2 = ph.p.locator('.sync-reminder');
    await b2.waitFor({ timeout: 15000 });
    for (let i = 0; i < 3 && (await ph.p.locator('.modal-backdrop').count()); i++) { await ph.p.keyboard.press('Escape'); await sleep(300); }
    await b2.locator('button:has-text("Sync now")').click();
    const said = await until(async () => { const t = await b2.innerText().catch(() => ''); return /Syncs happen on your laptop/.test(t) ? t : null; }, 5000);
    check(!!said && /Last synced/.test(said) && (await b2.locator('button:has-text("Sync on this phone")').count()) === 1 && !/Syncing/.test(said), `c. Sync now on a phone: "${(said ?? '').replace(/\s+/g, ' ').slice(0, 120)}"`);
    await ph.p.screenshot({ path: `${OUT}/c-phone-sync-now.png` });
    await ph.ctx.close();
  }

  // e. The account can't be reached (offline, the server down): this device's time, said as such, nothing alarming.
  if (process.env.ONLY !== 'd') {
    const { who, settings } = await account(1 / 1440);
    const cache = await staleCache(who, settings);
    const { ctx, p } = await open(browser, who, LAPTOP, cache, dayStr(10));
    await ctx.route('**/rest/v1/**', (r) => r.abort('internetdisconnected'));
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    const scary = await watchScary(p, 8000);
    const line = await until(async () => { const t = (await p.locator('.synced-when').first().innerText().catch(() => '')).trim(); return /as this device last saw it\. Can't reach your account right now\./.test(t) ? t : null; }, 20000);
    check(scary.length === 0 && !!line, `e. account unreachable: nothing alarming${scary.length ? ` (saw: ${scary.join('; ')})` : ''}, and the line says so: "${line ?? (await p.locator('.synced-when').first().innerText().catch(() => ''))}"`);
    await ctx.close();
  }

  // d. Another device's sync, picked up by an open tab within a minute.
  {
    const { who, settings } = await account(2 / 24);
    const { ctx, p } = await open(browser, who, LAPTOP, null, null);
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await until(async () => /Synced from Halo/.test(await p.locator('.synced-when').first().innerText().catch(() => '')), 15000);
    const before = (await p.locator('.synced-when').first().innerText()).trim();
    const now = new Date().toISOString();
    const st = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
    await db.from('settings').update({ data: { ...st, lastPull: { ...st.lastPull, at: now }, updatedAt: now }, updated_at: now }).eq('user_id', who.id);
    const t0 = Date.now();
    const after = await until(async () => { const t = (await p.locator('.synced-when').first().innerText().catch(() => '')).trim(); return /just now/.test(t) ? t : null; }, 70000, 1000);
    const srv = (await db.from('settings').select('data, updated_at').eq('user_id', who.id).single()).data;
    check(!!after, `d. another device's sync reached this tab in ${Math.round((Date.now() - t0) / 1000)} s without a reload: "${before}" → "${after}"${after ? '' : ` (visibility ${await p.evaluate(() => document.visibilityState)}; server lastPull ${srv.data.lastPull?.at} stamp ${srv.updated_at}; wrote ${now})`}`);
    check((await p.evaluate(() => performance.getEntriesByType('navigation').length)) === 1, 'd. no reload');
    void settings;
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
