// The class grade on Halo's Student Home (extension 0.11.1, George 2026-10-26): "Halo+ · B 86.0% ↻ · 1 this week" on
// each course card, Halo's own letter and percent, a refresh that reads that one class's grade from Halo (no sync, no
// Halo tab, no reload), "as of <time>" when Halo does not answer, the fresh grade sent to the account, and nothing
// twice when Better Halo already shows the grade. On the Halo stand-in (saved Halo page copies, scripts/lib/haloStandIn.mjs)
// with the demo student's snapshot (Maya Torres, made up) and a fake Halo gateway; in Chrome and Edge, with Better Halo
// (its Web Store build, unpacked: BH_DIR) and without, light and dark.
// Better Halo cannot sign in to a fake Halo, so its own card grade is put on the card exactly as its code does
// (a span.better-halo-grade-indicator in the card's header row), at load and later.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] [EXT_DIR=extension] node scripts/e2e-halo-grades.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { haloPage, launch, sleep, until } from './lib/haloStandIn.mjs';

const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const BH = process.env.BH_DIR ? resolve(process.env.BH_DIR) : null;
const BROWSER = process.env.BROWSER ?? 'chrome';
const OUT = 'docs/screens/halo-grades';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${BROWSER}: ${line}`); };
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 1500000);
const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/halo-snap-fixture.ts'], { encoding: 'utf8' }));
const NOW = Date.now();
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();
// Halo's gradebook for each class: points of 500, and Halo's own letter.
const BOOK = Object.fromEntries(fx.snap.classes.map((c, k) => [c.slug, { pts: [431, 452, 389, 470, 401, 415][k % 6], letter: ['B', 'A-', 'C+', 'A', 'B-', 'B'][k % 6] }]));
const pct = (slug) => ((BOOK[slug].pts / 500) * 100).toFixed(1);

const bhPath = BH && existsSync(join(BH, 'manifest.json')) ? BH : null;
if (!bhPath) console.log('note: no Better Halo (BH_DIR): running without it only');

for (const withBh of bhPath ? [false, true] : [false]) {
  const tag = withBh ? 'bh' : 'plain';
  const { browser, ctx, proc, load } = await launch(BROWSER, `grades-${tag}`);
  const calls = [];
  const grades = [];
  let failNext = false;
  try {
    await ctx.route('https://halo.gcu.edu/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith('/api/auth/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) });
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'text/html', body: haloPage(fx, u.href) });
    });
    await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
      const r = route.request();
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
      const b = r.postDataJSON?.() ?? {};
      if (b.operationName !== 'GradeOverview') return route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"errors":[{"message":"unauthenticated"}]}' });
      const slug = b.variables?.courseClassSlugId;
      calls.push({ slug, at: Date.now(), auth: r.headers().authorization, ctx: r.headers().contexttoken });
      if (failNext) return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"errors":[{"message":"busy"}]}' });
      await sleep(300);
      const g = BOOK[slug];
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: { gradeOverview: g ? [{ finalGrade: { id: 'f', finalPoints: g.pts, gradeValue: g.letter, isPublished: true, maxPoints: 500 } }] : [] } }) });
    });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
    await ctx.route('**/functions/v1/sync-drop', async (r) => {
      const b = r.request().postDataJSON?.() ?? null;
      if (b && b.grade) grades.push(b.grade);
      const ok = (body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (b && b.done === true) return ok({ ok: true, at: new Date().toISOString(), done: [] });
      return ok({ ok: true });
    });
    const { worker } = await load(EXT);
    const store = (o) => worker.evaluate((x) => chrome.storage.local.set(x), o);
    if (withBh) await load(bhPath);
    // The snapshot as Halo+ wrote it at the last sync, three hours ago: Halo's letters, a grade from then.
    const snap = JSON.parse(JSON.stringify(fx.snap));
    snap.syncedAt = iso(-3);
    for (const c of snap.classes) Object.assign(c, { g: 80, gl: 'B-', ga: iso(-3) });
    await store({ tier: 'free', lastSyncAt: iso(-3), syncKey: 'a'.repeat(48), haloSnap: snap, haloLive: null, haloDone: null, haloMarks: null, haloWeekOpen: null, haloUi: null, haloUiOn: null, haloBase: null, haloGrades: null });
    await sleep(1200);
    for (const pg of ctx.pages()) if (pg.url().startsWith('https://haloplus.app')) await pg.close().catch(() => undefined);

    for (const scheme of ['light', 'dark']) {
      const L = scheme === 'light';
      await store({ haloGrades: null });
      calls.length = 0;
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 1366, height: 900 });
      await p.emulateMedia({ colorScheme: scheme });
      await p.goto('https://halo.gcu.edu/?nobh', { waitUntil: 'load' });
      const lineOf = (k) => p.evaluate((i) => {
        const h = document.querySelectorAll('[data-haloplus="class"]')[i];
        const l = h?.shadowRoot?.querySelector('.l');
        if (!l) return null;
        return { text: l.textContent.replace(/\s+/g, ' ').trim(), fits: l.scrollWidth <= l.clientWidth + 1, spin: !!l.querySelector('.hp-r[data-spin]'), btn: !!l.querySelector('.hp-r'), slug: h.dataset.slug, color: getComputedStyle(l).color, gradeColor: l.querySelector('[data-tone="grade"]') ? getComputedStyle(l.querySelector('[data-tone="grade"]')).color : null };
      }, k);
      const lines = () => p.evaluate(() => document.querySelectorAll('[data-haloplus="class"]').length);
      await until(async () => (await lines()) > 0, 10000, 200);
      const n = await lines();
      // Opening Student Home: each class on a card read once, one at a time, then the new grades on the lines.
      await until(async () => calls.length >= n && !(await lineOf(0))?.spin, 15000, 200);
      await sleep(800);
      const first = await lineOf(0);
      const want = `${BOOK[first.slug].letter} ${pct(first.slug)}%`;
      if (L) {
        check(calls.length === n && new Set(calls.map((c) => c.slug)).size === n && calls.every((c) => c.auth === 'Bearer A' && c.ctx === 'Bearer C'), `${tag}: opening Student Home reads each card's class once with the page's own Halo session (${calls.length} calls, ${n} cards)`);
        const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
        check(gaps.every((g) => g >= 250), `${tag}: one at a time, never a burst (gaps ${gaps.map((g) => Math.round(g)).join('/')} ms)`);
        check(first.text.startsWith(`Halo+ · ${want}`) && first.btn, `${tag}: Halo's own letter and percent first on the line ("${first.text}")`);
        check(first.gradeColor === first.color || !!first.gradeColor, `${tag}: the grade wears the line's own color (blends in)`);
        check(grades.length >= n && grades.every((g) => typeof g.points === 'number' && g.maxPoints === 500 && g.slug), `${tag}: the fresh grades go to the account (${grades.length} sent), no sync`);
      }
      let allFit = true;
      for (let k = 0; k < n; k++) allFit = allFit && !!(await lineOf(k))?.fits;
      check(allFit, `${tag} ${scheme}: every line fits its card, nothing cut off`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-${scheme}-home.png` });

      // Reloading the page: the grades are fresh, so Halo is not asked again.
      const before = calls.length;
      await p.reload({ waitUntil: 'load' });
      await until(async () => (await lines()) > 0, 10000, 200);
      await sleep(2500);
      if (L) check(calls.length === before, `${tag}: reloading Student Home asks Halo nothing more (${calls.length - before} calls)`);

      // The refresh: a spinner, then Halo's new grade.
      if (L) {
        BOOK[first.slug] = { pts: BOOK[first.slug].pts + 12, letter: 'A-' };
        const sent = grades.length;
        const host = p.locator('[data-haloplus="class"]').first();
        await host.locator('.hp-r').click();
        const spun = await until(async () => (await lineOf(0))?.spin, 2000, 50);
        await until(async () => !(await lineOf(0))?.spin, 6000, 100);
        const after = await lineOf(0);
        check(!!spun && after.text.startsWith(`Halo+ · A- ${pct(first.slug)}%`) && p.url().startsWith('https://halo.gcu.edu'), `${tag}: the refresh spins, then shows Halo's new grade, on the same page ("${after.text}")`);
        check(grades.length === sent + 1 && grades.at(-1).slug === first.slug, `${tag}: the refreshed grade goes to the account`);
        check(ctx.pages().filter((x) => x.url().startsWith('https://halo.gcu.edu')).length === 1, `${tag}: no Halo tab of its own`);
        await host.screenshot({ path: `${OUT}/${BROWSER}-${tag}-line-after-refresh.png` });
        // Halo not answering: the grade stays, "as of" the last time it was true, nothing red.
        failNext = true;
        await host.locator('.hp-r').click();
        await until(async () => /as of/.test((await lineOf(0))?.text ?? ''), 8000, 100);
        const failed = await lineOf(0);
        failNext = false;
        check(failed.text.includes(`A- ${pct(first.slug)}%`) && /as of \d{1,2}:\d{2}/.test(failed.text) && !/error|failed|couldn/i.test(failed.text), `${tag}: when Halo does not answer, the grade stays with "as of" ("${failed.text}")`);
        await host.screenshot({ path: `${OUT}/${BROWSER}-${tag}-line-as-of.png` });
      }

      // Better Halo's own card grade: Halo+ steps aside on that card (there at load, or arriving later).
      if (withBh && L) {
        await p.evaluate(() => {
          const card = document.querySelector('[class*="CourseCard_cardContainer"]');
          const row = document.createElement('div');
          row.className = 'flex justify-between better-halo-grade-indicator-container';
          row.innerHTML = '<span class="CourseCard_headerItem__x">Class</span><span class="better-halo-grade-indicator font-semibold">B   (86.2%)</span>';
          card.prepend(row);
        });
        const dropped = await until(async () => !/%/.test((await lineOf(0))?.text ?? '%'), 5000, 200);
        const other = await lineOf(1);
        check(!!dropped && /%/.test(other.text), `${tag}: a card where Better Halo shows the grade has none from Halo+ ("${(await lineOf(0)).text}"); the others keep theirs`);
        await p.locator('[class*="CourseCard_cardContainer"]').first().screenshot({ path: `${OUT}/${BROWSER}-bh-card-with-bh-grade.png` });
      }
      await p.close();
    }

    // Halo's narrowest card: four across at 232 px.
    {
      await store({ haloGrades: null });
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 1100, height: 900 });
      await p.goto('https://halo.gcu.edu/?narrow&nobh', { waitUntil: 'load' });
      await until(() => p.evaluate(() => document.querySelectorAll('[data-haloplus="class"]').length > 0), 10000, 200);
      await sleep(4000);
      const fit = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].map((h) => { const l = h.shadowRoot.querySelector('.l'); return { t: l.textContent.replace(/\s+/g, ' ').trim(), fits: l.scrollWidth <= l.clientWidth + 1, w: Math.round(h.getBoundingClientRect().width) }; }));
      check(fit.length > 0 && fit.every((f) => f.fits && /%/.test(f.t) && !f.t.includes('…')), `${tag}: the narrowest cards keep the grade and cut nothing (${fit.map((f) => `${f.w}px "${f.t}"`).join('; ')})`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-narrow.png` });
      await p.close();
    }
  } catch (e) {
    checks.push(false);
    console.log('ERROR', e.stack ?? e.message);
  } finally {
    await browser.close().catch(() => undefined);
    proc.kill();
  }
}
clearTimeout(hard);
console.log(checks.length && checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.length && checks.every(Boolean) ? 0 : 1);
