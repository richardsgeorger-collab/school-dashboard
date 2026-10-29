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
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] [LOADS=20] node scripts/e2e-onhalo-firstload.mjs
import { gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, sleep } from './lib/onHaloRun.mjs';

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
      next: document.querySelectorAll('[data-haloplus="card-next"] .hp-n-row, [data-haloplus="card-next"] .hp-n-none').length > 0 && document.querySelectorAll('[data-haloplus="card-next"]').length >= 6,
      calendar: document.querySelectorAll('[data-haloplus="home-calendar"] .hp-chip').length > 0,
    };
  });
const missing = (v) => Object.entries(v).filter(([, ok]) => !ok).map(([k]) => k);

for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `firstload-${tag}`, bh: run.bh, bhDark: run.bh });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  const st = b.bench.state;
  const times = [];
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
      while (Date.now() - t0 < 30_000) {
        v = await look(p).catch(() => null);
        if (v && !missing(v).length) {
          at = Date.now() - t0;
          break;
        }
        await sleep(250);
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
