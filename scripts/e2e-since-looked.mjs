// "Since you last looked" on Now and the calmer top bar (George, 2026-10-05), on the real backend with throwaway
// accounts. A first visit says nothing; then the account gets a new Halo assignment, a moved due date and a new grade
// (as a sync would bring), and the next visit says so in one line that opens into the list; a visit with nothing new
// says nothing. The top bar has no theme button (it is in You → Display) and no "Turn on auto-sync" once the extension
// is there. Screens of Now and the top bar, desktop, phone and iPad, light and dark, to docs/screens/since-looked/.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-since-looked.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/since-looked';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const DEV = {
  desk: { viewport: { width: 1280, height: 860 } },
  phone: { ...devices['iPhone 14'] },
  ipad: { ...devices['iPad Pro 11'], viewport: { width: 834, height: 1194 } },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const itemsOf = async (id) => (await db.from('items').select('id, data').eq('user_id', id)).data;
const via = async (id, how) => { const d = (await db.from('settings').select('data').eq('user_id', id).single()).data.data; await db.from('settings').update({ data: { ...d, lastPull: { ...(d.lastPull ?? {}), via: how }, updatedAt: new Date().toISOString() } }).eq('user_id', id); };
const put = (row, patch) => db.from('items').update({ data: { ...row.data, ...patch, updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', row.id);

try {
  for (const [dev, scheme] of [['desk', 'light'], ['desk', 'dark'], ['phone', 'light'], ['phone', 'dark'], ['ipad', 'light'], ['ipad', 'dark']]) {
    const s = await kit.persona('max');
    const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    // A first visit: nothing to compare with. Leaving Now keeps the picture.
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.now', { timeout: 30000 });
    await p.waitForTimeout(5000);
    if (dev === 'desk' && scheme === 'light') check((await p.locator('.since-looked').count()) === 0, 'a first visit: no "since you last looked"');
    await p.goto(`${BASE}#/calendar`, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    // What a sync brings while away: a new assignment, a moved date, a grade.
    const rows = await itemsOf(s.id);
    const open = rows.filter((r) => r.data.source === 'halo' && r.data.status !== 'done' && r.data.score === null);
    const graded = rows.find((r) => r.data.source === 'halo' && r.data.status === 'done' && r.data.score === null && r.data.points > 0) ?? open[2];
    await put(open[0], { dueAt: new Date(Date.parse(open[0].data.dueAt) + 3 * 864e5).toISOString() });
    await put(graded, { score: Math.round(graded.data.points * 0.94), scoreSource: 'halo' });
    const fresh = { ...open[1].data, id: crypto.randomUUID(), haloId: `new-${Date.now()}`, title: 'Topic 6 Homework', label: 'Topic 6 Homework', dueAt: new Date(Date.now() + 9 * 864e5).toISOString() };
    await db.from('items').insert({ id: fresh.id, user_id: s.id, data: fresh, updated_at: new Date().toISOString() });
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.since-looked', { timeout: 30000 }).catch(() => undefined);
    await p.waitForTimeout(1500);
    for (const sel of ['.levelup', '.joy-card button:has-text("Nice")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
    const line = (await p.locator('.since-looked-line').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (dev === 'desk' && scheme === 'light') check(/Since you last looked: 1 new assignment, 1 due date moved, 1 new grade/.test(line), `the next visit: "${line.replace(/[▾▴]/g, '').trim()}"`);
    await p.screenshot({ path: `${OUT}/now-${dev}-${scheme}.png` });
    await p.click('.since-looked-line').catch(() => undefined);
    await p.waitForTimeout(400);
    const list = await p.locator('.since-looked-list').innerText().catch(() => '');
    if (dev === 'desk' && scheme === 'light') check(/New\s*Topic 6 Homework/i.test(list) && /Moved/i.test(list) && /Graded/i.test(list), 'a tap opens the list: new, moved, graded');
    await p.screenshot({ path: `${OUT}/now-open-${dev}-${scheme}.png` });
    // The top bar.
    const bar = p.locator('.topbar');
    const theme = await p.locator('.topbar [aria-label^="Switch to"]').count();
    if (scheme === 'light') check(theme === 0, `${dev}: no theme button in the top bar (it is in You → Display)`);
    await bar.screenshot({ path: `${OUT}/topbar-${dev}-${scheme}.png` });
    // Nothing new since: nothing said.
    await p.goto(`${BASE}#/calendar`, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.now', { timeout: 30000 });
    await p.waitForTimeout(4000);
    if (dev === 'desk' && scheme === 'light') check((await p.locator('.since-looked').count()) === 0, 'the visit after, with nothing new: nothing said');
    // The extension connected: no "Turn on auto-sync" chip.
    if (dev === 'desk' && scheme === 'light') {
      await via(s.id, 'extension');
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(4000);
      check((await p.locator('.autosync-chip').count()) === 0, 'the extension connected: no "Turn on auto-sync" in the top bar');
      await bar.screenshot({ path: `${OUT}/topbar-connected-desk-light.png` });
      await p.goto(`${BASE}#/you?s=display`, { waitUntil: 'load' });
      await p.waitForTimeout(2500);
      check((await p.locator('.theme-field').count()) === 1, 'light and dark are in You → Display');
    }
    await ctx.close();
  }
  // The busiest bar: the free week, no extension yet. Then with the extension.
  for (const [dev, scheme] of [['desk', 'light'], ['desk', 'dark'], ['phone', 'light'], ['phone', 'dark']]) {
    const s = await kit.persona('synced');
    await via(s.id, 'bookmark');
    const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.now', { timeout: 30000 });
    await p.waitForTimeout(4000);
    for (const sel of ['.ext-setup-sheet button.btn:has-text("Skip for now")', '.ext-setup-sheet button:has-text("Not now")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
    const bar = p.locator('.topbar');
    const txt = (await bar.innerText()).replace(/\s+/g, ' ');
    if (scheme === 'light') check(/Max · \d+ days?/.test(txt) && !(await p.locator('.topbar [aria-label^="Switch to"]').count()), `${dev}, free week: trial chip kept, no theme button ("${txt.trim()}")`);
    await bar.screenshot({ path: `${OUT}/topbar-trial-${dev}-${scheme}.png` });
    await p.screenshot({ path: `${OUT}/now-trial-${dev}-${scheme}.png` });
    // What the extension does when it arrives: its script writes its version on the page, and its sync says "via extension".
    await via(s.id, 'extension');
    await p.evaluate(() => localStorage.setItem('school-dashboard:ext-version', '0.5.2'));
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.now', { timeout: 30000 });
    await p.waitForTimeout(4000);
    await p.keyboard.press('Escape');
    const after = (await bar.innerText()).replace(/\s+/g, ' ');
    if (scheme === 'light') check(!/Turn on auto-sync/.test(after) && /Max · \d+ days?/.test(after), `${dev}, extension connected: "${after.trim()}"`);
    await bar.screenshot({ path: `${OUT}/topbar-trial-connected-${dev}-${scheme}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
