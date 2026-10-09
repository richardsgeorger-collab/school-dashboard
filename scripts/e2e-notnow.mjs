// Not now as a quick skip (George, 2026-10-08), on the real backend with a throwaway Max student, desktop and phone:
// one tap and the next thing takes the card at once, the skipped one waits in a row under it; tapping it there brings
// it back; it comes back by itself after something is finished; three skips bench it (the end of Then, no row, no
// words) for the day; something overdue skipped three times still comes back after one finished thing; a reload keeps
// the day's skips; the caret still offers Not today and Can't start yet. Screens to docs/screens/notnow/.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-notnow.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/notnow';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const heroTitle = (p) => text(p, '.hero .hero-title, .hero h2');
const DEV = { desk: { viewport: { width: 1280, height: 860 } }, phone: { ...devices['iPhone 14'] } };
const settle = async (p) => { for (const sel of ['.ext-setup-sheet button.btn:has-text("Skip for now")', '.joy-card button:has-text("Nice")', '.levelup']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined); };
const notNow = async (p) => { await p.locator('.hero .hero-notnow:not(.hero-notnow-more):visible').first().click(); await sleep(1400); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const dev of ['desk', 'phone']) {
    const first = dev === 'desk';
    const s = await kit.persona('max');
    // Nothing due today, so the card is plain work, not an exam: Quiz 2 (today) moves out a week.
    const rows = (await db.from('items').select('id, data').eq('user_id', s.id)).data;
    for (const r of rows.filter((r) => /Quiz 2: Derivatives|Quiz 2: Cellular/.test(r.data.title))) await db.from('items').update({ data: { ...r.data, dueAt: new Date(Date.now() + 9 * 864e5).toISOString() } }).eq('id', r.id);
    const ctx = await browser.newContext({ ...DEV[dev], colorScheme: 'light' });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.hero', { timeout: 30000 });
    await sleep(3000);
    await settle(p);
    const h1 = await heroTitle(p);
    // 1. One tap: the next thing takes the card; the skipped one is in the row.
    await notNow(p);
    const h2 = await heroTitle(p);
    const row = await text(p, '.skipped-row');
    check(h2 !== h1 && !!h2, `${dev}: Not now puts the next thing on the card ("${h1}" → "${h2}")`);
    check(row.startsWith('Skipped') && row.includes(h1.split(':')[0].slice(0, 12)), `${dev}: the Skipped row shows it ("${row}")`);
    check((await p.locator('.notnow-pop').count()) === 0, `${dev}: no menu to go through`);
    await p.screenshot({ path: `${OUT}/1-skipped-${dev}.png` });
    // 2. Tap it in the row: back on the card.
    await p.locator('.skipped-row .skipped-chip').first().click();
    await sleep(800);
    check((await heroTitle(p)) === h1 && (await p.locator('.skipped-row').count()) === 0, `${dev}: a tap in the row brings it back ("${await heroTitle(p)}")`);
    if (first) {
      // 3. Skip, then finish the next thing: the skipped one comes back by itself.
      await notNow(p);
      await p.locator('[data-tour="done"]').click();
      await sleep(2500);
      await settle(p);
      check((await heroTitle(p)) === h1 && (await p.locator('.skipped-row').count()) === 0, `${dev}: after a check-off it is back on the card by itself ("${await heroTitle(p)}")`);
      // 4. Three skips: to the end of Then, out of the row, no words.
      // It was skipped once already today (and came back): two more skips make three.
      for (let k = 0; k < 2; k++) {
        await notNow(p);
        if (await p.locator('.skipped-row .skipped-chip').count()) { await p.locator('.skipped-row .skipped-chip').first().click(); await sleep(800); }
      }
      const thenText = await text(p, '.then');
      check((await heroTitle(p)) !== h1 && (await p.locator('.skipped-row').count()) === 0 && thenText.includes(h1.slice(0, 14)), `${dev}: skipped three times: not on the card, not in the row, at the end of Then`);
      check(!/skip|guilt|again/i.test(thenText), 'no guilt wording in Then');
      await p.screenshot({ path: `${OUT}/2-benched-${dev}.png` });
      // 5. A reload keeps the day's skips.
      await p.reload({ waitUntil: 'load' });
      await p.waitForSelector('.hero', { timeout: 30000 });
      await sleep(2500);
      await settle(p);
      check((await heroTitle(p)) !== h1, `${dev}: still benched after a reload ("${await heroTitle(p)}")`);
      // 6. Overdue and benched: one check-off brings it back regardless.
      const benchedRow = rows.find((r) => r.data.title === h1 || r.data.label === h1);
      await db.from('items').update({ data: { ...benchedRow.data, dueAt: new Date(Date.now() - 3_600_000).toISOString() } }).eq('id', benchedRow.id);
      await p.goto('about:blank');
      await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
      await p.waitForSelector('.hero', { timeout: 30000 });
      await sleep(3000);
      await settle(p);
      const before = await heroTitle(p);
      await p.locator('[data-tour="done"]').click();
      await sleep(2500);
      await settle(p);
      check(before !== h1 && (await heroTitle(p)) === h1, `${dev}: overdue and benched, one finished thing brings it back ("${before}" → "${await heroTitle(p)}")`);
      // 7. The caret keeps the longer choices.
      await p.locator('.hero .hero-notnow-more:visible').first().click();
      await sleep(400);
      const menu = await text(p, '.notnow-pop');
      check(/Not today/.test(menu) && /Can't start yet/.test(menu) && !/something else/.test(menu), `${dev}: the caret: "${menu.slice(0, 80)}"`);
      await p.screenshot({ path: `${OUT}/3-caret-${dev}.png` });
      await p.keyboard.press('Escape');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
