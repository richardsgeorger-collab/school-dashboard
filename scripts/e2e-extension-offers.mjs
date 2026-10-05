// The extension is on the Web Store (George, 2026-10-01): the store address is an Admin setting, and with it the
// install offers turn on for desktop Chrome, Edge and Brave only. On the real backend with throwaway accounts:
// Admin shows the address and refuses one that is not the Web Store; Max gets "Enable auto-sync" on You → Halo and an
// the Max welcome (3 screens; the extension has its own setup since 2026-10-04); Plus gets the same Enable auto-sync; an
// installed extension shows "Auto-sync is on"; Safari, Firefox and an iPad get none of it; the landing page links it.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-extension-offers.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const STORE = 'https://chromewebstore.google.com/detail/halo+/dookepepmkkakmepjabldmgfmfhfcmnn';
const OUT = 'docs/screens/extension-offers';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const UA = {
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (who, { ua = UA.chrome, scheme = 'light', device = null, installed = null, route = '#/you?s=halo' } = {}) => {
  const ctx = await browser.newContext(device ? { ...device, colorScheme: scheme } : { viewport: { width: 1280, height: 900 }, userAgent: ua, colorScheme: scheme });
  await ctx.addInitScript(({ ses, key, installed }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses));
    if (installed) localStorage.setItem('school-dashboard:ext-version', installed);
  }, { ses: who.session, key: `sb-${ref}-auth-token`, installed });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}${route}`, { waitUntil: 'load' });
  await p.waitForTimeout(4500);
  return { ctx, p };
};
try {
  // Admin.
  const boss = await kit.persona('admin');
  {
    const { ctx, p } = await open(boss, { route: '#/admin' });
    await p.waitForSelector('.admin-extension', { timeout: 20000 });
    check((await p.inputValue('.admin-extension input')) === STORE, 'Admin: the store address is set');
    await p.locator('.admin-extension').screenshot({ path: `${OUT}/admin-card.png` });
    await ctx.close();
    const { c } = await kit.signIn(boss.email);
    const { error } = await c.rpc('admin_set_setting', { p_key: 'extension_url', p_value: 'https://example.com/not-the-store' });
    const { data: still } = await c.rpc('app_setting', { p_key: 'extension_url' });
    check(!!error && still === STORE, `Admin: an address that is not the Web Store is refused ("${error?.message}")`);
  }
  // Max: Enable auto-sync on You → Halo.
  const max = await kit.persona('max');
  for (const [name, ua] of [['Chrome', UA.chrome], ['Edge', UA.edge]]) {
    const { ctx, p } = await open(max, { ua });
    const card = p.locator('.autosync-card');
    const href = await card.locator('a:has-text("Enable auto-sync")').getAttribute('href').catch(() => null);
    check(href === STORE && new RegExp(`while ${name} is open`).test(await card.innerText()), `Max on ${name}: Enable auto-sync opens the store`);
    if (name === 'Chrome') await card.screenshot({ path: `${OUT}/you-max-enable.png` });
    await ctx.close();
  }
  {
    const { ctx, p } = await open(max, { installed: '0.4.0', scheme: 'dark' });
    const on = await p.locator('.autosync-card').innerText().catch((e) => `no card: ${e.message.slice(0, 60)}`);
    check(/Auto-sync is on\. The Halo\+ extension \(0\.4\.0\) syncs Halo every 3 hours/.test(on.replace(/\s+/g, ' ')), `Max with the extension installed: "${on.replace(/\s+/g, ' ').slice(0, 90)}"`);
    await p.locator('.autosync-card').screenshot({ path: `${OUT}/you-max-on-dark.png` });
    await ctx.close();
  }
  // Plus: auto-sync is Plus too (2026-10-04): the same Enable auto-sync as Max.
  const plus = await kit.persona('plus');
  {
    const { ctx, p } = await open(plus);
    const card = p.locator('.autosync-card');
    const t = await card.innerText();
    check((await card.locator('a:has-text("Enable auto-sync")').getAttribute('href')) === STORE && !/part of Max/.test(t), 'Plus: Enable auto-sync opens the store (no "part of Max")');
    await card.screenshot({ path: `${OUT}/you-plus.png` });
    await ctx.close();
  }
  // Nothing on Safari, Firefox or an iPad.
  for (const [name, opts] of [['Safari', { ua: UA.safari }], ['Firefox', { ua: UA.firefox }], ['iPad', { device: devices['iPad (gen 7)'] }]]) {
    const { ctx, p } = await open(max, opts);
    check((await p.locator('.autosync-card').count()) === 0, `${name}: no extension offer`);
    await ctx.close();
  }
  // The Max welcome is 3 screens everywhere now (2026-10-04): the extension has its own setup, after the welcome.
  for (const [name, ua] of [['Chrome', UA.chrome], ['Safari', UA.safari]]) {
    const fresh = await kit.persona('max');
    const { data: st } = await db.from('settings').select('data').eq('user_id', fresh.id).single();
    const { maxOnboarding: _m, ...rest } = st.data;
    await db.from('settings').update({ data: { ...rest, upgradeSeen: { plus: new Date().toISOString() } } }).eq('user_id', fresh.id);
    const { ctx, p } = await open(fresh, { ua, route: '#/now' });
    await p.waitForSelector('.onboard.upgrade', { timeout: 15000 });
    const count = (await p.locator('.onboard.upgrade .onboard-count').first().innerText()).trim();
    check(count === '1 of 3' && (await p.locator('[aria-label="Add to Chrome"]').count()) === 0, `Max welcome on ${name}: 3 screens, no Add to Chrome step (${count})`);
    await ctx.close();
  }
  // The landing page links it.
  {
    const html = await (await fetch(BASE)).text();
    check(html.includes(`href="${STORE}"`), 'the landing page links the extension');
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
