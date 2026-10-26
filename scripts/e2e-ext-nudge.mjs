// Now's gentle "get the extension" card during the trial (George, 2026-10-25, Loop 268: "gently remind them once or
// twice on Now, not a popup"). A throwaway on the trial, synced, desktop Chrome, no extension: the card is on Now, not
// a dialog, with "Add it to Chrome" and "Not now"; Not now puts it away for the day; it comes back two days later and
// then never again (twice at most); never on a phone, never once the extension is connected, never after the trial.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-ext-nudge.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/ext-nudge';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phxDay = (n = 0) => new Date(Date.now() - 7 * 3_600_000 + n * 864e5).toISOString().slice(0, 10);
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const who = await kit.persona('trial-1d');
  // The trial is live, synced, and the extension setup sheet has been seen and skipped a while ago.
  await db.from('profiles').update({ trial_synced_at: new Date(Date.now() - 2 * 864e5).toISOString() }).eq('user_id', who.id);
  const { data: st } = await db.from('settings').select('data').eq('user_id', who.id).single();
  // The seeded throwaway synced "via extension"; this one has not set it up (synced with the bookmark).
  const patch = async (more) => db.from('settings').update({ data: { ...st.data, lastPull: { ...(st.data.lastPull ?? {}), via: 'bookmark' }, extSetup: { shownAt: new Date(Date.now() - 3 * 864e5).toISOString(), skippedAt: new Date(Date.now() - 3 * 864e5).toISOString() }, ...more, updatedAt: new Date().toISOString() } }).eq('user_id', who.id);
  await patch({});
  const open = async (device = { viewport: { width: 1280, height: 900 } }) => {
    const ctx = await browser.newContext({ ...device, colorScheme: 'light', reducedMotion: 'reduce' });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.now-head', { timeout: 30000 });
    await sleep(3500);
    // The trial's first-week "Halo+ caught…" card and any joy card sit over the page until tapped.
    // The trial's first-week "Halo+ caught…" card, a joy card, and on a Sunday the Sunday review sit over the page until closed.
    for (let i = 0; i < 3; i++) {
      for (const sel of ['.joy-card button:has-text("Nice")', '.levelup', '[role="dialog"] button:has-text("Got it")', '.modal button[aria-label="Close"]']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
      if (await p.locator('.modal-backdrop').count()) await p.keyboard.press('Escape');
      await sleep(600);
    }
    return { ctx, p };
  };

  // 1. Desktop, on the trial, no extension: the card, on Now, not a dialog.
  let { ctx, p } = await open();
  const card = await text(p, '.ext-nudge');
  check(/Halo\+ right on Halo/.test(card) && /Add it to Chrome/.test(card) && /Not now/.test(card), `the card on Now: "${card.slice(0, 120)}"`);
  check((await p.locator('.ext-nudge').evaluate((e) => e.closest('[role="dialog"]'))) === null && (await p.locator('[role="dialog"] .ext-nudge').count()) === 0, 'it is a card in the page, not a pop-up');
  await p.locator('.ext-nudge').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/1-card-on-now.png` });
  const shownToday = await (async () => (await db.from('settings').select('data->extNudge').eq('user_id', who.id).single()).data?.extNudge)();
  // "Not now": gone for the day.
  await p.click('.ext-nudge button:has-text("Not now")');
  await sleep(1500);
  check((await p.locator('.ext-nudge').count()) === 0, 'Not now puts it away');
  await p.reload({ waitUntil: 'load' });
  await sleep(3500);
  check((await p.locator('.ext-nudge').count()) === 0, 'and it stays away for the day');
  await ctx.close();
  console.log(`     shown: ${JSON.stringify(shownToday)}`);

  // 2. Two days later: once more; after that, never.
  await patch({ extNudge: { shown: [phxDay(-2)], closed: [phxDay(-2)] } });
  ({ ctx, p } = await open());
  check((await p.locator('.ext-nudge').count()) === 1, 'two days later it is back, once');
  await ctx.close();
  await patch({ extNudge: { shown: [phxDay(-4), phxDay(-2)], closed: [] } });
  ({ ctx, p } = await open());
  check((await p.locator('.ext-nudge').count()) === 0, 'twice is the limit: a third time never comes');
  await ctx.close();

  // 3. Never on a phone; never once the extension is connected.
  await patch({ extNudge: null });
  ({ ctx, p } = await open({ ...devices['iPhone 14'] }));
  check((await p.locator('.ext-nudge').count()) === 0, 'never on a phone');
  await ctx.close();
  ({ ctx, p } = await open());
  await p.evaluate(() => localStorage.setItem('school-dashboard:ext-version', '0.11.0'));
  await p.reload({ waitUntil: 'load' });
  await sleep(3500);
  check((await p.locator('.ext-nudge').count()) === 0, 'never once the extension is connected');
  await ctx.close();
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  await browser.close().catch(() => undefined);
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
