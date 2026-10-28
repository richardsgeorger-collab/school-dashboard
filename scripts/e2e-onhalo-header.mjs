// The compact Student Home header (extension 0.12.2) on Halo's Student Home stand-in (its header, the sponsor logo's
// place with a labelled stand-in image, Halo's two schedule lines), with the demo student Maya Torres (made up): the
// title and the sponsor logo on one row, the logo whole and uncovered, Halo's two lines hidden, "View your full
// schedule" beside the title with Halo's own link, the class cards higher; at full width and 1024px, plain and Better
// Halo dark. Left alone: Halo's header in another shape, no logo, switched off, Free.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-header.mjs
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/header');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 900000);

const look = (p) =>
  p.evaluate(() => {
    const main = document.getElementById('Home--main');
    const header = main.querySelector(':scope > header');
    const h1 = header.querySelector('h1').getBoundingClientRect();
    const img = header.querySelector('img, [data-better-halo-original-img-src]');
    const l = img ? img.getBoundingClientRect() : null;
    const info = [...main.children].find((e) => e !== header && e.querySelector && e.querySelector('a[href*="classschedule"]') && !e.closest('[data-haloplus]') && e.tagName === 'DIV');
    const link = main.querySelector('[data-haloplus="schedule-link"]');
    const card = document.querySelector('[class*="CourseCard_cardContainer"]');
    const hit0 = l ? document.elementFromPoint(l.left + l.width / 2, l.top + l.height / 2) : null;
    const hit = hit0 && img.contains(hit0) ? img : hit0;
    return {
      compact: main.hasAttribute('data-hp-compact'),
      oneRow: !!l && l.top < h1.bottom && l.bottom > h1.top,
      logo: l ? { w: Math.round(l.width), h: Math.round(l.height), shown: getComputedStyle(img).display !== 'none' && getComputedStyle(img).visibility !== 'hidden' && l.width > 20, top: hit === img } : null,
      infoShown: !!info && getComputedStyle(info).display !== 'none',
      link: link ? { text: link.textContent.trim(), href: link.getAttribute('href'), beside: Math.abs(link.getBoundingClientRect().top - h1.top) < 30 } : null,
      cards: card ? Math.round(card.getBoundingClientRect().top) : null,
      scroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });

for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `header-${tag}`, bh: run.bh, bhDark: run.bh });
  try {
    await b.seed({ lastAttemptAt: new Date().toISOString() });
    for (const width of [1366, 1024]) {
      await b.store({ haloFeat: { off: ['homeheader'], at: new Date().toISOString() } });
      let p = await b.page('https://halo.gcu.edu/', { width, height: 900 });
      await sleep(2500);
      const before = await look(p);
      check(!before.compact && before.infoShown, `${tag} ${width}: switched off: Halo's header as it is`);
      await p.mouse.move(3, 3);
      await p.screenshot({ path: `${OUT}/${tag}-${width}-1-before.png` });
      await p.close();
      await b.store({ haloFeat: { off: [], at: new Date().toISOString() } });
      p = await b.page('https://halo.gcu.edu/', { width, height: 900 });
      await until(async () => (await look(p)).compact, 8000, 200);
      await sleep(1200);
      const after = await look(p);
      check(after.compact && after.oneRow, `${tag} ${width}: the title and the sponsor logo on one row`);
      check(after.logo && after.logo.shown && after.logo.top && after.logo.h >= 30, `${tag} ${width}: the sponsor logo whole and uncovered (${after.logo ? `${after.logo.w}×${after.logo.h}` : 'none'})`);
      check(!after.infoShown, `${tag} ${width}: Halo's two schedule lines hidden`);
      check(after.link && after.link.text === 'View your full schedule' && after.link.href === 'https://classschedule.gcu.edu/' && after.link.beside, `${tag} ${width}: "View your full schedule" beside the title, Halo's own link (${JSON.stringify(after.link)})`);
      check(after.cards < before.cards - 30, `${tag} ${width}: the class cards ${before.cards - after.cards}px higher`);
      check(after.scroll, `${tag} ${width}: no sideways scroll`);
      await p.mouse.move(3, 3);
      await p.screenshot({ path: `${OUT}/${tag}-${width}-2-after.png` });
      await p.close();
    }
    // Left alone: Halo's header in another shape; no logo; Free.
    for (const [name, shape, extra] of [['Halo’s header in another shape', 'odd', {}], ['no sponsor logo', 'none', {}], ['Free', 'halo', { tier: 'free' }]]) {
      b.bench.state.homeHeader = shape;
      await b.seed({ lastAttemptAt: new Date().toISOString(), ...extra });
      const p = await b.page('https://halo.gcu.edu/');
      await sleep(2500);
      const v = await look(p);
      check(!v.compact && !v.link && (shape === 'none' || v.infoShown), `${tag}: ${name}: Halo's header left as it is`);
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
