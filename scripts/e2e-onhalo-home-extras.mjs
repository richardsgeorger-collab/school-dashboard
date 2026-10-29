// Features 26 and 13 (extension 0.12.0) on Halo's Student Home stand-in, with the demo student (made up).
// 26: counts on Better Halo's card buttons only where Better Halo's own counts are missing; Halo's own numbers read the
// way Halo's sidebar reads them (discussions = DQ + IDQ, "99+", nothing under 1); asked once in five minutes; gone if
// Better Halo's appear; nothing without Better Halo's buttons. 13: once per Halo version, on Student Home, the page code
// for the student's next assignment is fetched ahead from Halo's file servers (Halo's real files), at most 12 files,
// nothing asked of Halo's servers; not again on the next visit; not on a slow connection; not on Free.
//   [BROWSER=chrome|edge] node scripts/e2e-onhalo-home-extras.mjs
import { readFileSync } from 'node:fs';
import { countsGateway } from './lib/haloPages.mjs';
import { BROWSER, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/home-extras');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);

// ---- 26: counts ----
{
  const b = await openBench({ label: 'counts', bh: false });
  b.bench.state.bh = true;
  Object.assign(b.bench.state.gateway, countsGateway(b.fx));
  const st = b.bench.state;
  try {
    await b.seed();
    const cls = b.fx.payload.classes;
    st.counts = {
      [cls[0].slugId]: { DQ: 3, IDQ: 1, CQ: 5, GROUP: 2, ANNOUNCEMENTS: 2, gradebook: 1 },
      [cls[1].slugId]: { DQ: 0, IDQ: 0, CQ: 0, ANNOUNCEMENTS: 0, gradebook: 0 },
      [cls[2].slugId]: { DQ: 150, IDQ: 0, ANNOUNCEMENTS: 0, gradebook: 0 },
    };
    const sideAsks = () => b.bench.calls.gateway.filter((c) => /^Sidebar/.test(c.op)).length;
    // Better Halo's own counts are there: Halo+ adds none and asks nothing.
    st.badges = { [cls[0].slugId]: { announcements: 2 } };
    let p = await b.page('https://halo.gcu.edu/');
    await sleep(8000);
    check((await p.locator('[data-haloplus="count"]').count()) === 0 && sideAsks() === 0, `counts: Better Halo shows its own: Halo+ adds none, asks nothing`);
    await p.screenshot({ path: `${OUT}/1-bh-own-counts.png` });
    await p.close();
    // Better Halo's counts missing: Halo's own numbers, after Better Halo has had its moment.
    st.badges = null;
    p = await b.page('https://halo.gcu.edu/');
    await sleep(3000);
    check((await p.locator('[data-haloplus="count"]').count()) === 0, `counts: not before Better Halo has had a few seconds`);
    await p.locator('[class*="CourseCard_cardContainer"]').first().screenshot({ path: `${OUT}/0-before-card.png` });
    await until(async () => (await p.locator('[data-haloplus="count"]').count()) > 0, 12000, 300);
    const got = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="count"]')].map((e) => [new URL(e.parentElement.href).pathname.split('/')[2], e.parentElement.getAttribute('data-section'), e.textContent]));
    const want = [[cls[0].slugId, 'announcements', '2'], [cls[0].slugId, 'gradebook', '1'], [cls[0].slugId, 'discussion', '4'], [cls[2].slugId, 'discussion', '99+']];
    check(JSON.stringify(got.sort()) === JSON.stringify(want.sort()), `counts: Halo's numbers, read as Halo's sidebar reads them (${JSON.stringify(got)})`);
    check((await p.locator('[data-haloplus="count-mark"]').count()) === 2, `counts: one ⊕ per card that has a Halo+ count`);
    const asks = sideAsks();
    check(asks === cls.length * 2, `counts: two questions per class (${asks})`);
    await p.locator('[class*="CourseCard_cardContainer"]').first().screenshot({ path: `${OUT}/2-counts-card.png` });
    // Better Halo's appear later: Halo+'s go.
    await p.evaluate(() => {
      const b0 = document.querySelector('.better-halo-icon-button[data-section="announcements"]');
      const s = document.createElement('span');
      s.className = 'better-halo-notification-badge';
      s.textContent = '2';
      b0.appendChild(s);
    });
    await sleep(800);
    check((await p.locator('[data-haloplus="count"]').count()) === 0, `counts: Better Halo's own appear: Halo+'s are taken away`);
    await p.close();
    p = await b.page('https://halo.gcu.edu/');
    await sleep(9000);
    check(sideAsks() === asks, `counts: within five minutes Halo is not asked again`);
    await p.close();
    // No Better Halo buttons: nothing, no questions.
    st.bh = false;
    await b.store({ haloCounts: null });
    const before = sideAsks();
    p = await b.page('https://halo.gcu.edu/');
    await sleep(8000);
    check((await p.locator('[data-haloplus="count"]').count()) === 0 && sideAsks() === before, `counts: no Better Halo buttons: nothing, nothing asked`);
    await p.close();
  } catch (e) {
    check(false, `counts: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}

// ---- 13: preload ----
{
  const b = await openBench({ label: 'preload' });
  try {
    // A sync just tried: Halo+'s visit sync (0.11.0) would otherwise read the whole fake Halo here, and that is not
    // fetch-ahead's load.
    await b.seed({ lastAttemptAt: new Date().toISOString() });
    const halo = [];
    b.ctx.on('request', (r) => {
      const u = new URL(r.url());
      if (u.hostname === 'halo.gcu.edu' && /^\/_next\/static\/(chunks|css)\//.test(u.pathname)) halo.push(u.pathname);
    });
    // Halo+'s grade refresh on Student Home asks Halo for grades (0.11.1); anything else would be preload's.
    // Fetch-ahead's own load on Halo: not the grade refresh's question, nor the all-classes calendar's (0.12.2: open on
    // Student Home), which are theirs.
    const api = () => b.bench.calls.gateway.filter((c) => c.op !== 'GradeOverview' && c.op !== 'StudentAssessmentDetails').length + b.bench.calls.rest.length;
    const api0 = api();
    let p = await b.page('https://halo.gcu.edu/');
    // This computer's own battery decides (the rule is unit-tested for every case): on a low battery, nothing.
    const bat = await p.evaluate(async () => (navigator.getBattery ? (async (x) => ({ charging: x.charging, level: x.level }))(await navigator.getBattery()) : null));
    const low = !!bat && !bat.charging && bat.level > 0 && bat.level < 0.3;
    if (low) {
      console.log(`note: this computer is on a low battery (${Math.round(bat.level * 100)}%, not charging): preload must do nothing`);
      await sleep(14000);
      const links0 = await p.locator('link[data-haloplus="preload"]').count();
      const asked0 = b.bench.calls.gateway.filter((c) => c.op !== 'GradeOverview' && c.op !== 'StudentAssessmentDetails').map((c) => c.op).slice(-5);
      check(links0 === 0 && api() === api0, `preload: on this computer's low battery: nothing fetched, nothing asked (${links0} fetched, ${api() - api0} asked${api() - api0 ? `: ${asked0.join(', ')}; rest ${b.bench.calls.rest.length}` : ''})`);
      // The rest of the path, run as the extension runs it but in a page whose battery says "charging", with the
      // shared parts stubbed: the same preload.js and logic.js files, Halo's real build manifest and files.
      const sim = await b.page('https://halo.gcu.edu/');
      const before = halo.length;
      const files = await sim.evaluate(
        async ({ logic, pre, index }) => {
          Object.defineProperty(navigator, 'getBattery', { value: async () => ({ charging: true, level: 1 }) });
          const mem = {};
          const def = {};
          globalThis.chrome = { storage: { local: { get: async (k) => ({ [k]: mem[k] }), set: async (o) => Object.assign(mem, o) } } };
          globalThis.HaloPlusOn = { feature: (d) => Object.assign(def, d), count: () => undefined, st: { haloIndex: index } };
          new Function(logic)();
          new Function(pre)();
          def.start();
          for (let i = 0; i < 60 && !document.querySelector('link[data-haloplus="preload"]'); i++) await new Promise((r) => setTimeout(r, 250));
          await new Promise((r) => setTimeout(r, 1500));
          return { links: [...document.querySelectorAll('link[data-haloplus="preload"]')].map((l) => l.getAttribute('href')), saved: mem.haloPreload || null };
        },
        { logic: readFileSync('extension/onhalo/logic.js', 'utf8'), pre: readFileSync('extension/onhalo/preload.js', 'utf8'), index: b.fx.index },
      );
      await sleep(1500);
      const got = halo.slice(before).filter((x) => files.links.includes(x));
      check(files.links.length > 0 && files.links.length <= 12 && got.length === files.links.length && files.saved && files.saved.files === files.links.length, `preload (charging, same code): ${files.links.length} of Halo's page files fetched ahead from Halo's file servers, remembered for this Halo version`);
      await sim.close();
      await p.close();
      throw Object.assign(new Error('low battery'), { lowBattery: true });
    }
    await until(async () => (await p.locator('link[data-haloplus="preload"]').count()) > 0, 20000, 300);
    await sleep(2500);
    const links = await p.evaluate(() => [...document.querySelectorAll('link[data-haloplus="preload"]')].map((l) => l.getAttribute('href')));
    check(links.length > 0 && links.length <= 12 && links.every((h) => /^\/_next\/static\/(chunks|css)\//.test(h)), `preload: ${links.length} of Halo's own page files, fetched ahead (${links.slice(-2).join(', ')})`);
    const fetched = halo.filter((x) => links.includes(x));
    check(fetched.length === links.length, `preload: the browser fetched them from Halo's file servers (${fetched.length})`);
    check(api() === api0, `preload: nothing asked of Halo's servers (no question, no page)`);
    const saved = (await b.read(['haloPreload'])).haloPreload;
    check(saved && saved.build && saved.files === links.length, `preload: remembered for this Halo version (${saved && saved.build})`);
    await p.close();
    p = await b.page('https://halo.gcu.edu/');
    await sleep(12000);
    check((await p.locator('link[data-haloplus="preload"]').count()) === 0, `preload: the next visit fetches nothing again`);
    await p.close();
    // A slow connection: nothing.
    await b.store({ haloPreload: null });
    p = await b.ctx.newPage();
    const cdp = await b.ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 800, downloadThroughput: 50_000, uploadThroughput: 20_000, connectionType: 'cellular3g' });
    await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await sleep(14000);
    check((await p.locator('link[data-haloplus="preload"]').count()) === 0, `preload: a slow connection: nothing fetched ahead`);
    await p.close();
    // No Halo+ account on this computer yet: nothing (Free has it since 0.12.12).
    await b.seed({ ...{ tier: null, haloSnap: null, haloLive: null, syncKey: null, lastSyncAt: null }, haloPreload: null });
    p = await b.page('https://halo.gcu.edu/');
    await sleep(12000);
    check((await p.locator('link[data-haloplus="preload"]').count()) === 0, `preload: no account yet: nothing`);
    await p.close();
  } catch (e) {
    if (!e.lowBattery) check(false, `preload: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
