// "This week" on Halo's Student Home (extension 0.10.0, George 2026-10-24), in real Chrome and Edge with this repo's
// extension, on the Halo stand-in (scripts/lib/haloStandIn.mjs) with the demo student's data (Maya Torres, made up), with
// and without the real Better Halo (its Web Store build, unpacked; BH_DIR), light and dark.
// Checks: placed at the top of Student Home, below Halo's tabs, above the cards, their full width; it takes the card's
// own look (background, corners, shadow, font) under Halo's light and dark and under Better Halo's themes; "This week ·
// N due" folds and stays folded; Overdue, Today, Tomorrow, Later this week; at most 8 rows then "Show all"; the gold dot
// says what Halo+ caught; "Open in Halo+" on hover; a row opens the assignment on Halo; the box checks it off with Undo
// (an undone one never reaches the account; a kept one does, once); participation is one line; "Today: All done ✓";
// no pill and no peek on Student Home; the pill on Halo's other pages; Free shows "as of" and nothing else; not on
// "Past classes", not when switched off, nothing where it cannot sit cleanly; counted for Admin; no long tasks.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] [EXT_DIR=extension] node scripts/e2e-halo-week.mjs
// Better Halo, unpacked (it is a public Web Store extension):
//   curl -sL -o bh.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx2,crx3&x=id%3Dgoofpkaenamaankebgoegfghpkaolchj%26uc" && unzip -qo bh.crx -d bh
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { haloPage, launch, sleep, until } from './lib/haloStandIn.mjs';

const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const BH = process.env.BH_DIR ? resolve(process.env.BH_DIR) : null;
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const BROWSER = process.env.BROWSER ?? 'chrome';
const OUT = 'docs/screens/halo-week';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${BROWSER}: ${line}`); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 1200000);
const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/halo-snap-fixture.ts'], { encoding: 'utf8' }));
const NOW = Date.now();
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();
/** A time zone where it is mid-morning right now, so "in 4 hours" is still today whenever the test runs. */
const MORNING_TZ = (() => {
  const n = Math.max(-12, Math.min(12, new Date(NOW).getUTCHours() - 10));
  return n === 0 ? 'Etc/GMT' : `Etc/GMT${n > 0 ? '+' : '-'}${Math.abs(n)}`;
})();

/**
 * The demo week: everything done, then one graded item overdue, two today, two tomorrow, five later this week (ten
 * rows: "Show all 10"), one far off, and a participation post. `todayDone`: nothing overdue or today.
 */
function shaped(kind = 'week') {
  const s = JSON.parse(JSON.stringify(fx.snap));
  s.tz = MORNING_TZ;
  s.syncedAt = iso(-1);
  s.pw = 2;
  s.top = null;
  for (const i of s.items) i.done = 1;
  const g = s.items.filter((i) => i.pts > 0 && !i.pa && i.h);
  const plan = kind === 'todayDone' ? [null, null, null, 26, 28, 50, 74] : [-6, 4, 6, 26, 28, 50, 74, 98, 100, 118, 24 * 12];
  plan.forEach((h, k) => {
    if (h === null || !g[k]) return;
    Object.assign(g[k], { due: iso(h), hd: iso(h), done: 0 });
    delete g[k].xs;
    delete g[k].xb;
    g[k].x = 0;
  });
  // What Halo+ caught for one of tomorrow's (the gold dot), and the topic it sits on in Halo (where its row opens).
  Object.assign(g[3], { x: 1, xs: ['Bring a printed copy of your draft'], u: 'unit-7', hy: 'ASSIGNMENT' });
  s.items.push({ id: 'demo-part-w', h: 'h-part-w', c: s.classes[0].id, t: 'BIO-181 Participation W8 Day 2', ht: 'Week 8, Day 2 Participation', due: iso(20), hd: iso(20), pts: 0, ty: 'discussion', done: 0, x: 0, pa: 1 });
  return { snap: s, rows: g };
}

const bhPath = BH && existsSync(join(BH, 'manifest.json')) ? BH : null;
if (!bhPath) console.log(`note: no Better Halo (BH_DIR) — running without it only`);
const runs = bhPath ? [false, true] : [false];

for (const withBh of runs) {
  const tag = withBh ? 'bh' : 'plain';
  const { browser, ctx, proc, load } = await launch(BROWSER, `week-${tag}`);
  const events = [];
  const marks = [];
  let doneIds = [];
  try {
    await ctx.route('https://halo.gcu.edu/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'text/html', body: haloPage(fx, u.href) });
    });
    // Better Halo's own reading of Halo: no session here.
    await ctx.route('https://gateway.halo.gcu.edu/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"errors":[{"message":"unauthenticated"}]}' }));
    await ctx.route('https://haloplus.app/**', (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
      let file = join(LOCAL_SITE, path || 'index.html');
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
    });
    await ctx.route('**/functions/v1/report', (r) => {
      const b = r.request().postDataJSON?.() ?? null;
      if (b && b.kind === 'halo-ui') events.push(b.event);
      return r.fulfill({ status: 200, body: '{"ok":true}' });
    });
    // The account: its done list, and check-offs from "This week".
    await ctx.route('**/functions/v1/sync-drop', async (r) => {
      const b = r.request().postDataJSON?.() ?? null;
      const ok = (body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (b && b.mark) {
        marks.push({ ...b.mark, at: Date.now() });
        if (b.mark.done === true) doneIds = [...doneIds, b.mark.id];
        else doneIds = doneIds.filter((x) => x !== b.mark.id);
        return ok({ ok: true, prev: b.mark.done ? { status: 'todo', completedAt: null, award: null } : undefined });
      }
      if (b && b.done === true) return ok({ ok: true, at: new Date().toISOString(), done: doneIds });
      if (b && b.status === true) return ok({ ok: true, appliedAt: iso(-1), via: 'extension', lastDropAt: iso(-1), takenAt: iso(-1) });
      return ok({ ok: true });
    });
    const { worker } = await load(EXT);
    const store = (o) => worker.evaluate((x) => chrome.storage.local.set(x), o);
    let bh = null;
    if (withBh) bh = await load(bhPath);
    const week = shaped();
    await store({ tier: 'max', lastSyncAt: new Date().toISOString(), syncKey: 'a'.repeat(48), haloSnap: week.snap, haloLive: null, haloDone: null, haloMarks: null, haloWeek: null, haloUi: null, haloUiOn: null, haloBase: null });
    await sleep(1200);
    for (const pg of ctx.pages()) if (pg.url().startsWith('https://haloplus.app')) await pg.close().catch(() => undefined);

    for (const scheme of ['light', 'dark']) {
      const L = scheme === 'light';
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 1366, height: 900 });
      await p.emulateMedia({ colorScheme: scheme });
      if (bh) {
        // Better Halo's themes: a light one, and a dark one (its own dark variant), as a student would pick them.
        const theme = L ? 'claude' : 'darkmatter';
        await bh.worker.evaluate((t) => chrome.storage.sync.set({ theme: t.theme, themeVariant: t.dark ? 'dark' : 'light' }), { theme, dark: !L });
        await p.goto('https://halo.gcu.edu/calendar', { waitUntil: 'load' });
        await p.evaluate((t) => { localStorage.setItem('better-halo-initial-theme', t.theme); localStorage.setItem('better-halo-initial-dark', t.dark ? '1' : '0'); }, { theme, dark: !L });
      }
      // Long tasks while Halo's page loads with Halo+ on it.
      await p.addInitScript(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* not supported */ } });
      await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
      const panel = await until(() => p.evaluate(() => !!document.querySelector('[data-haloplus="week"]')), 8000, 200);
      // Better Halo fades its theme in: wait for Halo's card to settle, then give the panel a moment to follow it.
      const cardStyle = () => p.evaluate(() => { const c = getComputedStyle(document.querySelector('[class*="CourseCard_cardContainer"]')); return `${c.backgroundColor}|${c.boxShadow}|${c.borderRadius}`; });
      let was = '';
      await until(async () => { const now = await cardStyle(); const same = now === was; was = now; return same; }, 10000, 400);
      await sleep(1200);
      const inW = (fn, arg) => p.evaluate(([f, a]) => { const r = document.querySelector('[data-haloplus="week"]')?.shadowRoot; return r ? new Function('r', 'a', `return (${f})(r, a)`)(r, a) : null; }, [fn.toString(), arg]);
      const geo = await p.evaluate(() => {
        const h = document.querySelector('[data-haloplus="week"]');
        const tabs = document.querySelector('[role="tablist"]');
        const grid = document.querySelector('[class*="CourseCard_cardContainer"]').parentElement;
        const card = document.querySelector('[class*="CourseCard_cardContainer"]');
        const wk = h?.shadowRoot.querySelector('.wk');
        const a = h?.getBoundingClientRect();
        const cs = wk ? getComputedStyle(wk) : null;
        const cc = getComputedStyle(card);
        return {
          top: a?.top, bottom: a?.bottom, width: a?.width, tabsBottom: tabs.getBoundingClientRect().bottom, gridTop: grid.getBoundingClientRect().top, gridWidth: grid.getBoundingClientRect().width,
          bg: cs?.backgroundColor, cardBg: cc.backgroundColor, radius: cs?.borderTopLeftRadius, cardRadius: cc.borderTopLeftRadius, shadow: cs?.boxShadow, cardShadow: cc.boxShadow, font: cs?.fontFamily, cardFont: cc.fontFamily,
          theme: document.documentElement.getAttribute('data-better-halo-theme'), dark: document.documentElement.classList.contains('dark'),
        };
      });
      const pillThere = await p.evaluate(() => !!document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector('.pill'));
      check(!!panel && geo.top >= geo.tabsBottom - 1 && geo.bottom <= geo.gridTop + 1 && Math.abs(geo.width - geo.gridWidth) < 2, `${tag} ${scheme}: at the top of Student Home, below Halo's tabs, above the cards, their full width (${Math.round(geo.width ?? 0)} of ${Math.round(geo.gridWidth)} px)`);
      if (withBh) check(!!geo.theme, `${tag} ${scheme}: Better Halo's theme is on ("${geo.theme}"${geo.dark ? ', dark' : ''})`);
      check(geo.bg === geo.cardBg && geo.radius === geo.cardRadius && geo.shadow === geo.cardShadow && geo.font === geo.cardFont, `${tag} ${scheme}: Halo's own card look (${geo.bg} / ${geo.cardBg}, radius ${geo.radius}, shadow ${geo.shadow === geo.cardShadow ? 'same' : `${geo.shadow} vs ${geo.cardShadow}`}, font ${geo.font === geo.cardFont ? 'same' : 'different'})`);
      check(!pillThere, `${tag} ${scheme}: no pill and no peek on Student Home`);
      // Quiet when nothing changes: no looks at Halo's cards, and no back-and-forth with Better Halo (both watch the page).
      const idle = await p.evaluate(async () => {
        let probes = 0;
        let added = 0;
        const mo = new MutationObserver((rs) => { for (const r of rs) for (const x of r.addedNodes) { added += 1; if (x.getAttribute && x.getAttribute('data-haloplus') === 'probe') probes += 1; } });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        await new Promise((r) => setTimeout(r, 5000));
        mo.disconnect();
        return { probes, added };
      });
      // One look is the panel following a real change (Better Halo re-adding its theme's style); a loop would be many.
      check(idle.probes <= 1 && idle.added < 20, `${tag} ${scheme}: quiet while nothing changes (${idle.probes} looks, ${idle.added} nodes added in 5 s)`);
      const longest = Math.max(0, ...(await p.evaluate(() => window.__long || [])));
      check(longest < 120, `${tag} ${scheme}: Halo's page never waits on it (longest task ${Math.round(longest)} ms)`);
      const text = (await inW((r) => r.querySelector('.wk').innerText)) ?? '';
      const flat = text.replace(/\s+/g, ' ').trim();
      if (L && !withBh) {
        check(/^This week · 10 due Halo\+/.test(flat), `the header: "${flat.slice(0, 40)}"`);
        check(/OVERDUE .+ TODAY .+ TOMORROW .+ LATER THIS WEEK/.test(flat), `Overdue, Today, Tomorrow, Later this week: "${flat.slice(0, 160)}"`);
        const n = await inW((r) => r.querySelectorAll('.r').length);
        check(n === 8 && /Show all 10/.test(flat), `at most 8 rows, then "Show all 10" (${n})`);
        check(/Participation: 2 posts left this week$/.test(flat), 'participation: one line at the bottom');
        check(!/Participation W8/.test(flat), 'no participation post among the rows');
        const dot = await inW((r) => r.querySelector('.x')?.getAttribute('title'));
        check(dot === 'Halo+ caught: Bring a printed copy of your draft', `the gold dot says what Halo+ caught: "${dot}"`);
        const cbs = await inW((r) => r.querySelectorAll('input[type="checkbox"]').length);
        check(cbs === 8, `a check box on each row (${cbs})`);
        await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-open-${scheme}.png`, fullPage: true });
        // "Show all"
        await inW((r) => r.querySelector('.more').click());
        await sleep(300);
        const all = await inW((r) => r.querySelectorAll('.r').length);
        check(all === 10, `"Show all" opens the rest inline (${all})`);
        // Hover: "Open in Halo+".
        const box = await p.evaluate(() => { const h = document.querySelector('[data-haloplus="week"]'); const r = h.shadowRoot.querySelectorAll('.r')[3].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await p.mouse.move(box.x, box.y);
        await sleep(250);
        const plus = await inW((r) => { const a = r.querySelectorAll('.r')[3].querySelector('.plus'); return a ? { shown: getComputedStyle(a).display !== 'none', href: a.href } : null; });
        check(!!plus && plus.shown && /^https:\/\/haloplus\.app\/#\/class\?c=.+&i=.+&from=halo&via=week$/.test(plus.href), `"Open in Halo+" on hover (${plus?.href})`);
        await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-hover-${scheme}.png`, clip: { x: 0, y: 64, width: 1366, height: 560 } });
        // ---- the box: check off, Undo; then check off and keep ----
        const first = await inW((r) => r.querySelector('.r input').dataset.id);
        await inW((r) => r.querySelector('.r input').click());
        await sleep(400);
        const on = await inW((r) => { const li = r.querySelector('.r.on'); return li ? { title: li.querySelector('.t').textContent, undo: !!li.querySelector('.undo'), strike: getComputedStyle(li.querySelector('.t')).textDecorationLine } : null; });
        check(!!on && on.undo && on.strike === 'line-through', `checked: crossed out, with Undo (${on?.title})`);
        await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-checked-${scheme}.png`, clip: { x: 0, y: 64, width: 1366, height: 560 } });
        await inW((r) => r.querySelector('.undo').click());
        await sleep(6500);
        const back = await inW((r, id) => !!r.querySelector(`input[data-id="${id}"]`) && !r.querySelector(`input[data-id="${id}"]`).checked, first);
        check(back && !marks.some((m) => m.id === first), `Undo: it is back, and nothing reached the account (${marks.length} sent)`);
        await inW((r, id) => r.querySelector(`input[data-id="${id}"]`).click(), first);
        const sent = await until(async () => marks.find((m) => m.id === first && m.done === true), 12000, 300);
        await sleep(1500);
        const gone = await inW((r, id) => !r.querySelector(`input[data-id="${id}"]`), first);
        const head = await inW((r) => r.querySelector('.hd').innerText.replace(/\s+/g, ' '));
        check(!!sent && gone && /This week · 9 due/.test(head ?? ''), `kept: it goes to the account once, leaves the list, the count drops ("${head}")`);
        check(marks.filter((m) => m.id === first && m.done === true).length === 1, 'sent once');
        // The same check-off counts in the pill on another Halo page, at once.
        const other = await ctx.newPage();
        await other.setViewportSize({ width: 1366, height: 900 });
        await other.goto('https://halo.gcu.edu/calendar', { waitUntil: 'load' });
        const pill = await until(() => other.evaluate(() => document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector('.pill .short')?.textContent ?? null), 8000, 200);
        check(!!pill && !/overdue/.test(pill), `Halo's other pages: the pill, and the checked-off overdue item is not overdue there ("${pill}")`);
        await other.close();
        // A row opens the assignment on Halo.
        const href = await inW((r) => r.querySelectorAll('.r')[2].dataset.href);
        await inW((r) => r.querySelectorAll('.r')[2].querySelector('.c').click());
        await until(async () => p.url() !== 'https://halo.gcu.edu/', 6000, 200);
        check(p.url() === href && /^https:\/\/halo\.gcu\.edu\/(courses|quiz)\//.test(href), `a row opens the assignment on Halo (${p.url()})`);
        await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
        await until(() => p.evaluate(() => !!document.querySelector('[data-haloplus="week"]')), 6000, 200);
      } else {
        await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-open-${scheme}.png`, fullPage: true });
      }
      // ---- folded, and remembered ----
      await inW((r) => r.querySelector('.hd').click());
      await sleep(300);
      const folded = await inW((r) => ({ hidden: r.querySelector('.bd').hidden, h: r.querySelector('.wk').getBoundingClientRect().height, exp: r.querySelector('.hd').getAttribute('aria-expanded') }));
      await p.reload({ waitUntil: 'load' });
      await until(() => p.evaluate(() => !!document.querySelector('[data-haloplus="week"]')), 6000, 200);
      await sleep(500);
      const still = await inW((r) => r.querySelector('.bd').hidden);
      if (L) check(folded?.hidden && folded.exp === 'false' && folded.h < 60 && still, `${tag}: folds to its header (${Math.round(folded?.h ?? 0)} px) and stays folded`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-collapsed-${scheme}.png`, clip: { x: 0, y: 64, width: 1366, height: 420 } });
      await inW((r) => r.querySelector('.hd').click());
      await sleep(300);
      await p.close();
    }

    if (!withBh) {
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 1366, height: 900 });
      const flatOf = () => p.evaluate(() => document.querySelector('[data-haloplus="week"]')?.shadowRoot?.querySelector('.wk')?.innerText.replace(/\s+/g, ' ').trim() ?? null);
      // ---- today done ----
      await store({ haloSnap: shaped('todayDone').snap, haloMarks: null });
      doneIds = [];
      await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
      const td = await until(async () => { const t = await flatOf(); return t && /Today: All done ✓/.test(t) ? t : null; }, 8000, 200);
      check(!!td && /^This week · 4 due Halo\+ Today: All done ✓ TOMORROW/.test(td), `today done: "Today: All done ✓" on one line, then Tomorrow ("${(td ?? '').slice(0, 70)}")`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-today-done-light.png`, clip: { x: 0, y: 64, width: 1366, height: 420 } });
      // ---- Past classes: not there ----
      await p.goto('https://halo.gcu.edu/?past', { waitUntil: 'load' });
      await sleep(2500);
      check((await flatOf()) === null, 'not on "Past classes"');
      // ---- where it cannot sit cleanly: nothing, and the pill does the job ----
      await p.goto('https://halo.gcu.edu/?details', { waitUntil: 'load' });
      await sleep(2500);
      const pl = await p.evaluate(() => !!document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector('.pill'));
      check((await flatOf()) === null && pl, 'no CourseCard cards to sit above: no panel, the pill instead');
      // ---- Free: last synced data, "as of", no nagging ----
      await store({ tier: 'free', haloSnap: { ...shaped().snap, plan: 'free', syncedAt: iso(-24 * 9) } });
      await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
      const fr = await until(() => flatOf(), 8000, 200);
      check(!!fr && /^This week · \d+ due as of [A-Z][a-z]{2} \d+ Halo\+/.test(fr) && !/upgrade|plus plan|max|trial|subscribe|\$/i.test(fr.replace(/Halo\+/g, '')), `Free: the last synced week, "as of", nothing else ("${(fr ?? '').slice(0, 60)}")`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-free-light.png`, clip: { x: 0, y: 64, width: 1366, height: 560 } });
      // ---- switched off ----
      await store({ tier: 'max', haloSnap: shaped().snap, haloUiOn: { on: false, at: new Date().toISOString() } });
      await sleep(1500);
      check((await flatOf()) === null, 'switched off ("Show Halo+ on Halo pages"): gone');
      await store({ haloUiOn: { on: true, at: new Date().toISOString() } });
      await p.close();
      // ---- counted for Admin ----
      await sleep(1500);
      const seen = new Set(events);
      check(['week-shown', 'week-row', 'week-check', 'week-undo', 'week-more', 'week-close', 'week-open'].every((e) => seen.has(e)), `counted: ${[...seen].filter((e) => e.startsWith('week')).sort().join(', ')}`);
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
const okAll = checks.every(Boolean);
console.log(okAll ? 'PASS' : 'FAIL');
process.exit(okAll ? 0 : 1);
