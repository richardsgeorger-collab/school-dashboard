// The projected semester GPA on Classes (George, 2026-10-24). Two parts:
//   A. The demo student (Maya Torres, made up) on this computer, signed out (so on Free): the GPA from each class's
//      Halo grade (the number the domain code works out, itself checked by hand in src/domain/gpa.test.ts), one calm
//      line folded, a row per class open, UNV-103 with no grade left out with a note, a what-if (marked, the real GPA
//      beside it, Reset, the stored grade untouched), credits edited and kept, the GPA so far hidden until asked for
//      and the projected cumulative GPA. Desktop and phone, light and dark, to docs/screens/gpa/.
//   B. A throwaway Max account (scripts/lib/personas.mjs) on the real backend: an edited credit and the GPA so far
//      reach the account.
//   KEYS_ENV=... [LOCAL_SITE=dist-site] node scripts/e2e-gpa.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = 'docs/screens/gpa';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 480000);
const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/gpa-fixture.ts'], { encoding: 'utf8' }));
const two = (g) => (Math.round(g * 100) / 100).toFixed(2);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const site = async (ctx) => {
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
};
/** The demo student loaded on this computer, signed out. */
async function demo(opts, scheme) {
  const ctx = await browser.newContext({ ...opts, colorScheme: scheme, reducedMotion: 'reduce' });
  await site(ctx);
  await ctx.route('**/supabase.co/**', (r) => r.abort());
  await ctx.addInitScript((d) => {
    if (localStorage.getItem('school-dashboard:demo') === '1') return;
    localStorage.setItem('school-dashboard:v1:demo', JSON.stringify(d.data));
    localStorage.setItem('school-dashboard:pending:demo', '[]');
    localStorage.setItem('school-dashboard:now-snapshot:demo', JSON.stringify(d.snapshot));
    localStorage.setItem('school-dashboard:demo-seed', JSON.stringify(d.announcements));
    localStorage.setItem('school-dashboard:demo', '1');
  }, fx.demo);
  const p = await ctx.newPage();
  await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
  await p.waitForSelector('.gpa', { timeout: 20000 });
  await sleep(1200);
  return { ctx, p };
}
const text = (p, sel) => p.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');

try {
  // ---- A. The demo student ----
  for (const [label, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { ...devices['iPhone 14'] }]]) {
    for (const scheme of ['light', 'dark']) {
      const L = label === 'desktop' && scheme === 'light';
      const { ctx, p } = await demo(opts, scheme);
      const head = await text(p, '.gpa-head');
      const note = await text(p, '.gpa-note');
      if (L) {
        check(head.startsWith(`Semester GPA ${two(fx.expect.gpa)} projected`), `folded, one line: "${head}" (expected ${two(fx.expect.gpa)}: ${fx.expect.credits} credits)`);
        check(/From 5 classes' current grades · 1 with no Halo grade yet, left out\./.test(note), `UNV-103 has no grade yet: left out, said once: "${note}"`);
        check(!(await p.locator('.gpa-body').count()), 'nothing more until it is opened');
      }
      await p.screenshot({ path: `${OUT}/folded-${label}-${scheme}.png` });
      await p.click('.gpa-head');
      await sleep(300);
      const rows = await p.locator('.gpa-row').allInnerTexts();
      if (L) {
        check(rows.length === 6 && rows.some((r) => /BIO-181\s.*91\.0% · A- · 3\.7/.test(r.replace(/\s+/g, ' '))) && rows.some((r) => /UNV-103.*No Halo grade yet/.test(r.replace(/\s+/g, ' '))), `a row per class: ${rows.map((r) => r.replace(/\s+/g, ' ').trim()).join(' | ')}`);
        check(!(await p.locator('.gpa-sofar input').count()) && (await p.locator('.gpa-sofar-open').count()) === 1, 'the GPA so far is hidden until asked for');
        check(/GCU's undergraduate scale \(A 4\.0, A- 3\.7, B\+ 3\.3/.test(await text(p, '.gpa-source')), 'it says which scale');
      }
      await p.screenshot({ path: `${OUT}/open-${label}-${scheme}.png`, fullPage: label === 'desktop' });
      // ---- what-if: BIO-181 ends at 80% ----
      await p.locator('.gpa-row').filter({ hasText: 'BIO-181' }).filter({ hasNotText: 'BIO-181L' }).locator('.gpa-class').click();
      await sleep(200);
      await p.locator('.gpa-try input[type="range"]').fill('80');
      await sleep(300);
      const wHead = await text(p, '.gpa-head');
      const wNote = await text(p, '.gpa-note');
      if (L) {
        check(wHead.toLowerCase().startsWith(`semester gpa ${two(fx.expect.whatIfBio80)} what-if`) && /Real: \d\.\d\d\. Reset what-if/.test(wNote) && /80\.0% · B-/.test(await text(p, '.gpa-try')), `what-if, clearly marked: "${wHead}", "${wNote}"`);
      }
      await p.screenshot({ path: `${OUT}/whatif-${label}-${scheme}.png`, fullPage: label === 'desktop' });
      if (L) {
        const stored = await p.evaluate((id) => JSON.parse(localStorage.getItem('school-dashboard:v1:demo')).courses.find((c) => c.id === id).haloGrade.percent, fx.expect.bioId);
        check(stored === 91, `the stored grade is untouched (${stored}%)`);
        await p.click('.gpa-reset');
        await sleep(200);
        check((await text(p, '.gpa-head')).startsWith(`Semester GPA ${two(fx.expect.gpa)} projected`), 'Reset: back to the real GPA');
        // ---- credits: BIO-181 at 2, kept ----
        await p.locator('input[aria-label="Credits for BIO-181"]').fill('2');
        await sleep(600);
        const cHead = await text(p, '.gpa-head');
        await p.reload({ waitUntil: 'load' });
        await p.waitForSelector('.gpa');
        await sleep(800);
        await p.click('.gpa-head');
        const kept = await p.locator('input[aria-label="Credits for BIO-181"]').inputValue();
        check(cHead.startsWith(`Semester GPA ${two(fx.expect.bioTwoCredits)}`) && kept === '2', `an edited credit changes the GPA and is kept (${cHead.slice(13, 17)}, ${kept} cr after a reload)`);
        // ---- the GPA so far: 3.40 over 30 credits ----
        await p.click('.gpa-sofar-open');
        await p.locator('.gpa-sofar input').nth(0).fill('3.40');
        await p.locator('.gpa-sofar input').nth(1).fill('30');
        await sleep(500);
        const sem = fx.expect.bioTwoCredits;
        const semCredits = fx.expect.credits - 2;
        const want = two((3.4 * 30 + sem * semCredits) / (30 + semCredits));
        const cum = await text(p, '.gpa-cum');
        check(cum === `Cumulative, projected: ${want}`, `the projected cumulative GPA: "${cum}" (by hand ${want})`);
        await p.screenshot({ path: `${OUT}/cumulative-${label}-${scheme}.png`, fullPage: true });
        await p.click('.gpa-head');
        await sleep(200);
        check((await text(p, '.gpa-head')).includes(`cumulative ${want}`), 'folded, it carries the cumulative too');
      }
      await ctx.close();
    }
  }

  // ---- B. A throwaway account: the edits reach the account ----
  const kit = personaKit(env);
  try {
    const who = await kit.persona('max');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await site(ctx);
    await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/#/classes', { waitUntil: 'load' });
    await p.waitForSelector('.gpa', { timeout: 30000 });
    await sleep(1500);
    await p.click('.gpa-head');
    const first = p.locator('.gpa-credits input').first();
    const code = (await first.getAttribute('aria-label')).replace('Credits for ', '');
    await first.fill('5');
    await p.click('.gpa-sofar-open');
    await p.locator('.gpa-sofar input').nth(0).fill('3.25');
    await p.locator('.gpa-sofar input').nth(1).fill('45');
    await sleep(6000);
    const { data: cs } = await kit.db.from('courses').select('data').eq('user_id', who.id);
    const c = cs.map((r) => r.data).find((x) => x.code === code);
    const { data: st } = await kit.db.from('settings').select('data').eq('user_id', who.id).maybeSingle();
    check(c?.credits === 5 && c?.creditsFrom === 'student', `an edited credit reaches the account (${code}: ${c?.credits}, ${c?.creditsFrom})`);
    check(st?.data?.gpaSoFar?.gpa === 3.25 && st.data.gpaSoFar.credits === 45, `the GPA so far reaches the account (${JSON.stringify(st?.data?.gpaSoFar)})`);
    await ctx.close();
  } finally {
    console.log(`removed ${await kit.cleanup()} throwaways`);
  }
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
