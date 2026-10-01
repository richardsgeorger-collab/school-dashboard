// Auto-sync is Max (George, 2026-10-01). On the real backend with throwaway accounts:
//   1. The server (sync-drop): a scheduled extension sync (payload.auto, sent by every extension build including the
//      0.3.x in review) is refused on Plus with "part of Max", and taken on Max, a Max trial and a friend-link Max;
//      Sync now (auto false) is taken on Plus.
//   2. The app: a scheduled sync handed straight to an open Halo+ tab by an older extension is ignored on Plus, while
//      the same export by hand opens the review.
//   3. The extension (this repo's build, loaded unpacked, not uploaded): on Plus no schedule, a scheduled alarm does
//      not sync, the popup says "Auto-sync is part of Max" with Get Max, and Sync now still runs; on Max the schedule
//      is on. Screens of the Plus popup, light and dark.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-autosync-max.mjs
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const EXT = resolve('extension');
const OUT = 'docs/screens/autosync-max';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const DROP = `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/sync-drop`;
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const exportOf = (auto, source = 'extension') => ({ kind: 'halo-export', version: 1, build: 'e2e', exportedAt: new Date().toISOString(), source, auto, classes: [{ id: 'hc-e2e', slugId: 'E2E-101-X', classCode: 'E2E-101-X', courseCode: 'E2E-101', name: 'Test class', startDate: null, endDate: null, stage: 'CURRENT', modality: null, credits: 3, assessments: [] }] });
const drop = async (key, auto) => {
  const r = await fetch(DROP, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'chrome-extension://e2e' }, body: JSON.stringify({ key, payload: exportOf(auto), via: 'extension' }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // 1. The server.
  const people = { plus: await kit.persona('plus'), max: await kit.persona('max'), trial: await kit.persona('synced'), friend: await kit.persona('friend') };
  for (const [name, p] of Object.entries(people)) {
    const { c } = await kit.signIn(p.email);
    const { data } = await c.rpc('my_sync_key');
    p.key = data.key;
    const r = await drop(p.key, true);
    if (name === 'plus') check(r.status === 403 && /Automatic syncs are part of Max/.test(r.body.why ?? ''), `server: a scheduled sync on Plus is refused (${r.status} "${r.body.why}")`);
    else check(r.status === 200 && r.body.ok === true, `server: a scheduled sync on ${name === 'trial' ? 'a Max trial' : name === 'friend' ? 'a friend-link Max' : 'Max'} is taken (${r.status})`);
  }
  const manual = await drop(people.plus.key, false);
  check(manual.status === 200 && manual.body.ok === true, `server: Sync now on Plus is taken (${manual.status})`);
  await db.from('pending_syncs').delete().in('user_id', Object.values(people).map((p) => p.id));

  // 2. The app: a scheduled sync handed straight to the tab is ignored on Plus; by hand it opens the review.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: people.plus.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.now', { timeout: 20000 });
    await p.waitForTimeout(3000);
    const before = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1') || '{}').settings?.lastPull?.at ?? null);
    await p.evaluate((x) => window.postMessage(x, location.origin), exportOf(true));
    await p.waitForTimeout(4000);
    const after = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1') || '{}').settings?.lastPull?.at ?? null);
    check(after === before && (await p.locator('.modal-backdrop').count()) === 0, 'app: a scheduled sync handed to an open tab on Plus is ignored');
    await p.evaluate((x) => window.postMessage(x, location.origin), exportOf(false, 'bookmarklet'));
    await p.waitForSelector('.modal-backdrop', { timeout: 8000 }).catch(() => undefined);
    check((await p.locator('.modal-backdrop').count()) > 0, 'app: the same export by hand opens the review');
    await ctx.close();
  }

  // 3. The extension (unpacked from this repo).
  const ectx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'haloplus-ext-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 900 } });
  try {
    const calls = { n: 0 };
    await ectx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
    await ectx.route('https://gateway.halo.gcu.edu/**', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      calls.n++;
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'test gateway' }] }) });
    });
    let [worker] = ectx.serviceWorkers();
    if (!worker) worker = await ectx.waitForEvent('serviceworker', { timeout: 15000 });
    const extId = worker.url().split('/')[2];
    const page = await ectx.newPage();
    await page.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
    const setTier = async (tier) => {
      await page.evaluate((t) => chrome.runtime.sendMessage({ kind: 'tier', tier: t }), tier);
      await page.waitForTimeout(800);
    };
    const alarm = () => worker.evaluate(() => chrome.alarms.get('auto-sync').then((a) => !!a));
    await setTier('max');
    check(await alarm(), 'extension: on Max the 3-hour schedule is on');
    await setTier('plus');
    check(!(await alarm()), 'extension: on Plus there is no schedule');
    // Even an alarm that is somehow there does not sync on Plus.
    await worker.evaluate(async () => { await chrome.storage.local.remove('lastSyncAt'); await chrome.alarms.create('auto-sync', { when: Date.now() + 1000, periodInMinutes: 180 }); });
    await page.waitForTimeout(6000);
    check(calls.n === 0 && !(await alarm()), `extension: a scheduled alarm on Plus does not sync, and is cleared (Halo calls ${calls.n})`);
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 320, height: 340 });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(700);
      if (scheme === 'light') {
        const note = await page.locator('#plus').innerText();
        const href = await page.locator('#upgrade').getAttribute('href');
        check(!(await page.locator('#plus').isHidden()) && /Auto-sync is part of Max\. Sync now still works on Plus\./.test(note) && /Get Max/.test(note) && /#\/you\?s=plan&to=max$/.test(href ?? ''), `extension popup on Plus: "${note.replace(/\s+/g, ' ')}" → ${href}`);
        check(!/Next sync around/.test(await page.locator('#status').innerText()) && (await page.locator('#sync').isEnabled()), 'extension popup on Plus: no "next sync", Sync now is there');
      }
      await page.screenshot({ path: `${OUT}/popup-plus-${scheme}.png` });
    }
    // Sync now still runs on Plus.
    await page.click('#sync');
    await page.waitForTimeout(8000);
    check(calls.n > 0, `extension: Sync now runs on Plus (Halo calls ${calls.n})`);
    await setTier('max');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    check(await page.locator('#plus').isHidden(), 'extension popup on Max: no Max note');
  } finally {
    await ectx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
