// The Classes cards before and after the what-if link (George, 2026-10-30: the boxed "What if?" button "looks sloppy
// and crowds the Don't forget chip and the Cooked meter"; tapping the grade opens the what-if, with a quiet "What if?"
// under the percent). Maya Torres (made up) plus the CHM-113-like class, demo mode, a throwaway admin. Desktop and phone.
// With AFTER=1 it also checks: no boxed button, the grade opens the class's what-if, the link is there and gold on hover.
//   KEYS_ENV=... [AFTER=1] node scripts/shots-classes-whatif.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { addChem } from './lib/chemDemo.mjs';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const AFTER = !!process.env.AFTER;
const OUT = 'docs/screens/classes-whatif';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = AFTER ? 'after' : 'before';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const admin = await kit.persona('admin');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
  await p.waitForSelector('[aria-label="Demo mode"]', { timeout: 30000 });
  await p.click('[aria-label="Demo mode"] button:has-text("Load the demo student")');
  await p.waitForSelector('.now-head', { timeout: 30000 });
  await sleep(1500);
  const chm = await addChem(p);
  await p.waitForSelector('.now-head', { timeout: 30000 });
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup button']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await sleep(2000);
  await p.screenshot({ path: `${OUT}/${tag}-desk.png`, fullPage: true });
  await p.locator(`[data-tour="class-CHM-113"]`).screenshot({ path: `${OUT}/${tag}-desk-card.png` });
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ph.addInitScript((ls) => { for (const { name, value } of ls) if (!localStorage.getItem(name)) localStorage.setItem(name, value); }, (await ctx.storageState()).origins.find((o) => BASE.startsWith(o.origin))?.localStorage ?? []);
  await ph.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const q = await ph.newPage();
  await q.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await sleep(2000);
  await q.screenshot({ path: `${OUT}/${tag}-phone.png`, fullPage: true });
  await q.locator(`[data-tour="class-CHM-113"]`).screenshot({ path: `${OUT}/${tag}-phone-card.png` });
  if (AFTER) {
    check((await p.locator('a.wis-open').count()) === 0, 'no boxed "What if?" button on the cards');
    const links = await p.locator('.class-card-whatif').count();
    check(links === (await p.locator('.class-card-grade:not(.class-card-nograde)').count()) && links >= 7, `a quiet "What if?" under every percent (${links})`);
    const style = await p.locator('.class-card-whatif').first().evaluate((e) => ({ color: getComputedStyle(e).color, basis: getComputedStyle(e.parentElement.querySelector('.class-card-basis')).color, size: getComputedStyle(e).fontSize }));
    await p.locator('.class-card-whatif').first().hover();
    await sleep(250);
    const hover = await p.locator('.class-card-whatif').first().evaluate((e) => getComputedStyle(e).color);
    check(style.color === style.basis && hover !== style.color, `gray like the card's text (${style.color}), gold on hover (${hover})`);
    await p.locator('[data-tour="class-CHM-113"] .class-card-whatif').hover();
    await p.screenshot({ path: `${OUT}/after-desk-hover.png`, clip: await p.locator('[data-tour="class-CHM-113"]').boundingBox() });
    await p.locator('[data-tour="class-CHM-113"] .class-card-grade .ring').click();
    await p.waitForSelector('.wis', { timeout: 10000 });
    check(p.url().includes(`c=${chm.id}`) && p.url().includes('tab=whatif'), 'tapping the grade ring opens that class’s what-if');
    await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
    await sleep(1200);
    await p.locator('[data-tour="class-CHM-113"] .class-card-name').click();
    await sleep(600);
    check(p.url().includes(`c=${chm.id}`) && !p.url().includes('tab=whatif'), 'the rest of the card still opens the class');
    // Phone: tapping "What if?" opens it; the tap area is big enough.
    const box = await q.locator('[data-tour="class-CHM-113"] .class-card-grade').boundingBox();
    check(box.height >= 44 && box.width >= 44, `phone: the grade's tap area ${Math.round(box.width)}×${Math.round(box.height)} px`);
    await q.locator('[data-tour="class-CHM-113"] .class-card-whatif').tap();
    await q.waitForSelector('.wis', { timeout: 10000 });
    check(q.url().includes('tab=whatif'), 'phone: tapping "What if?" opens the what-if');
  }
  await ph.close();
  await ctx.close();
} catch (e) {
  check(false, String(e.stack ?? e).slice(0, 300));
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
