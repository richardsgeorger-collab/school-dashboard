// Features 21, 5 and 7 (extension 0.12.0) on Halo's topic page stand-in, with the demo student (made up):
// - 21 (0.12.1): Halo's own "View Rubric" opens the rubric right below its row instead of a new tab, exactly Halo's
//   list (criteria, points, levels from the top, total); a second click closes it; Ctrl/⌘-click is Halo's new tab as
//   before; Halo silent: Halo's own rubric page opens, as it always did.
// - 5: " · in 5h" / " · tomorrow" / " · in 3 days" beside Halo's own due date, from Halo's text in Halo's zone; not for
//   handed-in work, past due or more than six days out; a personal (accommodated) date counts instead.
// - 7: "N of M done" beside Max Points; nothing until every card's status is known.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-topic.mjs
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { rubricFor, topicGateway, topicPage } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/topic');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);
const L = (() => {
  const c = { URL, Intl, Date };
  c.globalThis = c;
  runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), c);
  return c.HaloPlusOnLogic;
})();
const H = 3_600_000;
// Halo's own minute: its dates have no seconds.
const at = (ms) => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();

for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `topic-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/course-units/[^/]+$': topicPage } });
  Object.assign(b.bench.state.gateway, topicGateway(b.fx));
  try {
    await b.seed();
    // A topic with an assignment that has a rubric, and as many other items as possible.
    const units = [];
    for (const c of b.fx.payload.classes) {
      const by = {};
      for (const a of c.assessments) (by[a.unitId] ??= []).push(a);
      for (const [unitId, list] of Object.entries(by)) units.push({ cls: c, unitId, items: list, rub: list.some((a) => rubricFor(a)) });
    }
    const pick = units.filter((u) => u.rub).sort((x, y) => y.items.length - x.items.length)[0];
    const { cls, unitId, items } = pick;
    console.log(`topic: ${cls.courseCode} ${items[0].unit} (${items.length} items)`);
    const url = `https://halo.gcu.edu/courses/${cls.slugId}/course-units/${unitId}`;
    const now = Date.now();
    // The student's own dates and statuses for this topic: due in 5 hours, tomorrow, in 10 days, past due, handed in,
    // and a personal (accommodated) date two days out on work whose class date has passed.
    const plan = [
      { dueDate: at(now + 5 * H), status: 'ACTIVE' },
      { dueDate: at(now + 30 * H), status: 'ACTIVE' },
      { dueDate: at(now + 10 * 24 * H), status: 'UPCOMING' },
      { dueDate: at(now - 3 * H), status: 'OVERDUE' },
      { dueDate: at(now + 3 * H), status: 'SUBMITTED' },
      { dueDate: at(now - 20 * H), accommodatedDueDate: at(now + 50 * H), status: 'ACTIVE' },
    ];
    b.bench.state.grades = {};
    items.forEach((a, k) => (b.bench.state.grades[a.id] = plan[k % plan.length]));
    const tz = b.fx.snap.tz;

    // Before: all three switched off.
    await b.store({ haloFeat: { off: ['rubric', 'duein', 'topic'], at: new Date().toISOString() } });
    let p = await b.page(url);
    await sleep(2500);
    check((await p.locator('[data-haloplus="rubric"], [data-haloplus="duein"], [data-haloplus="topic"]').count()) === 0, `${tag}: switched off: nothing added`);
    await p.screenshot({ path: `${OUT}/${tag}-1-before.png` });
    await p.close();

    await b.store({ haloFeat: { off: [], at: new Date().toISOString() } });
    const calls0 = b.bench.calls.gateway.length;
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus="topic"]').count()) === 1, 10000, 200);
    await sleep(800);

    // 7: topic progress.
    const doneN = items.filter((a, k) => ['LATE', 'SUBMITTED', 'PUBLISHED'].includes(plan[k % plan.length].status)).length;
    const topicText = (await p.locator('[data-haloplus="topic"]').innerText()).trim();
    check(topicText === `${doneN} of ${items.length} done`, `${tag}: topic progress "${topicText}" (want ${doneN} of ${items.length})`);
    const inRow = await p.evaluate(() => /Max Points:/.test(document.querySelector('[data-haloplus="topic"]').parentElement.textContent));
    check(inRow, `${tag}: beside Halo's Max Points`);

    // 5: due-in.
    const labels = await p.evaluate(() => [...document.querySelectorAll('[data-testid="assessment_card"]')].map((c) => {
      const d = c.querySelector('[data-haloplus="duein"]');
      return { title: c.querySelector('[data-testid="assessment_title"]').textContent, text: d ? d.textContent.trim() : null, beside: d ? (d.previousElementSibling && d.previousElementSibling.className) || d.previousSibling.nodeType : null };
    }));
    items.forEach((a, k) => {
      const g = plan[k % plan.length];
      const handed = g.status === 'SUBMITTED';
      const want = handed ? null : L.dueIn(g.accommodatedDueDate ?? g.dueDate, Date.now(), tz);
      const got = labels.find((l) => l.title === a.title)?.text ?? null;
      check((got ? got.replace(/^·\s*/, '') : null) === want, `${tag}: "${a.title.slice(0, 26)}" due ${g.accommodatedDueDate ? 'personally ' : ''}${Math.round((Date.parse(g.accommodatedDueDate ?? g.dueDate) - now) / H)}h${handed ? ', handed in' : ''}: ${got ?? 'nothing'}${want === null ? ' (nothing wanted)' : ''}`);
    });
    const acc = labels.find((l, k) => plan[k % plan.length].accommodatedDueDate);
    if (acc && acc.text) check(/timePart/.test(String(acc.beside)), `${tag}: the personal date's label sits beside the personal date`);

    // 21: Halo's "View Rubric" opens the rubric under its row.
    const withRubric = items.filter((a) => rubricFor(a));
    check((await p.locator('[data-haloplus="rubric"]').count()) === 0 && withRubric.length > 0, `${tag}: nothing added to the cards until View Rubric is pressed`);
    check(b.bench.calls.gateway.slice(calls0).every((c) => c.op !== 'AssessmentRubric'), `${tag}: nothing asked of Halo before then`);
    await p.screenshot({ path: `${OUT}/${tag}-2-after.png` });
    const a = withRubric[0];
    const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${a.title}")`) });
    // Halo folds handed-in cards: open the card first, as a student would.
    if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
    let tabs = 0;
    const onTab = () => (tabs += 1);
    b.ctx.on('page', onTab);
    const link = card.locator('a[data-testid="print_rubric_link"]');
    await link.hover();
    await link.click();
    await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 8000, 150);
    await sleep(500);
    check(tabs === 0, `${tag}: View Rubric opens no new tab`);
    const below = await card.evaluate((el) => {
      const row = el.querySelector('a[data-testid="print_rubric_link"]').closest('.bg-grayF2');
      return row && row.nextElementSibling && row.nextElementSibling.getAttribute('data-haloplus');
    });
    check(below === 'rubric', `${tag}: the rubric is right below Halo's Start / Due / Points / Rubric row`);
    // 0.12.2: short first: the total at the top, each criterion on one line with its points and only its top level.
    const r = rubricFor(a);
    const r2 = (n) => Math.round(n * 100) / 100;
    const crit = [...r.criteria].sort((x, y) => x.sequence - y.sequence);
    const lv = (c) => [...c.achievementLevels].sort((x, y) => y.sequence - x.sequence);
    const total = r2(crit.reduce((n, c) => n + c.points, 0));
    const vis = () => card.evaluate((el) => {
      const box = el.querySelector('[data-haloplus="rubric"]');
      const on = (n) => n.getBoundingClientRect().height > 0;
      return {
        head: box.querySelector('[data-testid="hp-rubric-head"]').textContent.trim(),
        lines: [...box.querySelectorAll('[data-testid="hp-crit-line"]')].map((n) => n.textContent.trim()),
        tops: [...box.querySelectorAll('.hp-top')].filter(on).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
        levels: [...box.querySelectorAll('.bg-grayF2')].filter(on).length,
        crits: [...box.querySelectorAll('.hp-crit')].map((c) => (on(c.querySelector('.hp-full')) ? c.querySelector('.hp-full').innerText.replace(/\s+/g, ' ').trim() : null)),
        total: on(box.querySelector('.hp-total')) ? box.querySelector('.hp-total').innerText.replace(/\s+/g, ' ').trim() : null,
      };
    });
    // 0.12.3: a box of its own (a thin border, a light background), and Halo's link reads "Hide Rubric".
    const boxLook = await card.evaluate((el) => {
      const box = el.querySelector('[data-haloplus="rubric"]');
      const cs = getComputedStyle(box);
      const a = el.querySelector('a[data-testid="print_rubric_link"]');
      return { border: cs.borderTopWidth, style: cs.borderTopStyle, bg: cs.backgroundColor, card: getComputedStyle(el).backgroundColor, label: getComputedStyle(a, '::after').content, aria: a.getAttribute('aria-label'), hide: [...box.querySelectorAll('button')].map((b) => b.textContent.trim()) };
    });
    check(boxLook.border === '1px' && boxLook.style === 'solid' && boxLook.bg !== boxLook.card, `${tag}: the rubric in a box of its own (a thin border, a light background)`);
    check(boxLook.label === '"Hide Rubric"' && boxLook.aria === 'Hide Rubric' && boxLook.hide.join('|').startsWith('Show everything|Open in new tab|Hide'), `${tag}: Halo's link reads "Hide Rubric"; the header has Show everything, Open in new tab, Hide`);
    let v = await vis();
    check(v.head === `Rubric · ${total} pts`, `${tag}: the total at the top ("${v.head}")`);
    check(JSON.stringify(v.lines) === JSON.stringify(crit.map((c) => `${c.name} · ${r2(c.points)} pts`)), `${tag}: each criterion on one line with its points (${v.lines[0]} …)`);
    check(JSON.stringify(v.tops) === JSON.stringify(crit.map((c) => `${lv(c)[0].sequence}. ${lv(c)[0].name}: ${lv(c)[0].description}`)) && v.levels === 0, `${tag}: only each criterion's top level, word for word from Halo`);
    const fullOf = (c) => `Criteria Description ${c.description} ${lv(c).map((l) => `${l.sequence}. ${l.name} ${r2(l.points)} points ${l.description}`).join(' ')}`;
    await card.locator('[data-haloplus="rubric"] [data-levels]').first().click();
    v = await vis();
    check(v.crits[0] === fullOf(crit[0]) && v.crits.slice(1).every((x) => x === null) && v.tops.length === crit.length - 1, `${tag}: "Show all levels" opens that criterion's levels with their points, exactly as Halo lists them`);
    await card.locator('[data-haloplus="rubric"] [data-levels]').first().click();
    await card.locator('[data-haloplus="rubric"] [data-all]').click();
    v = await vis();
    const okAll = v.crits.every((x, i) => x === fullOf(crit[i])) && v.total === `Total${total} points` && v.tops.length === 0;
    check(okAll, `${tag}: "Show everything": every criterion and level, word for word from Halo, and Halo's Total${okAll ? '' : ` (${JSON.stringify(v).slice(0, 300)})`}`);
    await card.locator('[data-haloplus="rubric"] [data-all]').click();
    // "Open in new tab": the whole rubric as a clean page to print.
    const pagePromise = b.ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await card.locator('[data-haloplus="rubric"] [data-print]').click();
    const pp = await pagePromise;
    if (pp) await pp.waitForLoadState('load').catch(() => undefined);
    const ptext = pp ? (await pp.locator('body').innerText()).replace(/\s+/g, ' ') : '';
    const dueText = (await card.locator('[data-testid="date_time_data_due_date"]').evaluate((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim()));
    const clsRow = b.fx.index.classes.find((c) => c.slug === cls.slugId);
    const printOk = !!pp && ptext.includes(`${a.title} - Rubric`) && ptext.includes(clsRow.code) && ptext.includes(`Due ${dueText}`) && ptext.includes(`Total ${total} points`) && crit.every((c) => ptext.includes(`${c.name} ${r2(c.points)} points ${c.description}`) && lv(c).every((l) => ptext.includes(`${l.sequence}. ${l.name} ${r2(l.points)} points ${l.description}`)));
    check(printOk && tabs >= 1, `${tag}: "Open in new tab": a clean page with the assignment, class, due date (${dueText}), every criterion and level`);
    if (pp) {
      await pp.setViewportSize({ width: 1000, height: 1100 });
      await pp.screenshot({ path: `${OUT}/${tag}-5-rubric-print.png` });
      await pp.close();
    }
    tabs = 0;
    const rubricCalls = () => b.bench.calls.gateway.filter((c) => c.op === 'AssessmentRubric').length;
    check(rubricCalls() === 1, `${tag}: one question to Halo for it`);
    // The picture: Halo's row with the rubric opening under it.
    await card.evaluate((el) => {
      const row = el.querySelector('.bg-grayF2');
      const main = document.getElementById('CourseLayout--main');
      row.scrollIntoView({ block: 'start' });
      if (main) main.scrollTop -= 140;
    });
    await sleep(300);
    await p.screenshot({ path: `${OUT}/${tag}-3-rubric-open.png` });
    await link.click();
    await sleep(300);
    check((await card.locator('[data-haloplus="rubric"]').count()) === 0 && (await link.getAttribute('aria-expanded')) === 'false' && (await link.evaluate((a) => getComputedStyle(a, '::after').content)) === 'none', `${tag}: "Hide Rubric" closes it, and the link reads View Rubric again`);
    await link.click();
    await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 8000, 150);
    check(rubricCalls() === 1 && tabs === 0, `${tag}: and opens it again, asking Halo nothing more`);
    await card.locator('[data-haloplus="rubric"] [data-hide]').click();
    await sleep(300);
    check((await card.locator('[data-haloplus="rubric"]').count()) === 0 && (await link.getAttribute('aria-expanded')) === 'false', `${tag}: its own Hide closes it too`);
    await link.click();
    await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 8000, 150);
    await link.click();
    await link.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
    await until(async () => tabs === 1, 5000, 100);
    check(tabs === 1 && (await card.locator('[data-haloplus="rubric"]').count()) === 0, `${tag}: ${process.platform === 'darwin' ? '⌘' : 'Ctrl'}-click is Halo's own new tab, as before`);
    for (const pg of b.ctx.pages()) if (/\/rubrics\//.test(pg.url())) await pg.close().catch(() => undefined);
    await p.close();

    // Halo silent: Halo's own rubric page opens, as it always did.
    {
      b.bench.state.failGateway = true;
      p = await b.page(url);
      await sleep(1500);
      const holder = p.locator('[data-testid="assessment_card"]', { has: p.locator('a[data-testid="print_rubric_link"]') }).first();
      if ((await holder.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await holder.locator('button[data-toggle]').click();
      const before = tabs;
      const opened = b.ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
      await holder.locator('a[data-testid="print_rubric_link"]').click();
      const np = await opened;
      check(np && /\/rubrics\//.test(np.url() || (await np.waitForURL(/rubrics/, { timeout: 3000 }).then(() => np.url()).catch(() => ''))) && tabs === before + 1, `${tag}: Halo does not answer: Halo's own rubric page opens (${np ? np.url() : 'no tab'})`);
      check((await holder.locator('[data-haloplus="rubric"]').count()) === 0, `${tag}: and nothing is left on the card`);
      if (np) await np.close().catch(() => undefined);
      b.bench.state.failGateway = false;
      await p.close();
    }
    b.ctx.off('page', onTab);

    // 7: a card whose state Halo has not drawn: no progress at all.
    b.bench.state.grades[items[0].id] = { ...plan[0], noStatus: true };
    p = await b.page(url);
    await sleep(2500);
    check((await p.locator('[data-haloplus="topic"]').count()) === 0, `${tag}: a card with no status yet: no topic progress`);
    await p.close();

    // 1024px: no sideways scroll.
    b.bench.state.grades[items[0].id] = plan[0];
    p = await b.page(url, { width: 1024 });
    await until(async () => (await p.locator('[data-haloplus="topic"]').count()) === 1, 10000, 200);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tag}: at 1024px it fits`);
    await p.screenshot({ path: `${OUT}/${tag}-4-1024.png` });
    await p.close();

    // Free: nothing.
    await b.seed({ tier: 'free' });
    p = await b.page(url);
    await sleep(2500);
    check((await p.locator('[data-haloplus="rubric"], [data-haloplus="duein"], [data-haloplus="topic"]').count()) === 0, `${tag}: Free: nothing added`);
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
