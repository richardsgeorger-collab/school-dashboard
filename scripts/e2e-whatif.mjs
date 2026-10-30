// What-if grades (George, 2026-10-29: "he wants to use it himself before every exam"; Free), with the made-up demo
// student Maya Torres loaded by a throwaway admin (her data never reaches the server). Checks: every class's What-if,
// with no what-ifs, says exactly Halo's grade (letter and percent) and "Matches Halo's gradebook"; typing a score moves
// the grade live (letter, percent, how far), marked What-if; a higher letter pops; a retake on a graded item; "What do
// I need?" for a letter (the average, the big items, Try it; out of reach said kindly with the best possible); reset;
// Keep for next time survives a reload; the GPA chip and sheet show the what-if GPA beside the real one; weights that
// do not reproduce Halo's grade are called an estimate; the phone: big touch targets, no sideways scroll. Screens:
// docs/screens/whatif/, desktop and phone, light and dark.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-whatif.mjs
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/whatif';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const r1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const head = (p) => p.evaluate(() => ({ letter: document.querySelector('.wis-letter')?.textContent?.trim(), pct: document.querySelector('.wis-pct')?.textContent?.trim(), moved: document.querySelector('.wis-moved')?.textContent?.trim() ?? null, tag: !!document.querySelector('.wis-top .gpa-tag'), up: !!document.querySelector('.wis-letter[data-up]'), meta: document.querySelector('.wis-top')?.textContent?.replace(/\s+/g, ' ').trim() }));
const more = async (p) => { if ((await p.locator('details.wis-more[open]').count()) === 0) await p.locator('details.wis-more > summary').click(); };
const toCome = (p) => p.locator('.wis-big .wis-row');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const admin = await kit.persona('admin');
  const itemsBefore = (await kit.db.from('items').select('id', { count: 'exact', head: true }).eq('user_id', admin.id)).count ?? 0;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
  await p.waitForSelector('[aria-label="Demo mode"]', { timeout: 30000 });
  await p.click('[aria-label="Demo mode"] button:has-text("Load the demo student")');
  await p.waitForSelector('.now-head', { timeout: 30000 });
  await sleep(2500);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup button', '.levelup']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  const courses = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1:demo') || '{}').courses ?? []);
  check(courses.length === 6, `Maya's six classes (${courses.map((c) => c.code).join(', ')})`);

  // 1. With no what-ifs: exactly Halo's grade, every class.
  for (const c of courses) {
    await p.goto(`${BASE}#/class?c=${c.id}&tab=whatif`, { waitUntil: 'load' });
    await p.waitForSelector('.wis-top', { timeout: 15000 });
    await sleep(300);
    const h = await head(p);
    check(h.letter === c.haloGrade.letter && h.pct === `${r1(c.haloGrade.percent)}%` && !h.tag && !/Estimate/.test(h.meta), `${c.code}: with no what-ifs, Halo's own ${c.haloGrade.letter} ${r1(c.haloGrade.percent)}% (shows ${h.letter} ${h.pct})`);
  }

  // 2. Typing moves it live. MAT-250 (Calculus, B+ 89.4%).
  const mat = courses.find((c) => c.code === 'MAT-250');
  await p.goto(`${BASE}#/class?c=${mat.id}&tab=whatif`, { waitUntil: 'load' });
  await p.waitForSelector('.wis-top', { timeout: 15000 });
  await p.screenshot({ path: `${OUT}/desk-1-start-light.png`, fullPage: true });
  const first = toCome(p).first();
  const firstName = (await first.locator('.wis-name').innerText()).trim();
  await first.locator('input[type=number]').fill('60');
  await sleep(250);
  let h = await head(p);
  check(h.tag && h.moved && /^▼/.test(h.moved) && /from B\+ 89\.4%/.test(h.moved), `typing 60% on ${firstName}: the grade moves live, What-if, "${h.letter} ${h.pct} ${h.moved}"`);
  const marked = await p.evaluate(() => [...document.querySelectorAll('.wis-row[data-whatif]')].map((r) => r.querySelector('.wis-name')?.textContent));
  check(marked.length === 1 && marked[0] === firstName, `the row is marked as a what-if (${JSON.stringify(marked)})`);

  // 3. A higher letter pops: everything to come at 100%.
  await more(p);
  await p.locator('.wis-opt button:has-text("100%")').click();
  await sleep(120);
  h = await head(p);
  check(h.up && ['A', 'A-'].includes(h.letter), `all at 100%: the letter rises to ${h.letter} and pops`);
  await p.screenshot({ path: `${OUT}/desk-2-whatif-light.png`, fullPage: true });

  // 4. Reset: back to Halo's grade, nothing marked.
  await p.locator('.wis-top button:has-text("Reset")').click();
  await sleep(200);
  h = await head(p);
  check(h.letter === 'B+' && h.pct === '89.4%' && !h.tag, `Reset: back to ${h.letter} ${h.pct}, no What-if`);

  // 5. A retake on a graded item.
  await more(p);
  await p.locator('.wis-retakes > summary').click();
  const retake = p.locator('.wis-retakes .wis-row').first();
  await retake.locator('input[type=range]').fill('100');
  await sleep(200);
  h = await head(p);
  check(h.tag && /^▲/.test(h.moved ?? ''), `a retake at 100% on a graded item raises it: ${h.letter} ${h.pct} ${h.moved}`);
  await p.locator('.wis-top button:has-text("Reset")').click();

  // 6. What do I need?
  await p.locator('.wis-need select').selectOption('A');
  await sleep(200);
  const needA = await p.evaluate(() => { const c = document.querySelector('.wis-need').cloneNode(true); c.querySelector('select')?.replaceWith('A'); return c.textContent.replace(/\s+/g, ' ').trim(); });
  console.log(`     need A: ${needA}`);
  check(/^For an A, you need about \d+% on what’s left\./.test(needA) || /isn’t reachable this term/.test(needA), `"What do I need?" for an A: "${needA}"`);
  if (/^For an A/.test(needA)) {
    await p.locator('.wis-need button:has-text("Try it")').click();
    await sleep(250);
    h = await head(p);
    check(h.letter === 'A' && h.tag, `Try it: the what-if lands on ${h.letter} ${h.pct}`);
    await p.locator('.wis-top button:has-text("Reset")').click();
  }

  // 7. Keep for next time: survives a reload; GPA chip and sheet.
  await toCome(p).first().locator('input[type=number]').fill('100');
  await sleep(150);
  await more(p);
  await p.locator('.wi-keep input').check();
  await sleep(600);
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.wis-top', { timeout: 15000 });
  await sleep(800);
  h = await head(p);
  await more(p);
  check(h.tag && (await p.locator('.wi-keep input').isChecked()), `Keep for next time: still there after a reload (${h.letter} ${h.pct})`);
  await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await sleep(1500);
  const chip = await text(p, '.gpa-chip');
  check(/GPA \d\.\d\d · what-if \d\.\d\d/.test(chip), `the GPA chip shows the what-if beside the real one: "${chip}"`);
  await p.locator('.gpa-chip').click();
  await sleep(500);
  const sheet = await text(p, '.gpa');
  check(/What-if/i.test(sheet) && /Real: \d\.\d\d/.test(sheet), `the GPA sheet: the what-if GPA, marked, and the real one: "${sheet.slice(0, 200)}"`);
  await p.locator('.gpa').screenshot({ path: `${OUT}/desk-4-gpa.png` });
  await p.keyboard.press('Escape');
  await p.goto(`${BASE}#/class?c=${mat.id}&tab=whatif`, { waitUntil: 'load' });
  await p.waitForSelector('.wis-top', { timeout: 15000 });
  await more(p);
  await p.locator('.wi-keep input').uncheck();
  await p.locator('.wis-top button:has-text("Reset")').click();

  // 8. Weights that do not reproduce Halo's grade: an estimate, with why.
  await more(p);
  await p.locator('.wi-weights summary').click();
  await p.locator('.wi-cats input[aria-label$="weight"]').first().fill('70');
  await p.locator('.wi-weights button:has-text("Use these weights")').click();
  await sleep(400);
  h = await head(p);
  check(/Estimate/.test(h.meta) && /Your weights give .*Halo shows 89\.4%/.test(h.meta) && h.pct === '89.4%', `weights that do not match Halo: "${h.meta.slice(0, 120)}", still ${h.pct}`);
  await p.locator('.wi-weights button:has-text("Back to points")').click();
  await sleep(300);
  check(!/Estimate/.test((await head(p)).meta), 'Back to points: exact again');

  // 9. Dark, and the phone.
  await p.emulateMedia({ colorScheme: 'dark' });
  await toCome(p).first().locator('input[type=number]').fill('85');
  await sleep(200);
  await p.screenshot({ path: `${OUT}/desk-5-whatif-dark.png`, fullPage: true });
  await p.locator('.wis-top button:has-text("Reset")').click();
  for (const scheme of ['light', 'dark']) {
    const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: scheme });
    const state = await ctx.storageState();
    await ph.addInitScript((ls) => { for (const { name, value } of ls) if (!localStorage.getItem(name)) localStorage.setItem(name, value); }, state.origins.find((o) => BASE.startsWith(o.origin))?.localStorage ?? []);
    await ph.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const q = await ph.newPage();
    await q.goto(`${BASE}#/class?c=${mat.id}&tab=whatif`, { waitUntil: 'load' });
    await q.waitForSelector('.wis-top', { timeout: 20000 });
    await toCome(q).first().locator('input[type=number]').fill('92');
    await sleep(250);
    const sizes = await q.evaluate(() => [...document.querySelectorAll('.wis input[type=range], .wis-letter-btn, .wis-top .btn, .wis-val input')].filter((e) => e.getClientRects().length).map((e) => [e.className || e.type, Math.round(e.getBoundingClientRect().height)]));
    console.log('     small', JSON.stringify(sizes.filter((x) => x[1] < 36)));
    if (scheme === 'light') {
      check(Math.min(...sizes.map((x) => x[1])) >= 36, `phone: touch targets at least 36 px tall (smallest ${Math.min(...sizes.map((x) => x[1]))})`);
      check(!(await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'phone: no sideways scroll');
    }
    await q.screenshot({ path: `${OUT}/phone-whatif-${scheme}.png`, fullPage: true });
    await q.evaluate(() => window.scrollTo(0, 900));
    await sleep(200);
    const stuck = await q.evaluate(() => document.querySelector('.wis-top').getBoundingClientRect().top);
    if (scheme === 'light') check(stuck >= 0 && stuck < 140, `phone: the grade stays in view while scrolling (top ${Math.round(stuck)} px)`);
    await q.screenshot({ path: `${OUT}/phone-scrolled-${scheme}.png` });
    await ph.close();
  }

  // Nothing of Maya's, and no what-if, reached the server.
  const { count } = await kit.db.from('items').select('id', { count: 'exact', head: true }).eq('user_id', admin.id);
  check((count ?? 0) === itemsBefore, `the admin's account on the server holds nothing of hers (${count} items, ${itemsBefore} before)`);
  await ctx.close();
} catch (e) {
  check(false, String(e.stack ?? e).slice(0, 400));
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
