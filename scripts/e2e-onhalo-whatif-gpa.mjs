// What-if from the class card, the clearer Gradebook button, and the GPA on Student Home (extension 0.12.18, George
// 2026-11-03), on Halo's page stand-ins with the made-up demo student Maya Torres, nothing sent anywhere real:
// - each class card: a "What if?" link right after the grade (Halo's link colour, the Halo+ mark); it opens a small
//   panel there: the grade big (Halo's own, from Halo's GradeOverview, exact here, so no "Estimate"), the next big
//   item in plain words, a slider for what moves the grade, "Everything else" in one; a slider moves the grade; Esc
//   closes it; "Open full what-if" goes to the Gradebook with its what-if on;
// - the Gradebook: "What if? Try scores", a clear button by Halo's total;
// - "GPA 3.xx" in the This week bar beside Calendar: the panel's classes, letters and credits give exactly that GPA
//   (GCU's points); a credit change is kept and sent to the account (sync-drop, { gpa: { slug, credits } }) and moves
//   the GPA; a what-if letter moves it and is never saved; "GPA so far" gives the projected cumulative GPA and is sent;
// - each switch off: its part gone.
// Plain light, plain dark, and Better Halo dark; 1366 and 1024 wide, and 420 (a phone-width window) for the panels.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-whatif-gpa.mjs
import { gradeOverviewGateway, gradebookPage, gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/whatif-gpa');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1800000);
const POINTS = { A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, D: 1, F: 0 };

/** The panel's text and parts, read through its shadow root. */
const wiPanel = (p) =>
  p.evaluate(() => {
    const h = document.querySelector('[data-haloplus="wi-panel"]');
    const r = h && h.shadowRoot;
    if (!r || !r.querySelector('.p')) return null;
    const b = r.querySelector('.p').getBoundingClientRect();
    return {
      big: (r.querySelector('.big b') || {}).textContent || null,
      pct: (r.querySelector('.big span') || {}).textContent || null,
      est: !!r.querySelector('.est'),
      sub: (r.querySelector('.sub') || {}).textContent || '',
      next: ((r.querySelector('.next') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      sliders: [...r.querySelectorAll('input[type=range]')].map((i) => i.dataset.id),
      full: (r.querySelector('[data-full]') || {}).getAttribute?.('href') || null,
      msg: (r.querySelector('.msg') || {}).textContent || null,
      w: Math.round(b.width),
      left: Math.round(b.left),
      right: Math.round(b.right),
      vw: innerWidth,
    };
  });
const gpaBar = (p) =>
  p.evaluate(() => {
    const h = document.querySelector('[data-haloplus="week"]');
    const g = h && h.shadowRoot && h.shadowRoot.querySelector('[data-gpa]');
    const cal = h && h.shadowRoot && h.shadowRoot.querySelector('[data-cal]');
    return g ? { text: g.textContent.trim(), beside: !!cal && g.nextElementSibling === cal } : null;
  });
const gpaPanel = (p) =>
  p.evaluate(() => {
    const h = document.querySelector('[data-haloplus="gpa-panel"]');
    const r = h && h.shadowRoot;
    if (!r || !r.querySelector('.p')) return null;
    const b = r.querySelector('.p').getBoundingClientRect();
    return {
      big: r.querySelector('.big b').textContent,
      tag: !!r.querySelector('.tag'),
      rows: [...r.querySelectorAll('tbody tr')].map((t) => ({ slug: t.dataset.slug, code: t.querySelector('td.c b').textContent, letter: (t.querySelector('.l') || {}).textContent || null, credits: Number(t.querySelector('[data-cr]').value), tried: t.hasAttribute('data-tried') })),
      cum: (r.querySelector('.cum') || {}).textContent || null,
      foot: r.querySelector('.ft span').textContent,
      left: Math.round(b.left),
      right: Math.round(b.right),
      vw: innerWidth,
    };
  });
const gpaFrom = (rows) => {
  const n = rows.filter((r) => r.letter && r.letter in POINTS && r.credits > 0);
  const cr = n.reduce((a, r) => a + r.credits, 0);
  return cr ? (Math.round((n.reduce((a, r) => a + r.credits * POINTS[r.letter], 0) / cr) * 100) / 100).toFixed(2) : '–';
};

for (const run of [{ bh: false, dark: false }, { bh: false, dark: true }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = `${run.bh ? 'bh' : 'plain'}-${run.dark ? 'dark' : 'light'}`;
  const scheme = run.dark ? 'dark' : 'light';
  const b = await openBench({ label: `whatif-gpa-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/student/gradebook/?$': gradebookPage } });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx), gradeOverviewGateway(b.fx));
  b.bench.state.grades = {};
  // What reaches the account.
  const drops = [];
  await b.ctx.route('**/functions/v1/sync-drop', async (r) => {
    let body = null;
    try {
      body = JSON.parse(r.request().postData() || 'null');
    } catch {
      /* not JSON */
    }
    drops.push(body);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true }) });
  });
  try {
    const fx = b.fx;
    await b.seed({ lastAttemptAt: new Date().toISOString(), haloWiOn: false, haloGpa: null, haloWeekOpen: { open: false, at: new Date().toISOString() } });

    for (const width of [1366, 1024]) {
      let p = await b.page('https://halo.gcu.edu/', { width, height: 1100, scheme });
      await until(async () => (await p.locator('[data-haloplus="wi-link"]').count()) >= 6, 15000, 200);
      await sleep(800);
      // ---- the link after each card's grade ----
      const links = await p.evaluate(() =>
        [...document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')].map((c) => {
          const l = c.querySelector('[data-haloplus="wi-link"]');
          const g = c.querySelector('[data-haloplus="card-grade"], .better-halo-grade-indicator');
          const btn = l && l.shadowRoot.querySelector('button');
          return { grade: !!g, link: !!l, after: !!l && l.previousElementSibling === g, mark: !!(btn && btn.querySelector('svg')), text: btn ? btn.textContent.trim() : null, color: btn ? getComputedStyle(btn).color : null, ink: getComputedStyle(c).color };
        }),
      );
      const withGrade = links.filter((x) => x.grade);
      check(withGrade.length >= 6 && withGrade.every((x) => x.link && x.after && x.mark && x.text === 'What if?'), `${tag} ${width}: "What if?" with the Halo+ mark right after every card's grade (${withGrade.filter((x) => x.after).length} of ${withGrade.length})`);
      check(withGrade.every((x) => x.color && x.color !== x.ink), `${tag} ${width}: in Halo's link colour, not the card's text colour (${withGrade[0] && withGrade[0].color})`);
      if (width === 1366) await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-1-cards.png`, clip: { x: 0, y: 0, width: 1366, height: 1100 } });

      // ---- the panel ----
      const card = p.locator('#Home--main [class*="CourseCard_cardContainer"]').filter({ has: p.locator('[data-haloplus="wi-link"]') }).first();
      const slug = decodeURIComponent(/\/courses\/([^/?#]+)/.exec(await card.locator('a[href^="/courses/"]').first().getAttribute('href'))[1]);
      await card.locator('[data-haloplus="wi-link"] >> button').click();
      await until(async () => { const w = await wiPanel(p); return w && w.big ? w : null; }, 10000, 150);
      const w0 = await wiPanel(p);
      const go = gradeOverviewGateway(fx).GradeOverview({ courseClassSlugId: slug }, b.bench.state).gradeOverview[0].finalGrade;
      const pct = go.maxPoints ? `${(Math.round((go.finalPoints / go.maxPoints) * 1000) / 10).toFixed(1)}%` : '–';
      check(w0 && w0.big === go.gradeValue && w0.pct === pct && !w0.est, `${tag} ${width}: the panel opens there with Halo's own grade, big: ${w0 && w0.big} ${w0 && w0.pct} (Halo ${go.gradeValue} ${pct}), exact, no "Estimate"`);
      check(w0 && (/^On .+ \(.+\), you need \d+(\.\d)?% for an? [A-F][+-]?/.test(w0.next) || /can’t change your letter/.test(w0.next) || w0.sliders.length === 0), `${tag} ${width}: the next big item in plain words: "${w0 && w0.next}"`);
      check(w0 && w0.sliders.length >= 1 && w0.full === `/courses/${encodeURIComponent(slug)}/student/gradebook`, `${tag} ${width}: sliders for what moves the grade (${w0 && w0.sliders.filter((s) => s !== '__small').length}), "Everything else" ${w0 && w0.sliders.includes('__small') ? 'in one' : 'none here'}, and "Open full what-if" to the Gradebook`);
      check(w0 && w0.left >= 0 && w0.right <= w0.vw, `${tag} ${width}: inside the window (${w0 && `${w0.left}–${w0.right} of ${w0.vw}`})`);
      if (w0 && w0.sliders.length) {
        const before = `${w0.big} ${w0.pct}`;
        await p.evaluate(() => {
          const i = document.querySelector('[data-haloplus="wi-panel"]').shadowRoot.querySelector('input[type=range]');
          i.value = '0';
          i.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await sleep(300);
        const w1 = await wiPanel(p);
        check(w1 && `${w1.big} ${w1.pct}` !== before && /Halo now:/.test(w1.sub), `${tag} ${width}: a slider moves the grade (${before} → ${w1 && `${w1.big} ${w1.pct}`}), Halo's own beside it`);
        // The letter in the next-item line fills that item's slider.
        const tryBtn = await p.evaluate(() => !!document.querySelector('[data-haloplus="wi-panel"]').shadowRoot.querySelector('[data-try]'));
        if (tryBtn) {
          await p.evaluate(() => document.querySelector('[data-haloplus="wi-panel"]').shadowRoot.querySelector('[data-try]').click());
          await sleep(300);
        }
        if (width === 1366) await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-2-card-whatif.png` });
      }
      await p.keyboard.press('Escape');
      await sleep(200);
      check(!(await wiPanel(p)), `${tag} ${width}: Esc closes it`);

      // ---- the GPA ----
      const bar = await until(() => gpaBar(p), 10000, 200);
      check(bar && /^GPA \d\.\d\d$/.test(bar.text) && bar.beside, `${tag} ${width}: "${bar && bar.text}" in the This week bar, right before "Calendar"`);
      await p.evaluate(() => document.querySelector('[data-haloplus="week"]').shadowRoot.querySelector('[data-gpa]').click());
      const g0 = await until(() => gpaPanel(p), 8000, 150);
      check(g0 && g0.rows.length >= 6 && g0.big === gpaFrom(g0.rows) && `GPA ${g0.big}` === bar.text, `${tag} ${width}: the panel: ${g0 && g0.rows.length} classes with letter and credits, and exactly their GPA, ${g0 && g0.big} (GCU's points), the same as the bar`);
      check(g0 && g0.left >= 0 && g0.right <= g0.vw, `${tag} ${width}: the GPA panel inside the window`);
      if (width === 1366) {
        // A credit change: kept, sent to the account, and in the GPA.
        const row = g0.rows.find((r) => r.letter && r.letter !== g0.rows[0].letter) || g0.rows[0];
        const d0 = drops.length;
        await p.evaluate(([s]) => {
          const t = [...document.querySelector('[data-haloplus="gpa-panel"]').shadowRoot.querySelectorAll('tbody tr')].find((x) => x.dataset.slug === s);
          const i = t.querySelector('[data-cr]');
          i.value = '5';
          i.dispatchEvent(new Event('change', { bubbles: true }));
        }, [row.slug]);
        await until(async () => drops.slice(d0).some((d) => d && d.gpa && d.gpa.slug === row.slug && d.gpa.credits === 5), 6000, 150);
        await sleep(300);
        const g1 = await gpaPanel(p);
        const kept = (await b.read(['haloGpa'])).haloGpa;
        check(drops.slice(d0).some((d) => d && d.gpa && d.gpa.slug === row.slug && d.gpa.credits === 5) && kept && kept.cr && kept.cr[row.slug] === 5, `${tag}: ${row.code} set to 5 credits: kept on this computer and sent to the account`);
        check(g1 && g1.big === gpaFrom(g1.rows) && g1.rows.find((r) => r.slug === row.slug).credits === 5 && /Saved to your Halo\+ account/.test(g1.foot), `${tag}: the GPA moves with it (${g0.big} → ${g1 && g1.big}): "${g1 && g1.foot}"`);
        await until(async () => (await gpaBar(p))?.text === `GPA ${g1.big}`, 5000, 150);
        check((await gpaBar(p))?.text === `GPA ${g1.big}`, `${tag}: the bar says the same (${(await gpaBar(p))?.text})`);
        // A what-if letter: moves the GPA, marked, never saved.
        const d1 = drops.length;
        await p.evaluate(([s]) => {
          const t = [...document.querySelector('[data-haloplus="gpa-panel"]').shadowRoot.querySelectorAll('tbody tr')].find((x) => x.dataset.slug === s);
          const sel = t.querySelector('[data-try]');
          sel.value = 'F';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }, [g1.rows[0].slug]);
        await sleep(400);
        const g2 = await gpaPanel(p);
        check(g2 && g2.tag && g2.rows[0].tried && g2.rows[0].letter === 'F' && g2.big === gpaFrom(g2.rows) && g2.big !== g1.big && drops.length === d1, `${tag}: a what-if F on ${g1.rows[0].code}: GPA ${g1.big} → ${g2 && g2.big}, marked What-if, nothing saved or sent`);
        // The GPA so far.
        await p.evaluate(() => document.querySelector('[data-haloplus="gpa-panel"]').shadowRoot.querySelector('[data-so-open]').click());
        await p.evaluate(() => {
          const r = document.querySelector('[data-haloplus="gpa-panel"]').shadowRoot;
          const g = r.querySelector('[data-so-gpa]');
          g.value = '3.40';
          g.dispatchEvent(new Event('change', { bubbles: true }));
          const c = r.querySelector('[data-so-cr]');
          c.value = '45';
          c.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await until(async () => drops.some((d) => d && d.gpa && d.gpa.soFar && d.gpa.soFar.credits === 45), 6000, 150);
        await sleep(300);
        const g3 = await gpaPanel(p);
        const sem = g3.rows.filter((r) => r.letter && r.letter in POINTS && r.credits > 0);
        const sc = sem.reduce((a, r) => a + r.credits, 0);
        const sg = sem.reduce((a, r) => a + r.credits * POINTS[r.letter], 0) / sc;
        const cum = (Math.round(((3.4 * 45 + sg * sc) / (45 + sc)) * 100) / 100).toFixed(2);
        check(g3.cum === cum && drops.some((d) => d && d.gpa && d.gpa.soFar && d.gpa.soFar.gpa === 3.4 && d.gpa.soFar.credits === 45), `${tag}: GPA so far 3.40 over 45: cumulative ${g3.cum} (${cum}), sent to the account`);
        await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-3-gpa.png` });
      }
      await p.keyboard.press('Escape');
      await p.close();
    }

    // ---- phone width: both panels fit ----
    {
      const p = await b.page('https://halo.gcu.edu/', { width: 420, height: 900, scheme });
      await until(async () => (await p.locator('[data-haloplus="wi-link"]').count()) >= 1, 15000, 200);
      await p.locator('[data-haloplus="wi-link"] >> button').first().click();
      const w = await until(async () => { const x = await wiPanel(p); return x && x.big ? x : null; }, 10000, 150);
      check(w && w.left >= 0 && w.right <= w.vw, `${tag} 420: the what-if panel fits a phone-width window (${w && `${w.left}–${w.right} of ${w.vw}`})`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-4-phone-whatif.png` });
      await p.keyboard.press('Escape');
      const hasGpa = await until(() => gpaBar(p), 6000, 200);
      if (hasGpa) {
        await p.evaluate(() => document.querySelector('[data-haloplus="week"]').shadowRoot.querySelector('[data-gpa]').click());
        const g = await until(() => gpaPanel(p), 6000, 150);
        check(g && g.left >= 0 && g.right <= g.vw, `${tag} 420: the GPA panel fits too`);
        await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-5-phone-gpa.png` });
      }
      await p.close();
    }

    // ---- "Open full what-if": the Gradebook with its what-if on; and its clearer button ----
    {
      await b.store({ haloWiOn: false });
      const p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1000, scheme });
      await until(async () => (await p.locator('[data-haloplus="wi-link"]').count()) >= 1, 15000, 200);
      const card = p.locator('#Home--main [class*="CourseCard_cardContainer"]').filter({ has: p.locator('[data-haloplus="wi-link"]') }).first();
      await card.locator('[data-haloplus="wi-link"] >> button').click();
      await until(async () => (await wiPanel(p))?.full, 8000, 150);
      await Promise.all([p.waitForURL(/\/student\/gradebook/, { timeout: 10000 }), p.evaluate(() => document.querySelector('[data-haloplus="wi-panel"]').shadowRoot.querySelector('[data-full]').click())]);
      await until(async () => (await p.locator('[data-haloplus="wi-card"]').count()) === 1, 10000, 200);
      check((await p.locator('[data-haloplus="wi-card"]').count()) === 1 && (await p.locator('[data-haloplus="wi-toggle"] > button[aria-pressed="true"]').count()) === 1, `${tag}: "Open full what-if" opens the Gradebook with its what-if already on`);
      await p.locator('[data-haloplus="wi-toggle"] > button').click();
      await sleep(400);
      const btn = await p.evaluate(() => {
        const bt = document.querySelector('[data-haloplus="wi-toggle"] > button');
        const r = bt.getBoundingClientRect();
        const total = [...document.querySelectorAll('[class*="GradingScoreCard_scoreCard"]')].filter((c) => !c.closest('[data-haloplus]'));
        const tb = total.length ? total[total.length - 1].getBoundingClientRect() : null;
        return { text: bt.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width), font: getComputedStyle(bt).fontSize, gap: tb ? Math.round(r.top - tb.bottom) : null, hint: (document.querySelector('[data-haloplus="wi-toggle"] .hp-wi-hint') || {}).textContent || '' };
      });
      check(btn.text === 'What if? Try scores' && btn.h >= 34 && parseFloat(btn.font) >= 15 && btn.gap !== null && btn.gap < 60 && /Nothing changes in Halo/.test(btn.hint), `${tag}: the Gradebook's what-if is a clear button right under Halo's total: "${btn.text}", ${btn.w}×${btn.h}, ${btn.font}, ${btn.gap}px below, "${btn.hint}"`);
      await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-6-gradebook-button.png`, clip: { x: 0, y: 0, width: 1366, height: 560 } });
      await p.close();
    }

    // ---- each switch off ----
    {
      await b.store({ haloFeat: { off: ['gpa', 'whatif'], at: new Date().toISOString() } });
      const p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 900, scheme });
      await until(async () => (await p.locator('[data-haloplus="card-grade"], .better-halo-grade-indicator').count()) >= 1, 15000, 200);
      await sleep(2500);
      check((await p.locator('[data-haloplus="wi-link"]').count()) === 0 && !(await gpaBar(p)), `${tag}: switched off: no "What if?" link, no GPA`);
      await p.close();
      await b.store({ haloFeat: { off: [], at: new Date().toISOString() } });
    }
  } catch (e) {
    console.log(`ERROR ${e.stack || e}`);
    check(false, `${tag}: ran to the end`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
