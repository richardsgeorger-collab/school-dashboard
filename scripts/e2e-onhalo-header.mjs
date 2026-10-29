// The compact Student Home (extension 0.12.3) on Halo's Student Home stand-in (its title row with the sponsor logo's
// place, a labelled stand-in image; Halo's two schedule lines; its tabs; its purple bar), with the demo student Maya
// Torres (made up): the title row, the schedule lines and the tabs hidden; the sponsor logo shown in the purple bar
// between MESSAGES and the bell, whole and uncovered, with Halo's link; search, This week and the class cards right
// under the bar; at full width and 1024px, plain and Better Halo dark. Halo redraws Student Home without reloading
// (My Classes, the HALO logo, a class page and back): every frame of the redraw stays compact, the logo stays in the
// bar, and This week, the week strip, the calendar section and the class lines come back; nothing is redone after.
// Left alone: Halo's header in another shape, no logo, switched off, Free.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-header.mjs
import { gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/header');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);

const look = (p) =>
  p.evaluate(() => {
    const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
    const main = document.getElementById('Home--main');
    const header = main && main.querySelector(':scope > header');
    const info = main && [...main.children].find((e) => e.tagName === 'DIV' && e.querySelector('a[href*="classschedule"]') && !e.closest('[data-haloplus]'));
    const tabs = main && main.querySelector('[role="tablist"]');
    const bar = document.querySelector('#header_main_container header').getBoundingClientRect();
    const logo = document.querySelector('[data-haloplus="sponsor"] img, [data-haloplus="sponsor"] [data-better-halo-original-img-src]');
    const l = logo ? logo.getBoundingClientRect() : null;
    const hit = l ? document.elementFromPoint(l.left + l.width / 2, l.top + l.height / 2) : null;
    const msg = document.querySelector('[data-testid="header_inbox_notification"]').getBoundingClientRect();
    const bell = document.getElementById('guide_anchor_header_alert').getBoundingClientRect();
    const search = document.querySelector('[data-haloplus="search-bar"]');
    const card = document.querySelector('[class*="CourseCard_cardContainer"]');
    return {
      compact: document.documentElement.hasAttribute('data-hp-home-compact'),
      header: vis(header),
      info: vis(info),
      tabs: vis(tabs),
      logo: l ? { w: Math.round(l.width), h: Math.round(l.height), inBar: l.top >= bar.top && l.bottom <= bar.bottom, between: l.left > msg.right && l.right < bell.left, top: !!hit && logo.parentElement.contains(hit), href: logo.closest('a') && logo.closest('a').getAttribute('href') } : null,
      under: search ? Math.round(search.getBoundingClientRect().top - bar.bottom) : null,
      bhRow: !!document.querySelector('.better-halo-tabs-wrapper > :not([role="tablist"])'),
      cards: card ? Math.round(card.getBoundingClientRect().top) : null,
      scroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
/** Halo redraws Student Home: watch every frame for a second, then what came back. */
async function redrawn(p, how, pre) {
  if (pre) await pre();
  await p.evaluate(() => {
    window.__hpFrames = [];
    const t0 = performance.now();
    const tick = () => {
      const h = document.querySelector('#Home--main > header');
      window.__hpFrames.push({ r: window.__hpRedraws, header: !!h && getComputedStyle(h).display !== 'none', logo: !!document.querySelector('[data-haloplus="sponsor"] img, [data-haloplus="sponsor"] [data-better-halo-original-img-src]') });
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await how();
  await sleep(1500);
  // The frames from Halo's redraw on (not the class page before it).
  const all = await p.evaluate(() => window.__hpFrames);
  const frames = all.filter((f) => f.r > all[0].r);
  await sleep(4500);
  const back = await p.evaluate(() => ({ past: !!document.querySelector('[data-haloplus="past-link"]'), week: !!document.querySelector('[data-haloplus="week"]'), strip: !!document.querySelector('[data-haloplus="week-strip"] .hp-sd'), cal: !!document.querySelector('[data-haloplus="home-calendar"]'), lines: document.querySelectorAll('[data-haloplus="class"]').length, redraws: window.__hpRedraws }));
  // Nothing redone once in place: Halo+'s own changes to the page over two quiet seconds.
  const quiet = await p.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        // Halo+'s own: its nodes coming or going, changes inside them, its marks on the page.
        const ours = (x) => !!x && x.nodeType === 1 && (x.hasAttribute('data-haloplus') || !!x.closest('[data-haloplus]'));
        const mo = new MutationObserver((rs) =>
          rs.forEach((r) => {
            if (r.type === 'attributes') n += r.attributeName.startsWith('data-hp') || (r.attributeName !== 'class' && ours(r.target)) ? 1 : 0;
            else n += ours(r.target) || [...r.addedNodes, ...r.removedNodes].some(ours) ? 1 : 0;
          }),
        );
        mo.observe(document.body, { childList: true, subtree: true, attributes: true });
        mo.observe(document.documentElement, { attributes: true });
        setTimeout(() => {
          mo.disconnect();
          res(n);
        }, 2000);
      }),
  );
  return { frames, back, quiet };
}

for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `header-${tag}`, bh: run.bh, bhDark: run.bh });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  try {
    await b.seed({ lastAttemptAt: new Date().toISOString() });
    for (const width of [1366, 1024]) {
      await b.store({ haloFeat: { off: ['homeheader'], at: new Date().toISOString() } });
      let p = await b.page('https://halo.gcu.edu/', { width, height: 900 });
      await sleep(3000);
      const before = await look(p);
      check(!before.compact && before.header && before.info && before.tabs, `${tag} ${width}: switched off: Halo's title, schedule lines and tabs as they are`);
      await p.mouse.move(3, 3);
      await p.screenshot({ path: `${OUT}/${tag}-${width}-1-before.png` });
      await p.close();
      await b.store({ haloFeat: { off: [], at: new Date().toISOString() } });
      p = await b.page('https://halo.gcu.edu/', { width, height: 900 });
      await until(async () => (await look(p)).logo !== null, 8000, 200);
      await sleep(1500);
      const after = await look(p);
      check(after.compact && !after.header && !after.info && !after.tabs, `${tag} ${width}: the title, the schedule lines and the tabs hidden`);
      check(after.logo && after.logo.inBar && after.logo.between && after.logo.top && after.logo.h >= 30 && after.logo.href === '#sponsor', `${tag} ${width}: the sponsor logo in the purple bar between MESSAGES and the bell, whole, uncovered, Halo's link (${JSON.stringify(after.logo)})`);
      // Better Halo keeps its own "Export Assignments" row there; Halo+ leaves Better Halo's features alone.
      check(after.under !== null && after.under <= (after.bhRow ? 80 : 40) && after.cards < before.cards - 120, `${tag} ${width}: search right under the bar (${after.under}px${after.bhRow ? ', under Better Halo\'s own Export row' : ''}), the class cards ${before.cards - after.cards}px higher`);
      check(after.scroll, `${tag} ${width}: no sideways scroll`);
      await p.mouse.move(3, 3);
      await p.screenshot({ path: `${OUT}/${tag}-${width}-2-after.png` });
      if (width === 1366) {
        // 0.12.4: "Past classes" after the class cards opens Halo's own Past Classes, and comes back.
        const pastNow = () => p.evaluate(() => {
          const l = document.querySelector('[data-haloplus="past-link"]');
          const sec = [...document.querySelectorAll('#Home--main > section')].pop();
          return { text: l ? l.querySelector('button').textContent.trim() : null, after: !!l && sec.nextElementSibling === l, cards: !!sec.querySelector('[class*="CourseCard_cardContainer"]'), past: /no past classes/i.test(sec.textContent), cal: (() => { const c = document.querySelector('[data-haloplus="home-calendar"]'); return !!c && !c.hidden; })(), mark: !!(l && l.querySelector('.hp-mark')) };
        });
        let pl = await pastNow();
        check(pl.text === 'Past classes (0)' && pl.after && pl.cards && pl.mark, `${tag}: "Past classes (0)" after the class cards, Halo's count (${JSON.stringify(pl)})`);
        await p.locator('[data-haloplus="past-link"] button').click();
        await sleep(800);
        pl = await pastNow();
        check(pl.past && !pl.cards && !pl.cal && pl.text === 'Current classes (6)', `${tag}: it opens Halo's own Past Classes, and reads "Current classes (6)" (${JSON.stringify(pl)})`);
        await p.locator('[data-haloplus="past-link"] button').click();
        await sleep(800);
        pl = await pastNow();
        check(pl.cards && pl.cal && pl.text === 'Past classes (0)', `${tag}: and back to the class cards and the calendar`);
        // Halo redraws Student Home without reloading.
        for (const [name, how, pre] of [
          ['My Classes', () => p.locator('#guide_anchor_header_myClasses').click()],
          ['back from a class page (the HALO logo)', () => p.locator('#guide_anchor_header_logo').click(), async () => {
            await p.evaluate((slug) => window.__hpGoClass(slug), b.fx.payload.classes[0].slugId);
            await sleep(1200);
          }],
        ]) {
          const r = await redrawn(p, how, pre);
          const flash = r.frames.filter((f) => f.header).length;
          const gone = r.frames.filter((f) => !f.logo).length;
          check(r.frames.length > 15 && flash === 0 && gone <= 1, `${tag}: ${name}: Halo redraws Student Home, and no frame shows the old header (${flash} of ${r.frames.length}) or loses the bar logo (${gone})`);
          const v = await look(p);
          check(v.compact && !v.header && !v.tabs && v.logo && v.logo.top && r.back.week && r.back.strip && r.back.cal && r.back.past && r.back.lines >= 6, `${tag}: ${name}: compact again, with This week, the week strip, the calendar, Past classes and the class lines (${JSON.stringify(r.back)})`);
          check(r.quiet === 0, `${tag}: ${name}: then Halo+ redoes nothing (${r.quiet} changes of its own in two quiet seconds)`);
        }
      }
      await p.close();
    }
    // Left alone: Halo's header in another shape; no logo; Free.
    for (const [name, shape, extra] of [['Halo’s header in another shape', 'odd', {}], ['no sponsor logo', 'none', {}], ['Free', 'halo', { tier: 'free' }]]) {
      b.bench.state.homeHeader = shape;
      await b.seed({ lastAttemptAt: new Date().toISOString(), ...extra });
      const p = await b.page('https://halo.gcu.edu/');
      await sleep(2500);
      const v = await look(p);
      check(!v.compact && v.header && v.tabs && !v.logo, `${tag}: ${name}: Student Home left as Halo has it`);
      await p.close();
    }
    b.bench.state.homeHeader = 'halo';
  } catch (e) {
    check(false, `${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
