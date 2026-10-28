// One switch per Halo+-on-Halo feature (extension 0.12.0), under "Show Halo+ on Halo pages", in the extension's popup
// and in Halo+'s You → Display. Popup: the 16 switches show for Plus and Max while "Show Halo+ on Halo pages" is on, not
// on Free and not with it off; turning one off takes that one feature off Halo's pages and leaves the others. Halo+
// (the local build, a throwaway on Max and one on Free): the same switches, only with extension 0.12.0 or later on
// that computer; turning one off reaches the extension through the snapshot. Demo data and throwaways only.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-onhalo-switches.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';
import { BROWSER, checker, openBench, sleep, until } from './lib/onHaloRun.mjs';

const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 900000);
const FEATURES = (() => {
  const c = {};
  c.globalThis = c;
  new Function('globalThis', readFileSync('extension/onhalo/features.js', 'utf8'))(c);
  return c.HaloPlusOnFeatures;
})();
// The words a switch shows on this computer: search's shortcut is ⌘K on a Mac (the test runs where the browser runs).
const shown = (label) => (process.platform === 'darwin' ? label.replace('(Ctrl+K)', '(⌘K)') : label);

// ---- the popup ----
{
  const b = await openBench({ label: 'switches' });
  try {
    await b.seed();
    const id = new URL(b.worker.url()).host;
    const pop = async () => {
      const p = await b.ctx.newPage();
      await p.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' });
      await sleep(800);
      return p;
    };
    let p = await pop();
    check(!(await p.locator('#feats').isHidden()), 'popup: "Choose what shows on Halo" under "Show Halo+ on Halo pages" (Max)');
    await p.locator('#feats summary').click();
    const rows = await p.locator('#featList .feat').allInnerTexts();
    check(rows.length === FEATURES.length && rows.every((r, i) => r.trim() === shown(FEATURES[i][1])), `popup: one switch per feature (${rows.length})`);
    check((await p.locator('#featList input:checked').count()) === FEATURES.length, 'popup: all on to begin with');
    await p.screenshot({ path: 'docs/screens/on-halo/switches-popup.png' });
    await p.locator('#featList .feat', { hasText: 'Search all your classes' }).locator('input').click();
    await sleep(400);
    const off = (await b.read(['haloFeat'])).haloFeat;
    check(off && off.off.length === 1 && off.off[0] === 'search', `popup: turning one off saves just that one (${JSON.stringify(off && off.off)})`);
    await p.close();
    const h = await b.page('https://halo.gcu.edu/');
    await sleep(3000);
    const lines = await h.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].some((x) => x.shadowRoot.querySelector('.nx')));
    check((await h.locator('[data-haloplus="search-bar"]').count()) === 0 && lines, 'Halo: search is gone, "Next" on the class cards stays');
    await h.close();
    await b.store({ tier: 'free' });
    p = await pop();
    check(await p.locator('#feats').isHidden(), 'popup: Free: no switches for features it does not have');
    await p.close();
    await b.store({ tier: 'max', haloUiOn: { on: false, at: new Date(Date.now() + 5000).toISOString() } });
    p = await pop();
    check(await p.locator('#feats').isHidden(), 'popup: "Show Halo+ on Halo pages" off: no switches under it');
    await p.close();
  } catch (e) {
    check(false, `popup: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}

// ---- Halo+ itself (You → Display) ----
{
  const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
  const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
  const kit = personaKit(env);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const open = async (who, extVersion) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(({ ses, key, v }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses));
        if (v) localStorage.setItem('school-dashboard:ext-version', v);
        else localStorage.removeItem('school-dashboard:ext-version');
      }, { ses: who.session, key: `sb-${ref}-auth-token`, v: extVersion });
      await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
      const p = await ctx.newPage();
      await p.goto(`${BASE}#/you?s=display`, { waitUntil: 'load' });
      await sleep(5000);
      for (const sel of ['.trial-end-choices button:has-text("Stay on Free")', '.joy-card button:has-text("Nice")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
      await sleep(800);
      return { ctx, p };
    };
    const max = await kit.persona('max');
    // 0.12.0 on this computer: every switch but the ones its extension does not have (the compact header, 0.12.2).
    let { ctx, p } = await open(max, '0.12.0');
    await until(async () => (await p.locator('.on-halo-switches').count()) === 1, 10000, 300);
    const old = await p.locator('.on-halo-switches .field-check span').allInnerTexts();
    check(old.length === FEATURES.length - 1 && !old.some((l) => /Compact Student Home header/.test(l)), `Halo+: with extension 0.12.0, no switch for what it does not have (${old.length})`);
    await ctx.close();
    ({ ctx, p } = await open(max, '0.12.2'));
    await until(async () => (await p.locator('.on-halo-switches').count()) === 1, 10000, 300);
    const labels = await p.locator('.on-halo-switches .field-check span').allInnerTexts();
    check(labels.length === FEATURES.length && labels.every((l, i) => l.trim() === shown(FEATURES[i][1])), `Halo+: You → Display: the same ${labels.length} switches under "Show Halo+ on Halo pages"`);
    await p.locator('.on-halo-switches').screenshot({ path: 'docs/screens/on-halo/switches-app.png' });
    await p.locator('.on-halo-switches .field-check', { hasText: 'Next item on each class card' }).locator('input').click();
    await sleep(1500);
    const snap = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:halo-snap') || 'null'));
    check(snap && snap.hf && snap.hf.off.includes('next') && snap.hf.at, `Halo+: turning one off reaches the extension (snapshot: ${JSON.stringify(snap && snap.hf)})`);
    await ctx.close();
    ({ ctx, p } = await open(max, '0.11.1'));
    check((await p.locator('.on-halo-switches').count()) === 0, 'Halo+: with extension 0.11.1 on this computer: no switches (nothing they would do)');
    await ctx.close();
    const free = await kit.persona('ended');
    ({ ctx, p } = await open(free, '0.12.0'));
    check((await p.locator('.on-halo-switches').count()) === 0, 'Halo+: Free: no switches');
    await ctx.close();
  } catch (e) {
    check(false, `app: ${e.stack || e.message}`);
  } finally {
    await browser.close();
    console.log(`removed ${await kit.cleanup()} throwaways`);
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
