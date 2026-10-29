// Before (0.12.2) and after (0.12.3) pictures of George's changes after testing 0.12.2, on Halo's stand-in pages with
// the demo student Maya Torres (made up) and her six classes, plain and Better Halo dark, Student Home at full width and
// 1024px: the top of Student Home (0.12.3: the sponsor logo in the purple bar, no title or tabs, the week strip), the
// calendar section, and the rubric opened from Halo's View Rubric. No checks here (the e2e-onhalo-* tests).
//   WHICH=before EXT_DIR=<0.12.2 unpacked> [BH_DIR=…] node scripts/shots-onhalo-0123.mjs
//   WHICH=after [BH_DIR=…] node scripts/shots-onhalo-0123.mjs
import { gradesGateway, rubricFor, topicGateway, topicPage } from './lib/haloPages.mjs';
import { bhPath, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const WHICH = process.env.WHICH === 'before' ? 'before' : 'after';
const OUT = out(`docs/screens/on-halo-0123/${WHICH}`);
const settle = async (p) => {
  await p.mouse.move(3, 3);
  await sleep(700);
};
for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `s123-${WHICH}-${tag}`, bh: run.bh, bhDark: run.bh, pages: { '^/courses/[^/]+/course-units/[^/]+$': topicPage } });
  Object.assign(b.bench.state.gateway, topicGateway(b.fx), gradesGateway(b.fx));
  try {
    // A sync just tried: no visit sync against the fake Halo (its "Halo sync failed" note is not part of the pictures).
    await b.seed({ lastAttemptAt: new Date().toISOString(), haloViews: null, haloCalFold: null });
    for (const [w, h] of [[1366, 900], [1024, 900]]) {
      const p = await b.page('https://halo.gcu.edu/', { width: w, height: h });
      await sleep(2500);
      await settle(p);
      await p.screenshot({ path: `${OUT}/${tag}-home-top-${w}.png` });
      if (await p.locator('[data-haloplus="home-tab"]').count()) {
        await p.locator('[data-haloplus="home-tab"]').click();
        await until(async () => (await p.locator('[data-haloplus="home-calendar"] .hp-chip').count()) > 0, 15000, 200);
      } else {
        await until(async () => (await p.locator('[data-haloplus="home-calendar"] .hp-chip').count()) > 0, 15000, 200);
        await p.locator('[data-haloplus="home-calendar"]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
        await p.evaluate(() => (document.getElementById('CourseLayout--main').scrollTop -= 120));
      }
      await settle(p);
      await p.screenshot({ path: `${OUT}/${tag}-home-calendar-${w}.png` });
      await p.close();
    }
    const asg = b.fx.payload.classes.flatMap((c) => c.assessments.map((a) => ({ ...a, slug: c.slugId }))).filter((a) => a.type === 'ASSIGNMENT' && rubricFor(a));
    const a = asg.sort((x, y) => rubricFor(y).criteria.length - rubricFor(x).criteria.length)[0];
    b.bench.state.grades = { [a.id]: { status: 'ACTIVE' } };
    const p = await b.page(`https://halo.gcu.edu/courses/${a.slug}/course-units/${a.unitId}`);
    await sleep(2500);
    const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${a.title}")`) });
    if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
    await card.locator('a[data-testid="print_rubric_link"]').click();
    await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 8000, 150);
    await card.evaluate((el) => {
      el.querySelector('.bg-grayF2').scrollIntoView({ block: 'start' });
      document.getElementById('CourseLayout--main').scrollTop -= 140;
    });
    await settle(p);
    await p.screenshot({ path: `${OUT}/${tag}-rubric.png` });
    await p.close();
    console.log(`${WHICH} ${tag}: done`);
  } catch (e) {
    console.log(`${WHICH} ${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
