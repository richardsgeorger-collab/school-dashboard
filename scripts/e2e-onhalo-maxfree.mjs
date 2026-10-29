// Free and Max on Halo (extension 0.12.12, George 2026-10-29), on Halo's stand-in with the demo student (made up):
// - everything Halo+ adds on Halo's pages works on Free (search on Student Home, the popup's switches);
// - an assignment an announcement changed: on its Halo page, "An announcement changed this due date · Unlock with
//   Max", the kind only, at most once per assignment; "Unlock with Max" goes to Max's checkout on haloplus.app (a stub
//   here, nothing is bought) with this Halo page as the way back; back with #haloplus-max=on: the mark comes off the
//   address, the line says Max is on while Halo+ (opened beside it, not focused) reads it, and the details replace it
//   once they come;
// - the free week's end: one note in Halo's alert look, shown once, "Keep Max · $0.99/mo" (checkout) or "Not now";
//   never on Max;
// - the popup on Free: one line, "Max: $0.99/mo", to the checkout.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-maxfree.mjs
import { topicPage } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/maxfree');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 900000);
const DAY = 86_400_000;
const box = (p) => p.evaluate(() => {
  const h = document.querySelector('[data-haloplus="box"]');
  return h ? { state: h.dataset.state, text: h.shadowRoot.querySelector('.b').innerText.replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ').trim(), n: document.querySelectorAll('[data-haloplus="box"]').length } : null;
});
const note = (p) => p.evaluate(() => {
  const h = document.querySelector('[data-haloplus="note"]');
  return h ? h.shadowRoot.querySelector('.n').innerText.replace(/\s+/g, ' ').trim() : null;
});
const RESET = { haloLockedBox: null, haloMaxOn: null, haloTrialNote: null };

for (const withBh of bhPath ? [false, true] : [false]) {
  const tag = withBh ? 'bh' : 'plain';
  const b = await openBench({ label: `maxfree-${tag}`, bh: withBh, pages: { '^/courses/[^/]+/course-units/[^/]+$': topicPage } });
  try {
    const fx = b.fx;
    // A topic with an open graded assignment the snapshot knows, due ahead.
    const now = Date.now();
    let pick = null;
    for (const c of fx.payload.classes)
      for (const a of c.assessments) {
        const it = fx.snap.items.find((i) => i.h === a.id && !i.done && !i.pa && Date.parse(i.due) > now + DAY);
        if (it && !pick) pick = { cls: c, a, it };
      }
    check(!!pick, `${tag}: an open assignment on a topic page (${pick?.cls.courseCode} ${pick?.a.title})`);
    const url = `https://halo.gcu.edu/courses/${pick.cls.slugId}/course-units/${pick.a.unitId}`;
    const strip = (s) => ({ ...s, items: s.items.map((i) => { const { xb, m, lk, x, xs, ...rest } = i; return { ...rest, x: 0 }; }) });
    const lockedSnap = (kinds) => { const s = strip(fx.snap); s.items = s.items.map((i) => (i.h === pick.a.id ? { ...i, lk: kinds } : i)); return s; };

    // Free gets Halo+ on Halo: search on Student Home.
    await b.seed({ tier: 'free', haloSnap: strip(fx.snap), ...RESET });
    let p = await b.page('https://halo.gcu.edu/');
    const search = await until(async () => ((await p.locator('[data-haloplus="search-bar"]').count()) === 1 ? true : null), 10000, 200).catch(() => false);
    check(search, `${tag}: Free: Halo+ on Halo's pages (search on Student Home)`);
    await p.close();

    // The heads-up, the kind only, with "Unlock with Max".
    await b.seed({ tier: 'free', haloSnap: lockedSnap(['due_date']), ...RESET });
    p = await b.page(url);
    let bx = await until(() => box(p), 10000, 200).catch(() => null);
    check(bx?.state === 'locked' && bx.text === 'Halo+ · An announcement changed this due date · Unlock with Max' && bx.n === 1, `${tag}: the heads-up on the assignment's page: "${bx?.text}"`);
    for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme });
      await sleep(300);
      const h = p.locator('[data-haloplus="box"]');
      await h.scrollIntoViewIfNeeded();
      const r = await h.evaluate((e) => { const x = e.getBoundingClientRect(); return { x: Math.max(0, x.x - 16), y: Math.max(0, x.y - 60), width: Math.min(900, x.width + 32), height: x.height + 90 }; });
      await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-1-heads-up-${scheme}.png`, clip: r });
    }
    let st = await b.read(['haloLockedBox']);
    check((st.haloLockedBox || []).includes(pick.a.id), `${tag}: remembered for that assignment`);
    await p.reload({ waitUntil: 'load' });
    await sleep(2500);
    bx = await box(p);
    check(!bx, `${tag}: once per assignment: not again on the next visit (${bx ? bx.text : 'nothing'})`);
    await p.close();

    // "Unlock with Max": to Max's checkout, back to this page.
    await b.seed({ tier: 'free', haloSnap: lockedSnap(['due_date', 'extra_step']), ...RESET });
    p = await b.page(url);
    bx = await until(() => box(p), 10000, 200).catch(() => null);
    check(bx?.text === 'Halo+ · An announcement changed this due date and added a step · Unlock with Max', `${tag}: both kinds: "${bx?.text}"`);
    await Promise.all([p.waitForURL(/^https:\/\/haloplus\.app\//, { timeout: 10000 }), p.evaluate(() => document.querySelector('[data-haloplus="box"]').shadowRoot.querySelector('.un').click())]);
    const went = new URL(p.url());
    const q = new URLSearchParams(went.hash.split('?')[1] || '');
    check(went.hash.startsWith('#/checkout?') && q.get('from') === 'halo' && q.get('back') === url, `${tag}: "Unlock with Max" opens Max's checkout, back to this page (${went.hash.slice(0, 60)}…)`);
    st = await b.read(['haloMaxOn']);
    check(st.haloMaxOn && st.haloMaxOn.key === pick.a.id && st.haloMaxOn.paid === false, `${tag}: the assignment is remembered for the way back`);
    await p.close();

    // Back from checkout: the mark comes off, "Max is on", Halo+ opens beside it to read.
    p = await b.page(`${url}#haloplus-max=on`);
    bx = await until(async () => { const x = await box(p); return x?.state === 'on' ? x : null; }, 10000, 200).catch(() => null);
    check(!new URL(p.url()).hash, `${tag}: the #haloplus-max=on mark is off the address (${p.url().slice(-40)})`);
    check(bx?.text === 'Halo+ · Max is on. Reading this announcement now…', `${tag}: "${bx?.text}"`);
    const beside = await until(async () => b.ctx.pages().find((x) => x.url().startsWith('https://haloplus.app/#/now?from=halo&via=max')) ?? null, 8000, 200).catch(() => null);
    check(!!beside, `${tag}: Halo+ opened beside it to read the announcement (${beside?.url() ?? b.ctx.pages().map((x) => x.url()).join(', ')})`);
    const front = await p.evaluate(() => document.visibilityState);
    check(front === 'visible', `${tag}: the Halo page stays in front (${front})`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-2-max-on.png`, clip: await p.locator('[data-haloplus="box"]').evaluate((e) => { const x = e.getBoundingClientRect(); return { x: Math.max(0, x.x - 16), y: Math.max(0, x.y - 60), width: Math.min(900, x.width + 32), height: x.height + 90 }; }) });
    // Read: the details take its place.
    const read = strip(fx.snap);
    const due = new Date(Date.parse(pick.it.due)).toISOString();
    read.items = read.items.map((i) => (i.h === pick.a.id ? { ...i, m: new Date(Date.parse(due) - 2 * DAY).toISOString(), x: 1, xb: ['Bring a calculator'] } : i));
    await b.store({ tier: 'max', haloSnap: { ...read, mx: 1 } });
    bx = await until(async () => { const x = await box(p); return x?.state === 'open' ? x : null; }, 10000, 200).catch(() => null);
    check(!!bx && /^Halo\+ · Due date moved to .+ \(was .+\) · Bring a calculator$/.test(bx.text), `${tag}: the details, right there: "${bx?.text}"`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-3-details.png`, clip: await p.locator('[data-haloplus="box"]').evaluate((e) => { const x = e.getBoundingClientRect(); return { x: Math.max(0, x.x - 16), y: Math.max(0, x.y - 60), width: Math.min(900, x.width + 32), height: x.height + 90 }; }) });
    await p.close();
    if (beside) await beside.close().catch(() => undefined);

    // On Max: no heads-up.
    await b.seed({ tier: 'max', haloSnap: { ...lockedSnap(['due_date']), mx: 1 }, ...RESET });
    p = await b.page(url);
    await sleep(2500);
    check(!(await box(p)), `${tag}: on Max, no heads-up`);
    await p.close();

    // The free week's end: one note, once.
    const te = new Date(now - 2 * DAY).toISOString();
    for (const scheme of ['light', 'dark']) {
      await b.seed({ tier: 'free', haloSnap: { ...strip(fx.snap), te }, ...RESET });
      p = await b.page('https://halo.gcu.edu/', { scheme });
      const n = await until(() => note(p), 10000, 200).catch(() => null);
      if (scheme === 'light') check(n === 'Your free week of Max is over Halo+ on Halo stays free. Max reads every announcement for you and syncs on its own. Keep Max · $0.99/mo Not now', `${tag}: the note: "${n}"`);
      await sleep(400);
      await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-4-trial-note-${scheme}.png` });
      const clicks = await p.evaluate(() => document.elementFromPoint(40, 300)?.closest('[data-haloplus]') === null);
      check(clicks, `${tag} ${scheme}: Halo's page is still Halo's under and around it`);
      if (scheme === 'light') {
        await p.evaluate(() => document.querySelector('[data-haloplus="note"]').shadowRoot.querySelector('.x').click());
        await sleep(400);
        check(!(await note(p)), `${tag}: "Not now" closes it`);
        await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
        await sleep(2500);
        check(!(await note(p)), `${tag}: shown once: not on the next page`);
      } else {
        await Promise.all([p.waitForURL(/^https:\/\/haloplus\.app\//, { timeout: 10000 }), p.evaluate(() => document.querySelector('[data-haloplus="note"]').shadowRoot.querySelector('.k').click())]);
        check(new URL(p.url()).hash.startsWith('#/checkout?from=halo&back='), `${tag}: "Keep Max · $0.99/mo" opens Max's checkout`);
      }
      await p.close();
    }
    await b.seed({ tier: 'max', haloSnap: { ...strip(fx.snap), mx: 1, te }, ...RESET });
    p = await b.page('https://halo.gcu.edu/');
    await sleep(2500);
    check(!(await note(p)), `${tag}: never on Max`);
    await p.close();

    // The popup on Free: one line to the checkout, and the switches.
    if (!withBh) {
      const extId = new URL(b.worker.url()).host;
      await b.seed({ tier: 'free', haloSnap: strip(fx.snap), ...RESET });
      p = await b.ctx.newPage();
      await p.setViewportSize({ width: 380, height: 640 });
      await p.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
      await sleep(800);
      const pop = await p.evaluate(() => ({ shown: !document.getElementById('plus').hidden, text: document.getElementById('plus').innerText.trim(), href: document.getElementById('upgrade').getAttribute('href'), plan: document.getElementById('plan').textContent, feats: !document.getElementById('feats').hidden }));
      check(pop.shown && pop.text === 'Max: $0.99/mo' && pop.href === 'https://haloplus.app/#/checkout?from=popup', `${tag}: popup on Free: "${pop.text}" → ${pop.href}`);
      check(pop.feats, `${tag}: popup on Free: the on-Halo switches`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-5-popup-free.png`, fullPage: true });
      await b.store({ tier: 'max' });
      await p.reload({ waitUntil: 'load' });
      await sleep(800);
      const popMax = await p.evaluate(() => ({ shown: !document.getElementById('plus').hidden, plan: document.getElementById('plan').textContent }));
      check(!popMax.shown && popMax.plan === 'Max', `${tag}: popup on Max: no price line, plan "Max"`);
      await b.store({ tier: 'plus' });
      await p.reload({ waitUntil: 'load' });
      await sleep(800);
      check((await p.evaluate(() => document.getElementById('plan').textContent)) === 'Max', `${tag}: an old Plus account reads as Max`);
      await p.close();
    }
  } catch (e) {
    check(false, `${tag}: ${String(e.stack ?? e).slice(0, 400)}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
