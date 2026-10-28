// Feature 0 (extension 0.12.0): search all your classes, on Halo's stand-in pages with the demo student (Maya Torres,
// made up). The field sits under Halo's class tabs on Student Home; Ctrl+K (⌘K on a Mac) opens the same search on any
// Halo page; "topic 3 quiz" finds what the rules say it should and Enter opens Halo's own address for it. And where it
// must show nothing: on Free, with its switch off, with "Show Halo+ on Halo pages" off, with no index yet, and Ctrl+K
// typed in a text box or Halo's editor (its own Ctrl+K inserts a link). Better Halo on and off, light and its dark
// theme, 1366px and 1024px wide.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-search.mjs
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/search');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 900000);
const L = (() => {
  const c = { URL, Intl, Date };
  c.globalThis = c;
  runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), c);
  return c.HaloPlusOnLogic;
})();

const runs = [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: false }, { bh: true, dark: true }] : [])];
for (const run of runs) {
  const tag = run.bh ? (run.dark ? 'bh-dark' : 'bh') : 'plain';
  const b = await openBench({ label: `search-${tag}`, bh: run.bh, bhDark: run.dark });
  try {
    await b.seed();
    const fx = b.fx;
    const rows = fx.index.rows.filter((r) => r.href).map((r) => ({ ...r, cc: fx.index.classes[r.c].cc, code: fx.index.classes[r.c].code }));

    // Before: Halo+ 0.12.0 with the search switched off (what Halo looks like with Halo+ 0.11).
    await b.store({ haloFeat: { off: ['search'], at: new Date().toISOString() } });
    let p = await b.page('https://halo.gcu.edu/');
    await sleep(2500);
    check((await p.locator('[data-haloplus="search-bar"]').count()) === 0, `${tag}: switched off, no search field`);
    await p.screenshot({ path: `${OUT}/${tag}-1-before.png` });
    await p.close();

    // After.
    await b.store({ haloFeat: { off: [], at: new Date().toISOString() } });
    p = await b.page('https://halo.gcu.edu/');
    const bar = await until(async () => (await p.locator('[data-haloplus="search-bar"]').count()) === 1, 10000, 200);
    check(bar, `${tag}: the search field is on Student Home`);
    const placed = await p.evaluate(() => {
      const h = document.querySelector('[data-haloplus="search-bar"]');
      const prev = h && h.previousElementSibling;
      return !!prev && (prev.matches('[role="tablist"]') || prev.classList.contains('better-halo-tabs-wrapper'));
    });
    check(placed, `${tag}: right under Halo's class tabs${run.bh ? " (Better Halo's tab row)" : ''}`);
    const mac = await p.evaluate(() => /Mac/.test(navigator.platform));
    const mod = mac ? 'Meta' : 'Control';
    await p.locator('[data-haloplus="search-bar"] input').click();
    await p.keyboard.type('topic 3 quiz', { delay: 15 });
    await sleep(300);
    const want = L.search(rows, 'topic 3 quiz', Date.now(), 8);
    const got = await p.locator('[data-haloplus="search-bar"] .row .t').allInnerTexts();
    check(want.length > 0 && got.length === want.length && got[0] === want[0].title, `${tag}: "topic 3 quiz" lists what the rules say, first "${got[0]}" (${got.length})`);
    check(want[0] && want[0].kind === 'quiz', `${tag}: and the first is a quiz`);
    const meta = await p.locator('[data-haloplus="search-bar"] .row .m').first().innerText();
    check(/·\s*Quiz/.test(meta), `${tag}: with its class and kind ("${meta}")`);
    await p.screenshot({ path: `${OUT}/${tag}-2-home-results.png` });
    await Promise.all([p.waitForURL((u) => u.href.includes(want[0].href.split('?')[0]), { timeout: 10000 }), p.keyboard.press('Enter')]);
    check(new URL(p.url()).pathname + new URL(p.url()).search === want[0].href, `${tag}: Enter opens Halo's own address (${want[0].href})`);
    await p.close();

    // Ctrl+K on another page; empty shows what is coming up; Esc closes; a second search opens an assignment.
    const cls = fx.index.classes[0];
    p = await b.page(`https://halo.gcu.edu/courses/${cls.slug}`);
    await sleep(1500);
    await p.keyboard.press(`${mod}+k`);
    const pal = await until(async () => (await p.locator('[data-haloplus="search-palette"]').count()) === 1, 5000, 100);
    check(pal, `${tag}: ${mod}+K opens the search on a class page`);
    const focused = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-haloplus'));
    check(focused === 'search-palette', `${tag}: with the cursor in it`);
    const soon = await p.locator('[data-haloplus="search-palette"] .head').count();
    check(soon <= 1, `${tag}: nothing typed: at most a short "Coming up" list`);
    await p.screenshot({ path: `${OUT}/${tag}-3-ctrl-k-empty.png` });
    await p.keyboard.press('Escape');
    await sleep(200);
    check((await p.locator('[data-haloplus="search-palette"]').count()) === 0, `${tag}: Esc closes it`);
    await p.keyboard.press(`${mod}+k`);
    await sleep(200);
    const target = rows.find((r) => r.kind === 'assignment' && r.href.includes('#assignment-submission/'));
    await p.keyboard.type(target.title, { delay: 10 });
    await sleep(300);
    await p.screenshot({ path: `${OUT}/${tag}-4-ctrl-k-results.png` });
    const first = (await p.locator('[data-haloplus="search-palette"] .row .t').allInnerTexts())[0];
    check(first === target.title, `${tag}: typing an assignment's title finds it first ("${first}")`);
    await Promise.all([p.waitForURL((u) => u.href.includes('#assignment-submission/'), { timeout: 10000 }), p.keyboard.press('Enter')]);
    check(p.url().endsWith(target.href), `${tag}: and opens its submission view's address (${target.href})`);
    await p.close();

    // Ctrl+K inside a text box or an editor stays theirs.
    p = await b.page(`https://halo.gcu.edu/courses/${cls.slug}`);
    await sleep(1200);
    await p.evaluate(() => {
      const ed = document.createElement('div');
      ed.className = 'tiptap ProseMirror';
      ed.contentEditable = 'true';
      ed.id = 'ed';
      ed.textContent = 'my post';
      document.querySelector('main').prepend(ed);
    });
    await p.locator('#ed').click();
    await p.keyboard.press(`${mod}+k`);
    await sleep(400);
    check((await p.locator('[data-haloplus="search-palette"]').count()) === 0, `${tag}: ${mod}+K in Halo's editor is left to the editor`);
    await p.close();

    // 1024px: the field fits inside the content column.
    p = await b.page('https://halo.gcu.edu/', { width: 1024 });
    await until(async () => (await p.locator('[data-haloplus="search-bar"]').count()) === 1, 8000, 200);
    const fit = await p.evaluate(() => {
      const h = document.querySelector('[data-haloplus="search-bar"]');
      const main = document.getElementById('Home--main');
      const f = h.shadowRoot.querySelector('.field').getBoundingClientRect();
      const m = main.getBoundingClientRect();
      return f.left >= m.left - 1 && f.right <= m.right + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    check(fit, `${tag}: at 1024px it fits, no sideways scroll`);
    await p.screenshot({ path: `${OUT}/${tag}-5-1024.png` });
    await p.close();

    // Show nothing: Free, Show-on-Halo off, no index.
    for (const [name, extra] of [
      ['Free', { tier: 'free' }],
      ['"Show Halo+ on Halo pages" off', { haloUiOn: { on: false, at: new Date(Date.now() + 1000).toISOString() } }],
      ['no index yet', { haloIndex: null }],
    ]) {
      await b.seed(extra);
      p = await b.page('https://halo.gcu.edu/');
      await sleep(2500);
      await p.keyboard.press(`${mod}+k`);
      await sleep(400);
      const n = await p.evaluate(() => document.querySelectorAll('[data-haloplus^="search"]').length);
      check(n === 0, `${tag}: ${name}: no field and no ${mod}+K`);
      await p.close();
    }
  } catch (e) {
    check(false, `${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
