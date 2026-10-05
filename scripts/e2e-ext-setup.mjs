// The Chrome extension setup (George, 2026-10-04), on the real backend with throwaway accounts, desktop Chrome unless
// said. Screens of every step and of the existing-user sheet in light and dark to docs/screens/ext-setup/.
//   1. Someone already here (Plus) opens Halo+: the sheet, once. Why → Install (Add to Chrome to the store address
//      from Admin, the Add-to-Chrome animation) → Pin it (the puzzle-piece animation) → Log into Halo → Connect: the
//      extension appearing on the page shows the check and "First sync running", and the page asks it for the sync.
//   2. Skip for now: a "Get the extension" line on Now, gone 7 days later; never the sheet again.
//   3. Already connected (its version on the page, or a sync via extension): no sheet.
//   4. Free: the why with "Syncing … is part of Plus" and See plans, no pressure.
//   5. Safari on a computer: "Auto-sync needs Chrome", the bookmark still works. An iPhone: nothing.
//   6. Someone new on the Max trial: the Max welcome is 3 screens (no Add to Chrome step any more), then the setup.
//   7. Nothing seen after a minute: "Not seeing it? Reload this page".
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-ext-setup.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const STORE = 'https://chromewebstore.google.com/detail/halo+/dookepepmkkakmepjabldmgfmfhfcmnn';
const OUT = 'docs/screens/ext-setup';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const UA = { safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const settingsOf = async (id) => (await db.from('settings').select('data').eq('user_id', id).single()).data.data;
const patch = async (id, p) => { const s = await settingsOf(id); await db.from('settings').update({ data: { ...s, ...p, updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('user_id', id); };
const open = async (who, { scheme = 'light', ua, device, route = '#/now', init } = {}) => {
  const ctx = await browser.newContext(device ? { ...device, colorScheme: scheme } : { viewport: { width: 1280, height: 860 }, colorScheme: scheme, ...(ua ? { userAgent: ua } : {}) });
  await ctx.addInitScript(({ ses, key, init }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses));
    if (init) for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
    window.__msgs = [];
    window.addEventListener('message', (e) => e.data && e.data.kind && window.__msgs.push(e.data.kind));
  }, { ses: who.session, key: `sb-${ref}-auth-token`, init });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}${route}`, { waitUntil: 'load' });
  await p.waitForTimeout(6000);
  return { ctx, p };
};
const sheet = (p) => p.locator('.ext-setup-sheet');
// The seeded throwaways synced "via extension"; someone who has not set it up synced with the bookmark.
const person = async (kind) => {
  const who = await kit.persona(kind);
  const s = await settingsOf(who.id);
  if (s.lastPull) await patch(who.id, { lastPull: { ...s.lastPull, via: 'bookmark' } });
  return who;
};
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });

try {
  // 1. Someone already here, on Plus: the five steps, light and dark.
  for (const scheme of ['light', 'dark']) {
    const plus = await person('plus');
    const { ctx, p } = await open(plus, { scheme });
    const shown = (await sheet(p).count()) > 0;
    if (scheme === 'light') check(shown && /Halo\+ syncs on its own every 3 hours\. No clicking\./.test(await sheet(p).innerText()), 'Plus, already here: the sheet on the next open, with the one-line why');
    await shot(p, `1-why-${scheme}`);
    await p.click('.ext-setup-sheet button:has-text("Set it up")');
    await p.waitForTimeout(1700);
    const href = await p.locator('.ext-setup-sheet a:has-text("Add to Chrome")').getAttribute('href');
    if (scheme === 'light') check(href === STORE && (await p.locator('.ext-demo-install .ext-dialog').count()) === 1, `Install: Add to Chrome goes to the store address from Admin (${href}), with the animation`);
    await shot(p, `2-install-${scheme}`);
    await p.click('.ext-setup-sheet button:has-text("I\'ve added it")');
    await p.waitForTimeout(2600);
    if (scheme === 'light') check((await p.locator('.ext-demo-pin .ext-puzzle').count()) === 1 && /Sync now/.test(await sheet(p).innerText()), 'Pin it: the puzzle-piece animation, and Sync now is mentioned');
    await shot(p, `3-pin-${scheme}`);
    await p.click('.ext-setup-sheet button:has-text("Next")');
    await p.waitForTimeout(500);
    const halo = await sheet(p).innerText();
    if (scheme === 'light') check(/quiet background tab/.test(halo) && /Auto-sync paused: log in to Halo/.test(halo) && /😇 Sync Halo bookmark still works as a backup/.test(halo), 'Log into Halo: the background tab, the paused note, and the bookmark as a backup');
    await shot(p, `4-halo-${scheme}`);
    await p.click('.ext-setup-sheet button:has-text("I\'m logged in")');
    await p.waitForTimeout(800);
    await shot(p, `5-waiting-${scheme}`);
    // The extension shows up on this page (its Halo+ script writes its version).
    await p.evaluate(() => localStorage.setItem('school-dashboard:ext-version', '0.5.2'));
    await p.waitForSelector('.ext-check', { timeout: 5000 }).catch(() => undefined);
    await p.waitForTimeout(600);
    const done = await sheet(p).innerText();
    const asked = await p.evaluate(() => window.__msgs.includes('halo-ext-first-sync'));
    if (scheme === 'light') check((await p.locator('.ext-check').count()) === 1 && /First sync running\./.test(done) && asked, 'Connect: the check, "First sync running", and the page asks the extension for the first sync');
    await shot(p, `6-done-${scheme}`);
    await p.click('.ext-setup-sheet button:has-text("Done")');
    await p.waitForTimeout(1500);
    const st = (await settingsOf(plus.id)).extSetup ?? {};
    if (scheme === 'light') check(!!st.doneAt && (await sheet(p).count()) === 0, 'Done closes it and records it');
    await ctx.close();
    if (scheme === 'light') {
      const again = await open(plus, { scheme });
      check((await sheet(again.p).count()) === 0, 'never shown twice');
      await again.ctx.close();
    }
  }

  // 2. Skip for now: the line on Now for 7 days, then not.
  {
    const plus = await person('plus');
    for (const scheme of ['light', 'dark']) {
      if (scheme === 'dark') await patch(plus.id, { extSetup: { shownAt: new Date().toISOString(), skippedAt: new Date().toISOString() } });
      const { ctx, p } = await open(plus, { scheme });
      if (scheme === 'light') {
        await p.click('.ext-setup-sheet .onboard-head button:has-text("Skip for now")');
        await p.waitForTimeout(1500);
      }
      // A Sunday review held back while the setup was up opens now; closed as a student would.
      for (let k = 0; k < 2; k++) if (await p.locator('.modal [aria-label="Close"], .modal button:has-text("Close")').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); }
      const line = await p.locator('.ext-nudge').innerText().catch(() => '');
      if (scheme === 'light') check(/Get the extension and Halo syncs on its own every 3 hours\./.test(line.replace(/\s+/g, ' ')) && (await sheet(p).count()) === 0, `Skip for now: "${line.replace(/\s+/g, ' ')}" on Now`);
      await p.locator('.ext-nudge').scrollIntoViewIfNeeded().catch(() => undefined);
      await shot(p, `7-now-line-${scheme}`);
      if (scheme === 'light') {
        await p.click('.ext-nudge a');
        await p.waitForTimeout(800);
        check((await sheet(p).count()) === 1, 'the line opens the setup again');
      }
      await ctx.close();
    }
    await patch(plus.id, { extSetup: { shownAt: new Date(Date.now() - 8 * 864e5).toISOString(), skippedAt: new Date(Date.now() - 8 * 864e5).toISOString() } });
    const later = await open(plus);
    check((await later.p.locator('.ext-nudge').count()) === 0 && (await sheet(later.p).count()) === 0, '8 days later: no line, no sheet');
    await later.ctx.close();
  }

  // 3. Already connected: no sheet.
  {
    const max = await person('max');
    const a = await open(max, { init: { 'school-dashboard:ext-version': '0.4.0' } });
    check((await sheet(a.p).count()) === 0, 'the extension on this computer: no sheet');
    await a.ctx.close();
    const max2 = await kit.persona('max');
    const s = await settingsOf(max2.id);
    await patch(max2.id, { lastPull: { ...(s.lastPull ?? {}), at: new Date().toISOString(), via: 'extension' } });
    const b = await open(max2);
    check((await sheet(b.p).count()) === 0, 'a sync that came via the extension: no sheet');
    await b.ctx.close();
  }

  // 4. Free: the why, a plain note, See plans.
  for (const scheme of ['light', 'dark']) {
    const free = await person('ended');
    await patch(free.id, { trialEndSeen: new Date().toISOString() });
    const { ctx, p } = await open(free, { scheme });
    const t = await sheet(p).innerText().catch(() => '');
    if (scheme === 'light') check(/Syncing Halo, on its own or by hand, is part of Plus\./.test(t) && (await p.locator('.ext-setup-sheet a:has-text("See plans")').getAttribute('href')) === '#/you?s=plan&to=plus' && !/Set it up/.test(t), 'Free: the why, "part of Plus", See plans, no install');
    await shot(p, `8-free-${scheme}`);
    await ctx.close();
  }

  // 5. Safari on a computer, and an iPhone.
  for (const scheme of ['light', 'dark']) {
    const plus = await person('plus');
    const { ctx, p } = await open(plus, { scheme, ua: UA.safari });
    const t = await sheet(p).innerText().catch(() => '');
    if (scheme === 'light') check(/Auto-sync needs Chrome\./.test(t) && /😇 Sync Halo bookmark keeps working/.test(t), 'Safari on a computer: it needs Chrome, the bookmark keeps working');
    await shot(p, `9-safari-${scheme}`);
    await ctx.close();
  }
  {
    const plus = await person('plus');
    const { ctx, p } = await open(plus, { device: devices['iPhone 14'] });
    check((await sheet(p).count()) === 0, 'an iPhone: nothing');
    await ctx.close();
  }

  // 6. Someone new on the Max trial: the Max welcome (3 screens, no Add to Chrome), then the setup.
  {
    const fresh = await person('max');
    const s = await settingsOf(fresh.id);
    const { maxOnboarding: _m, ...rest } = s;
    await db.from('settings').update({ data: { ...rest, upgradeSeen: { plus: new Date().toISOString() }, extSetup: undefined, updatedAt: new Date().toISOString() } }).eq('user_id', fresh.id);
    const { ctx, p } = await open(fresh);
    await p.waitForSelector('.onboard.upgrade:not(.ext-setup-sheet)', { timeout: 15000 }).catch(() => undefined);
    const count = (await p.locator('.onboard.upgrade .onboard-count').first().innerText().catch(() => '')).trim();
    check(count === '1 of 3', `the Max welcome is ${count} (no Add to Chrome step)`);
    await p.click('.onboard.upgrade .onboard-head button:has-text("Skip")');
    await p.waitForTimeout(2500);
    check((await sheet(p).count()) === 1, 'after the welcome: the extension setup');
    await ctx.close();
  }

  // 7. Nothing after a minute.
  {
    const plus = await person('plus');
    const { ctx, p } = await open(plus);
    await p.click('.ext-setup-sheet button:has-text("Set it up")');
    for (const b of ["I've added it", 'Next', "I'm logged in"]) { await p.click(`.ext-setup-sheet button:has-text("${b}")`); await p.waitForTimeout(400); }
    await p.waitForSelector('.ext-late', { timeout: 75000 }).catch(() => undefined);
    const t = await p.locator('.ext-late').innerText().catch(() => '');
    check(/Not seeing it\?/.test(t) && /Reload this page/.test(t) && /Sync help/.test(t), 'after a minute: "Not seeing it? Reload this page" and help');
    await shot(p, '5b-not-seeing-it-light');
    await ctx.close();
  }
  // 8. The top-bar chip (2026-10-05): "Turn on auto-sync" beside the streak until it is connected, a pop-up once a day.
  for (const scheme of ['light', 'dark']) {
    const plus = await person('plus');
    await patch(plus.id, { extSetup: { shownAt: new Date().toISOString(), skippedAt: new Date(Date.now() - 9 * 864e5).toISOString() } });
    const { ctx, p } = await open(plus, { scheme });
    const chip = p.locator('.topbar .autosync-chip');
    const order = await p.evaluate(() => { const c = document.querySelector('.topbar .autosync-chip-wrap'); return c?.nextElementSibling?.className ?? null; });
    if (scheme === 'light') check((await chip.count()) === 1 && /Turn on auto-sync/.test(await chip.innerText()) && (await p.locator('.autosync-callout').count()) === 1, `the chip is in the top bar beside the streak (next: ${order}), with its pop-up`);
    await shot(p, `10-chip-popup-${scheme}`);
    if (scheme === 'light') {
      await p.click('.autosync-callout button:has-text("Turn it on")');
      await p.waitForTimeout(800);
      check((await sheet(p).count()) === 1, 'Turn it on opens the setup');
      await p.click('.ext-setup-sheet .onboard-head button:has-text("Skip for now")');
      await p.waitForTimeout(800);
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(5000);
      check((await chip.count()) === 1 && (await p.locator('.autosync-callout').count()) === 0, 'still in the top bar; the pop-up once a day');
      await p.evaluate(() => localStorage.setItem('school-dashboard:ext-version', '0.5.2'));
      await p.waitForTimeout(3500);
      check((await chip.count()) === 0, 'the extension shows up: the chip goes by itself');
    }
    await ctx.close();
  }
  {
    const max = await kit.persona('max');
    const a = await open(max);
    check((await a.p.locator('.autosync-chip').count()) === 0, 'connected (a sync via the extension): no chip');
    await a.ctx.close();
    const plus = await person('plus');
    const b = await open(plus, { device: devices['iPhone 14'] });
    check((await b.p.locator('.autosync-chip').count()) === 0, 'an iPhone: no chip');
    await b.ctx.close();
    const c = await open(plus, { ua: UA.safari });
    check((await c.p.locator('.autosync-chip').count()) === 0, 'Safari: no chip');
    await c.ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
