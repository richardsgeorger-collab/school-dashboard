// Halo+ on Halo's Student Home appears on the first load, every time (extension 0.12.9, George: "Halo+ sometimes
// doesn't show up until I reload a few times. That must never happen"). Halo's Student Home stand-in, made slow and
// unreliable the ways real Halo can be, twenty loads in a row, each one different (a fixed sequence, so a failure can
// be run again): the page late (up to 2.5 s), Student Home's insides arriving late (up to 4 s after the page, as when
// Halo's app finishes loading), Halo's session not ready the first times it is asked, Halo's gateway slow and failing
// its first answers, Halo redrawing Student Home a few seconds later; half the loads with nothing kept from before (a
// first visit), half with what the last load kept. Each load must show, within 30 s and still after Halo's redraws: the
// compact header with the sponsor logo in the bar, the search field, This week, the week strip with its dots, all six
// class cards' NEXT boxes, and the calendar's days. One miss, once, fails the test. Halo+'s own log of what it waited
// for (chrome.storage "haloDiag", no student data) is checked to be there and to hold no class codes or titles.
// 0.12.10 (George: the boxes "just missing, which looks broken"): while Halo+ waits, the NEXT boxes and the week strip are
// there at once, shimmering, with the Halo+ mark turning; they fill in without the page moving (the cards and the
// calendar below within 4 px); and with Halo not answering at all, every box shows the last saved state "as of" a time,
// never an error. A GIF of one slow load into docs/screens/on-halo/.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] [LOADS=20] node scripts/e2e-onhalo-firstload.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT_GIF = out('docs/screens/on-halo');

const { check, passed } = checker(BROWSER);
const LOADS = Number(process.env.LOADS || 20);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 3_000_000);
/** A fixed sequence of "random" numbers (the same loads every run). */
let seed = 20261028;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a, b) => Math.round(a + rnd() * (b - a));

const look = (p) =>
  p.evaluate(() => {
    const root = document.documentElement;
    const sp = document.querySelector('[data-haloplus="sponsor"] img, [data-haloplus="sponsor"] [data-better-halo-original-img-src]');
    const bar = document.querySelector('#header_main_container header');
    const inBar = !!(sp && bar && sp.getBoundingClientRect().top >= bar.getBoundingClientRect().top - 1 && sp.getBoundingClientRect().bottom <= bar.getBoundingClientRect().bottom + 1);
    const wk = document.querySelector('[data-haloplus="week"]');
    return {
      header: root.hasAttribute('data-hp-home-compact') && inBar,
      search: !!document.querySelector('[data-haloplus="search-bar"]'),
      week: !!(wk && wk.getBoundingClientRect().width > 200),
      strip: document.querySelectorAll('[data-haloplus="week-strip"] .hp-sd').length >= 7 && document.querySelectorAll('[data-haloplus="week-strip"] i').length > 0,
      next: document.querySelectorAll('[data-haloplus="card-next"]:not([aria-busy])').length >= 6 && [...document.querySelectorAll('[data-haloplus="card-next"]')].every((n) => n.querySelector('.hp-n-row:not(.hp-n-sk), .hp-n-none')),
      calendar: document.querySelectorAll('[data-haloplus="home-calendar"] .hp-chip').length > 0,
    };
  });
/** The waiting state, and where things are (to see that nothing moves when it fills in). */
const shape = (p) =>
  p.evaluate(() => {
    const cards = [...document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')].slice(0, 6);
    const cal = document.querySelector('[data-haloplus="home-calendar"]');
    return {
      busy: document.querySelectorAll('[data-haloplus="card-next"][aria-busy] .hp-sk').length,
      stripBusy: !!document.querySelector('[data-haloplus="week-strip"][aria-busy] .hp-sk'),
      // The strip on the page with neither its dots nor its shimmer: "just missing" (George), never allowed.
      stripEmpty: (() => {
        const st = document.querySelector('[data-haloplus="week-strip"]');
        return !!st && st.getBoundingClientRect().height > 0 && !st.querySelector('i, .hp-sk');
      })(),
      boxEmpty: [...document.querySelectorAll('[data-haloplus="card-next"]')].some((n) => !n.querySelector('.hp-n-row, .hp-n-none')),
      spinning: !!document.querySelector('[data-haloplus="card-next"][aria-busy] .hp-spin .hp-mark'),
      h: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
      // The calendar's place measured from the first card (Halo's own header rows hidden meanwhile move both alike).
      cal: cal && cards[0] ? Math.round(cal.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) : null,
    };
  });
const missing = (v) => Object.entries(v).filter(([, ok]) => !ok).map(([k]) => k);

for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `firstload-${tag}`, bh: run.bh, bhDark: run.bh });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  const st = b.bench.state;
  const times = [];
  const waited = [];
  let empties = 0;
  let fails = 0;
  try {
    await b.seed({ lastAttemptAt: new Date().toISOString(), haloWeekOpen: { open: true, at: new Date().toISOString() } });
    for (let i = 1; i <= LOADS; i++) {
      const fresh = i % 2 === 1;
      const slow = { pageMs: pick(0, 2500), hydrateMs: pick(300, 4000), sessionMisses: pick(0, 2), gatewayFails: pick(0, 4), gatewayMs: pick(50, 700), redrawsAt: rnd() < 0.6 ? [pick(800, 3000), pick(4000, 9000)] : [] };
      const said = `load ${i}${fresh ? ' (first visit)' : ''}: page +${slow.pageMs} ms, Student Home +${slow.hydrateMs} ms, session misses ${slow.sessionMisses}, gateway fails ${slow.gatewayFails} (+${slow.gatewayMs} ms each)${slow.redrawsAt.length ? `, Halo redraws at +${slow.redrawsAt.join(', +')} ms` : ''}`;
      if (fresh) await b.store({ haloCalLive: null, haloCounts: null, haloCardColors: null });
      st.slow = { ...slow, redrawsAt: [...slow.redrawsAt] };
      const t0 = Date.now();
      const p = await b.ctx.newPage();
      await p.setViewportSize({ width: 1366, height: 1000 });
      await p.goto('https://halo.gcu.edu/', { waitUntil: 'commit' });
      let v = null;
      let at = null;
      let waitShape = null;
      let sawStrip = false;
      let sawEmpty = false;
      const gif = i === 3 ? `${OUT_GIF}/.frames-${BROWSER}-${tag}` : null;
      if (gif) {
        rmSync(gif, { recursive: true, force: true });
        mkdirSync(gif, { recursive: true });
      }
      let fi = 0;
      while (Date.now() - t0 < 30_000) {
        v = await look(p).catch(() => null);
        const sh = await shape(p).catch(() => null);
        if (sh && sh.stripBusy) sawStrip = true;
        if (sh && (sh.stripEmpty || sh.boxEmpty)) sawEmpty = true;
        if (sh && (sh.busy || sh.stripBusy) && sh.h.length === 6) waitShape = sh;
        if (gif && sh && sh.h.length) await p.screenshot({ path: `${gif}/${String(fi++).padStart(3, '0')}.png`, clip: { x: 0, y: 0, width: 1366, height: 820 } }).catch(() => undefined);
        if (v && !missing(v).length) {
          at = Date.now() - t0;
          break;
        }
        await sleep(gif ? 60 : 250);
      }
      if (gif) {
        for (let k = 0; k < 8; k++) await p.screenshot({ path: `${gif}/${String(fi++).padStart(3, '0')}.png`, clip: { x: 0, y: 0, width: 1366, height: 820 } }).catch(() => undefined);
        try {
          execFileSync('python3', ['-c', `from PIL import Image\nimport glob\nfs=sorted(glob.glob('${gif}/*.png'))\nims=[Image.open(f).convert('RGB').resize((683, 410), Image.LANCZOS).convert('P', palette=Image.ADAPTIVE, colors=255) for f in fs]\nims[0].save('${OUT_GIF}/${tag}-loading.gif', save_all=True, append_images=ims[1:]+[ims[-1]]*12, duration=110, loop=0, disposal=2)`]);
          rmSync(gif, { recursive: true, force: true });
        } catch (e) {
          console.log(`(no GIF: ${e.message.split('\n')[0]})`);
        }
      }
      if (waitShape && at !== null) {
        const after = await shape(p);
        const moved = Math.max(...after.h.map((h, k) => Math.abs(h - (waitShape.h[k] ?? h))), waitShape.cal != null && after.cal != null ? Math.abs(after.cal - waitShape.cal) : 0);
        waited.push({ moved, spinning: waitShape.spinning || !waitShape.busy, strip: sawStrip });
      }
      if (sawEmpty) {
        empties += 1;
        console.log(`  load ${i}: a NEXT box or the week strip was on the page empty`);
        if (moved > 4) console.log(`  moved ${moved} px: while waiting ${JSON.stringify(waitShape)}, then ${JSON.stringify(after)}`);
      }
      // Still all there after Halo's redraws.
      const lastRedraw = slow.redrawsAt.length ? slow.pageMs + slow.hydrateMs + Math.max(...slow.redrawsAt) : 0;
      if (at !== null && lastRedraw) {
        await sleep(Math.max(0, t0 + lastRedraw + 2500 - Date.now()));
        v = await look(p).catch(() => null);
        if (!v || missing(v).length) at = null;
      }
      if (at === null) fails += 1;
      times.push(at);
      check(at !== null, `${tag}: ${said}: ${at !== null ? `everything in ${(at / 1000).toFixed(1)} s` : `missing after 30 s: ${v ? missing(v).join(', ') : 'the page'}`}`);
      await p.close();
      st.slow = null;
    }
    const ok = times.filter((t) => t !== null);
    // The waiting state: seen on the slow loads, shimmering with the mark turning, and nothing moved when it filled in.
    check(waited.length >= LOADS / 4 && waited.every((w) => w.spinning) && empties === 0 && waited.every((w) => w.moved <= 4), `${tag}: while Halo+ waits, the boxes (and the strip, ${waited.filter((w) => w.strip).length} times seen waiting) shimmer in place with the mark turning (${waited.length} of ${LOADS} loads), never empty (${empties}), and fill in without the page moving (most ${Math.max(0, ...waited.map((w) => w.moved))} px)`);
    // Halo not answering at all: the last saved state, "as of" a time, never an error.
    await b.store({ haloCalLive: null });
    st.slow = { gatewayFails: 100000, gatewayMs: 50 };
    const p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1000 });
    const asOf = await until(async () => {
      const r = await p.evaluate(() => {
        const boxes = [...document.querySelectorAll('[data-haloplus="card-next"]')];
        return { n: boxes.length, asof: boxes.filter((b) => !b.getAttribute('aria-busy') && /as of \d{1,2}:\d{2} [AP]M|as of [A-Z][a-z]{2} \d{1,2}, /.test(b.textContent)).length, text: [...document.querySelectorAll('[data-haloplus]')].map((e) => e.textContent).join(' ') };
      });
      return r.n >= 6 && r.asof >= 6 ? r : null;
    }, 30000, 500);
    check(!!asOf && !/error|failed|could not|went wrong/i.test(asOf.text), `${tag}: Halo not answering at all: every box shows the last saved state "as of" a time, no error (${asOf ? asOf.asof : 0} boxes)`);
    await p.screenshot({ path: `${OUT_GIF}/${tag}-as-of.png`, clip: { x: 0, y: 0, width: 1366, height: 820 } });
    await p.close();
    st.slow = null;
    check(fails === 0, `${tag}: ${LOADS} loads, ${fails} with anything missing${ok.length ? ` (slowest ${(Math.max(...ok) / 1000).toFixed(1)} s, middle ${(ok.sort((x, y) => x - y)[Math.floor(ok.length / 2)] / 1000).toFixed(1)} s)` : ''}`);
    // Halo+'s own log of what it waited for: there, and never student data.
    const { haloDiag } = await b.read('haloDiag');
    const text = JSON.stringify(haloDiag || {});
    const names = b.fx.index.classes.flatMap((c) => [c.code, c.cc, c.slug, c.name]).concat(b.fx.index.rows.slice(0, 40).map((r) => r.title)).filter((x) => x && x.length > 3);
    const leaks = names.filter((n) => text.includes(n));
    const runs = (haloDiag && haloDiag.runs) || [];
    const evs = new Set(runs.flatMap((r) => r.ev.map((e) => e.ev)));
    check(runs.length > 0 && ['start', 'data', 'halo', 'features', 'halo-answers'].every((e) => evs.has(e)) && leaks.length === 0, `${tag}: Halo+'s log of what it waited for: ${runs.length} pages, ${[...evs].join(', ')}; no student data${leaks.length ? ` (FOUND: ${leaks.slice(0, 3).join(', ')})` : ''}`);
    if (tag === 'plain' && runs.length) console.log(`  one page's log: ${JSON.stringify(runs[runs.length - 1]).slice(0, 700)}`);
  } catch (e) {
    check(false, `${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
