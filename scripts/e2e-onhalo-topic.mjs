// Features 21, 5 and 7 (extension 0.12.0) on Halo's topic page stand-in, with the demo student (made up):
// - 21: a folded "Rubric" under the instructions of each card that has Halo's "View Rubric"; nothing asked of Halo
//   until it is opened; then exactly Halo's list (criteria, points, levels from the top, total); Halo silent: it says so.
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

    // 21: rubric folds.
    const withRubric = items.filter((a) => rubricFor(a));
    const folds = await p.locator('[data-haloplus="rubric"]').count();
    check(folds === withRubric.length && folds > 0, `${tag}: a folded "Rubric" on each card with Halo's View Rubric (${folds} of ${withRubric.length})`);
    check(b.bench.calls.gateway.slice(calls0).every((c) => c.op !== 'AssessmentRubric'), `${tag}: nothing asked of Halo before it is opened`);
    await p.screenshot({ path: `${OUT}/${tag}-2-after.png` });
    const a = withRubric[0];
    const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${a.title}")`) });
    // Halo folds handed-in cards: open the card first, as a student would.
    if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
    await card.locator('[data-haloplus="rubric"] .hp-fold').click();
    await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 8000, 150);
    const shown = (await card.locator('[data-haloplus="rubric"] .hp-body').innerText()).replace(/\s+/g, ' ').trim();
    const r = rubricFor(a);
    const r2 = (n) => Math.round(n * 100) / 100;
    const want = [...r.criteria].sort((x, y) => x.sequence - y.sequence).map((c) => `${c.name} ${r2(c.points)} points Criteria Description ${c.description} ${[...c.achievementLevels].sort((x, y) => y.sequence - x.sequence).map((l) => `${l.sequence}. ${l.name} ${r2(l.points)} points ${l.description}`).join(' ')}`).join(' ') + ` Total${r2(r.criteria.reduce((n, c) => n + c.points, 0))} points`; // Halo's two spans, spaced by margin
    const diff = [...want].findIndex((ch, i) => ch !== shown[i]);
    check(shown === want, `${tag}: opened: exactly Halo's rubric (${shown.length} characters${shown === want ? '' : `; differs at ${diff}: got "…${shown.slice(Math.max(0, diff - 40), diff + 60)}…" want "…${want.slice(Math.max(0, diff - 40), diff + 60)}…"`})`);
    const rubricCalls = () => b.bench.calls.gateway.filter((c) => c.op === 'AssessmentRubric').length;
    check(rubricCalls() === 1, `${tag}: one question to Halo for it`);
    await card.locator('[data-haloplus="rubric"]').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/${tag}-3-rubric-open.png` });
    await card.locator('[data-haloplus="rubric"] .hp-fold').click();
    await card.locator('[data-haloplus="rubric"] .hp-fold').click();
    await sleep(300);
    check(rubricCalls() === 1, `${tag}: closing and opening again asks Halo nothing more`);
    await p.close();

    // Halo silent: it says so; no rubric, no fold.
    if (withRubric[1] || withRubric[0]) {
      b.bench.state.failGateway = true;
      p = await b.page(url);
      await until(async () => (await p.locator('[data-haloplus="rubric"]').count()) > 0, 10000, 200);
      const c2 = p.locator('[data-haloplus="rubric"]').first();
      const holder = p.locator('[data-testid="assessment_card"]', { has: c2 });
      if ((await holder.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await holder.locator('button[data-toggle]').click();
      await c2.locator('.hp-fold').click();
      await until(async () => /did not send/.test(await c2.innerText()), 8000, 200);
      check(/Halo did not send the rubric just now/.test(await c2.innerText()), `${tag}: Halo does not answer: it says so, Halo's own link still there`);
      b.bench.state.failGateway = false;
      await p.close();
    }

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
