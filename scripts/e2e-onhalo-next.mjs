// Feature 6 (extension 0.12.0): the Halo+ line on each Student Home class card links straight to the class's next
// thing due ("Next: Topic 3 DQ 1"), at Halo's own address for it. On every plan since 0.12.12 (Free too), not with its
// switch off, and not for a class whose next item has no address Halo+ is sure of. On Halo's stand-in with the demo
// student (Maya Torres, made up); Better Halo on and off.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-next.mjs
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/next');
const { check, passed } = checker(BROWSER);
// This test is about the Halo+ class line's "Next"; Halo+'s class cards (0.12.5) replace that line, so they are off here
// (scripts/e2e-onhalo-cards.mjs tests their NEXT box).
const CARDS_OFF = () => ({ off: ['homecards'], at: new Date().toISOString() });
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 900000);
const M = (() => {
  const c = { URL, Intl, Date };
  c.globalThis = c;
  runInNewContext(readFileSync('extension/halo-model.js', 'utf8'), c);
  return c.HaloPlusModel;
})();
const lines = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('[data-haloplus="class"]')].map((h) => {
      const card = h.closest('[class*="CourseCard_cardContainer"]');
      const a = h.shadowRoot.querySelector('.nx');
      return { slug: card ? new URL(card.querySelector('a[href^="/courses/"]').href).pathname.split('/')[2] : null, text: h.shadowRoot.textContent.replace(/\s+/g, ' ').trim(), next: a ? a.textContent : null, href: a ? a.getAttribute('href') : null };
    }),
  );

for (const withBh of bhPath ? [false, true] : [false]) {
  const tag = withBh ? 'bh' : 'plain';
  const b = await openBench({ label: `next-${tag}`, bh: withBh });
  try {
    const fx = b.fx;
    const view = M.merge(fx.snap, null, null);
    const now = Date.now();
    const want = {};
    for (const c of view.classes) {
      const nx = M.nextFor(view, c, now);
      const row = nx && fx.index.rows.find((r) => r.id === nx.h && r.href);
      want[c.slug] = nx && row && M.nextName(nx) ? { name: `Next: ${M.nextName(nx)}`, href: row.href } : null;
    }
    // Before: the line as it was in 0.11 ("Next" switched off; Free has it since 0.12.12).
    await b.seed({ tier: 'free', haloFeat: { off: ['next', 'homecards'], at: new Date().toISOString() } });
    let p = await b.page('https://halo.gcu.edu/');
    await until(async () => (await lines(p)).length >= 6, 10000, 200);
    let ls = await lines(p);
    check(ls.length >= 6 && ls.every((l) => !l.next), `${tag}: "Next" switched off: the class lines, no "Next"`);
    await p.screenshot({ path: `${OUT}/${tag}-1-before-free.png` });
    await p.close();

    await b.seed({ haloFeat: CARDS_OFF() });
    p = await b.page('https://halo.gcu.edu/');
    await until(async () => (await lines(p)).some((l) => l.next), 10000, 200);
    await until(async () => (await p.locator('[data-haloplus="search-bar"]').count()) === 1, 5000, 200);
    ls = await lines(p);
    for (const l of ls) {
      const w = want[l.slug];
      if (w) check(l.next === w.name && l.href === w.href, `${tag}: ${l.slug.slice(0, 8)}: "${l.next}" → ${l.href}`);
      else check(!l.next, `${tag}: ${l.slug.slice(0, 8)}: nothing due ahead, no "Next" ("${l.text}")`);
    }
    check(Object.values(want).some(Boolean), `${tag}: at least one class has a next item`);
    await p.screenshot({ path: `${OUT}/${tag}-2-after.png` });
    const first = ls.find((l) => l.next);
    await Promise.all([
      p.waitForURL((u) => u.href.includes(first.href.split('#')[0].split('?')[0]), { timeout: 10000 }),
      p.evaluate((slug) => {
        const card = [...document.querySelectorAll('[class*="CourseCard_cardContainer"]')].find((c) => c.querySelector(`a[href="/courses/${slug}"]`));
        card.querySelector('[data-haloplus="class"]').shadowRoot.querySelector('.nx').click();
      }, first.slug),
    ]);
    const u = new URL(p.url());
    check(u.pathname + u.search + u.hash === first.href, `${tag}: clicking "Next" opens it on Halo (${first.href})`);
    await p.close();

    // Switched off: no "Next". An item with no address Halo+ is sure of: none for that class.
    await b.store({ haloFeat: { off: ['next', 'homecards'], at: new Date().toISOString() } });
    p = await b.page('https://halo.gcu.edu/');
    await until(async () => (await lines(p)).length >= 6, 10000, 200);
    await sleep(800);
    ls = await lines(p);
    check(ls.every((l) => !l.next), `${tag}: switched off: no "Next" anywhere`);
    await p.close();
    const slug = first.slug;
    const idx = JSON.parse(JSON.stringify(fx.index));
    const nx = M.nextFor(view, view.classes.find((c) => c.slug === slug), now);
    for (const r of idx.rows) if (r.id === nx.h) r.href = null;
    await b.seed({ haloIndex: idx, haloFeat: CARDS_OFF() });
    p = await b.page('https://halo.gcu.edu/');
    await until(async () => (await lines(p)).length >= 6, 10000, 200);
    await sleep(800);
    ls = await lines(p);
    check(!ls.find((l) => l.slug === slug).next && ls.some((l) => l.next), `${tag}: no sure address for ${slug.slice(0, 8)}'s next item: no "Next" there, the others keep theirs`);
    // 1024px: the line still fits one line (later parts drop, never a cut title).
    await p.setViewportSize({ width: 1024, height: 900 });
    await sleep(1200);
    const fits = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].every((h) => { const l = h.shadowRoot.querySelector('.l'); return l.scrollWidth <= l.clientWidth + 1 || l.hasAttribute('data-wrap'); }));
    check(fits, `${tag}: at 1024px every line fits`);
    await p.screenshot({ path: `${OUT}/${tag}-3-1024.png` });
    await p.close();
  } catch (e) {
    check(false, `${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
