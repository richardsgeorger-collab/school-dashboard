// The simpler what-if (George, 2026-10-29: "hard to find and overwhelming … a first-time student gets it in 5
// seconds"), with the made-up demo student Maya Torres and a CHM-113-like class added on this device (scripts/lib/
// chemDemo.mjs: one exam tomorrow, lots of small items), loaded by a throwaway admin (demo mode never reaches the
// server). BEFORE=1 only takes the "before" pictures (the old what-if) for the comparison.
// Checks: a "What if?" button on every class card in Classes and on the class page header; the top is the grade big
// and one Reset; the next big item first in plain words with a letter to tap; only the items that move the grade, one
// slider each, biggest first; everything small in ONE "Everything else (N items)" slider at their current average,
// expandable; "What do I need?" as one line with a letter picker; More options closed; still exact against Halo.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] [BEFORE=1] node scripts/e2e-whatif-simple.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { addChem } from './lib/chemDemo.mjs';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BEFORE = !!process.env.BEFORE;
const OUT = 'docs/screens/whatif-simple';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const admin = await kit.persona('admin');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
  await p.waitForSelector('[aria-label="Demo mode"]', { timeout: 30000 });
  await p.click('[aria-label="Demo mode"] button:has-text("Load the demo student")');
  await p.waitForSelector('.now-head', { timeout: 30000 });
  await sleep(2000);
  const chm = await addChem(p);
  await p.waitForSelector('.now-head', { timeout: 30000 });
  await sleep(1500);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup button']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  const tag = BEFORE ? 'before' : 'after';

  // The class page's what-if, desktop and phone.
  const shoot = async (page, name) => {
    await page.goto(`${BASE}#/class?c=${chm.id}&tab=whatif`, { waitUntil: 'load' });
    await page.waitForSelector('.wi, .wis', { timeout: 20000 });
    await sleep(700);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
  };
  await shoot(p, 'desk');
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ph.addInitScript((ls) => { for (const { name, value } of ls) if (!localStorage.getItem(name)) localStorage.setItem(name, value); }, (await ctx.storageState()).origins.find((o) => BASE.startsWith(o.origin))?.localStorage ?? []);
  await ph.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const q = await ph.newPage();
  await shoot(q, 'phone');
  if (BEFORE) {
    const cards = await p.locator('.wi-row').count();
    console.log(`before: ${cards} cards of equal size on the what-if`);
  } else {
    // Easy to find: on every class card in Classes, and on the class page header.
    await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
    await sleep(1500);
    const cardsN = await p.locator('.class-card, [data-course-card]').count();
    const btns = await p.locator('a.wis-open, button.wis-open').count();
    check(btns >= 7 && btns >= cardsN, `a "What if?" button on every class card in Classes (${btns} buttons, ${cardsN} cards)`);
    await p.screenshot({ path: `${OUT}/after-classes.png` });
    await p.locator(`a.wis-open[href*="${chm.id}"]`).first().click();
    await p.waitForSelector('.wis', { timeout: 15000 });
    check(/tab=whatif/.test(p.url()), 'it opens the class’s what-if');
    await p.goto(`${BASE}#/class?c=${chm.id}`, { waitUntil: 'load' });
    await sleep(800);
    check((await p.locator('.class-head .wis-open, .page-head .wis-open').count()) === 1, 'a "What if?" button on the class page header');
    await p.goto(`${BASE}#/class?c=${chm.id}&tab=whatif`, { waitUntil: 'load' });
    await p.waitForSelector('.wis', { timeout: 15000 });
    await sleep(500);
    const top = await text(p, '.wis-top');
    check(/^A- 92\.0%/.test(top) && !/What-if/i.test(top) && (await p.locator('.wis-top button').count()) <= 1, `the top: the grade big, nothing else ("${top}")`);
    const next = await text(p, '.wis-next');
    check(/^On Exam 1 \(tomorrow\), you need \d+% for an A, \d+% for an A-, \d+% for a B\+/.test(next), `the next big item first, in plain words: "${next}"`);
    const big = await p.locator('.wis-big .wis-row .wis-name').allInnerTexts();
    check(big.length >= 3 && big.length <= 6 && big[0].startsWith('Exam 1') && !big.some((t) => /Participation|Homework 3|Activity/.test(t)), `only the items that move the grade, biggest first: ${big.join(' | ')}`);
    const rest = await text(p, '.wis-rest .wis-name');
    check(/^Everything else \(18 items\)$/.test(rest), `the small stuff in one slider: "${rest}"`);
    const restVal = await p.locator('.wis-rest > .wis-row input[type=range]').inputValue();
    check(Number(restVal) >= 90 && Number(restVal) <= 96, `set to their current average by default (${restVal}%)`);
    // The line as read: the letter picker counts as the letter picked.
    const need = await p.evaluate(() => { const c = document.querySelector('.wis-need').cloneNode(true); const sel = c.querySelector('select'); if (sel) sel.replaceWith(document.querySelector('.wis-need select').value); return c.textContent.replace(/\s+/g, ' ').trim(); });
    check(/For an? [A-D][+-]?, you need about \d+% on what’s left|is locked in|isn’t reachable/.test(need), `"What do I need?" as one line: "${need}"`);
    check((await p.locator('details.wis-more').getAttribute('open')) === null && (await p.locator('.wis-more input[type=checkbox]').first().isVisible()) === false, 'More options closed by default (weights, %/pts, presets, keep)');
    // Tapping a letter in the plain line tries it.
    await p.locator('.wis-next button', { hasText: /^A$/ }).first().click();
    await sleep(250);
    const after = await text(p, '.wis-top');
    check(/^A 9[3-9]\.\d% What-if/i.test(after) && (await p.locator('.wis-top button:has-text("Reset")').count()) === 1, `tapping "A" tries it: "${after}"`);
    await p.screenshot({ path: `${OUT}/after-desk-tried.png`, fullPage: true });
    // The small stuff slider moves the grade; expandable to each one.
    await p.locator('.wis-top button:has-text("Reset")').click();
    await p.locator('.wis-rest > .wis-row input[type=range]').fill('50');
    await sleep(200);
    check(/What-if/i.test(await text(p, '.wis-top')) && /▼/.test(await text(p, '.wis-top')), `"Everything else" at 50% moves it down: "${await text(p, '.wis-top')}"`);
    await p.locator('.wis-rest summary, .wis-rest button.wis-expand').first().click();
    await sleep(200);
    check((await p.locator('.wis-rest .wis-each .wis-row').count()) === 18, 'expandable to each of the 18');
    await p.locator('.wis-top button:has-text("Reset")').click();
    await sleep(200);
    check(/^A- 92\.0%/.test(await text(p, '.wis-top')), 'Reset: Halo’s grade again');
    // Phone: tried.
    await q.goto(`${BASE}#/class?c=${chm.id}&tab=whatif`, { waitUntil: 'load' });
    await q.waitForSelector('.wis', { timeout: 20000 });
    await q.locator('.wis-next button', { hasText: /^A-$/ }).first().click();
    await sleep(250);
    check(!(await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'phone: no sideways scroll');
    await q.screenshot({ path: `${OUT}/after-phone-tried.png`, fullPage: true });
  }
  await ph.close();
  await ctx.close();
} catch (e) {
  check(false, String(e.stack ?? e).slice(0, 400));
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
