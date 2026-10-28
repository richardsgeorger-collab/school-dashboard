// Before and after pictures for extension 0.12.1 (George's five fixes from testing 0.12.0 on real Halo), the same scenes
// on Halo's stand-in pages with the demo student Maya Torres (made up) and her six classes, plain and Better Halo dark:
// the calendar (Student Home and a class calendar's All classes, full width and 1024px), the rubric, a handed-in card,
// the draft offer and the Halo+ mark up close. No checks here; the e2e-onhalo-* tests check the behaviour.
//   WHICH=before EXT_DIR=<0.12.0 unpacked> [BH_DIR=…] node scripts/shots-onhalo-0121.mjs
//   WHICH=after [BH_DIR=…] node scripts/shots-onhalo-0121.mjs
import { classPage, discussionPage, FORUM_REST, forumState, gradesGateway, rubricFor, topicGateway, topicPage } from './lib/haloPages.mjs';
import { bhPath, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const WHICH = process.env.WHICH === 'before' ? 'before' : 'after';
const OUT = out(`docs/screens/on-halo-0121/${WHICH}`);
const PROMPT = '<p>Describe one listening habit you want to build this week and why.</p><p>Your initial post should be at least 150 words. Reply to two classmates with at least 75 words each.</p>';
/** Three device pixels per pixel, for a close look at something small (the page's layout is unchanged). */
const magnify = async (p) => {
  const cdp = await p.context().newCDPSession(p);
  const { w, h } = await p.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: false });
  await sleep(400);
};
const settle = async (p) => {
  await p.mouse.move(3, 3);
  await sleep(700);
};

for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({
    label: `shots-${WHICH}-${tag}`,
    bh: run.bh,
    bhDark: run.dark,
    pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage, '^/courses/[^/]+/forums/discussion/[^/]+$': discussionPage },
    rest: [FORUM_REST],
  });
  Object.assign(b.bench.state.gateway, topicGateway(b.fx), gradesGateway(b.fx));
  const st = b.bench.state;
  try {
    // A sync just tried: no visit sync against the fake Halo (its "Halo sync failed" note is not part of the pictures).
    await b.seed({ lastAttemptAt: new Date().toISOString() });
    const fx = b.fx;
    // ---- the calendar ----
    for (const [w, h] of [[1366, 1100], [1024, 900]]) {
      let p = await b.page('https://halo.gcu.edu/', { width: w, height: h });
      await sleep(2000);
      if (await p.locator('[data-haloplus="home-tab"]').count()) {
        await p.locator('[data-haloplus="home-tab"]').click();
        await until(async () => (await p.locator('[data-haloplus="home-calendar"] .hp-chip').count()) > 0, 15000, 200);
      }
      await settle(p);
      await p.screenshot({ path: `${OUT}/${tag}-calendar-home-${w}.png` });
      await p.close();
      p = await b.page(`https://halo.gcu.edu/courses/${fx.payload.classes[0].slugId}`, { width: w, height: h });
      await until(async () => (await p.locator('[data-hp-cal="all"]').count()) === 1, 10000, 200);
      await p.locator('[data-hp-cal="all"]').click();
      await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-grid > *').count()) > 0, 15000, 200);
      await settle(p);
      await p.screenshot({ path: `${OUT}/${tag}-calendar-class-${w}.png` });
      await p.close();
    }

    // ---- the rubric and a handed-in card ----
    const asg = fx.payload.classes.flatMap((c) => c.assessments.map((a) => ({ ...a, slug: c.slugId }))).filter((a) => a.type === 'ASSIGNMENT');
    const withRubric = asg.find((a) => rubricFor(a));
    const handed = asg.find((a) => a !== withRubric && a.unitId !== withRubric.unitId);
    st.grades = { [withRubric.id]: { status: 'ACTIVE' }, [handed.id]: { status: 'SUBMITTED' } };
    st.submissions = { [handed.id]: { submissionDate: new Date(Date.now() - 3_600_000).toISOString(), files: [{ name: 'Lab report final.docx' }, { name: 'Data.xlsx' }] } };
    let p = await b.page(`https://halo.gcu.edu/courses/${withRubric.slug}/course-units/${withRubric.unitId}`);
    await sleep(2500);
    const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${withRubric.title}")`) });
    if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
    await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await settle(p);
    await p.screenshot({ path: `${OUT}/${tag}-rubric-1-card.png` });
    if (WHICH === 'before') await card.locator('[data-haloplus="rubric"] .hp-fold').click();
    else await card.locator('a[data-testid="print_rubric_link"]').click();
    await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 8000, 150);
    await card.evaluate((el) => {
      el.querySelector('.bg-grayF2').scrollIntoView({ block: 'start' });
      const main = document.getElementById('CourseLayout--main');
      if (main) main.scrollTop -= 140;
    });
    await settle(p);
    await p.screenshot({ path: `${OUT}/${tag}-rubric-2-open.png` });
    await p.close();
    p = await b.page(`https://halo.gcu.edu/courses/${handed.slug}/course-units/${handed.unitId}`);
    await until(async () => (await p.locator('[data-haloplus="submitted"]').count()) === 1, 10000, 200);
    const hc = p.locator('[data-testid="assessment_card"]', { has: p.locator('[data-haloplus="submitted"]') });
    await hc.locator('button[data-toggle]').click();
    await settle(p);
    await hc.screenshot({ path: `${OUT}/${tag}-submitted-card.png` });
    await p.close();

    // ---- the draft offer, and the mark up close ----
    const com = fx.payload.classes.find((c) => c.courseCode === 'COM-100');
    const dq = com.discussions[0];
    const forum = forumState(st, fx, dq.forumId);
    forum.prompt = PROMPT;
    const jordan = forum.posts[0].id;
    const url = `https://halo.gcu.edu/courses/${com.slugId}/forums/discussion/${dq.forumId}`;
    p = await b.page(url);
    await until(() => p.evaluate(() => window.__haloEditors === true), 30000, 200);
    await p.locator(`button[data-post="${jordan}"]`).click();
    await until(async () => (await p.locator(`.toggleReplyEditor[data-for="${jordan}"] .ProseMirror`).count()) === 1, 6000, 150);
    await p.locator(`.toggleReplyEditor[data-for="${jordan}"] .ProseMirror`).click();
    await p.keyboard.type('Jordan, I like that you ask a question back. I tried it in lab today and it changed the whole conversation.', { delay: 4 });
    await sleep(1500);
    await p.reload({ waitUntil: 'load' });
    await until(() => p.evaluate(() => window.__haloEditors === true), 30000, 200);
    await p.locator(`button[data-post="${jordan}"]`).click();
    await until(async () => (await p.locator('[data-haloplus="draft-offer"]').count()) === 1, 9000, 200);
    await settle(p);
    const box = p.locator(`.toggleReplyEditor[data-for="${jordan}"]`);
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await sleep(300);
    const r = await box.boundingBox();
    await p.screenshot({ path: `${OUT}/${tag}-draft-offer.png`, clip: { x: r.x - 12, y: r.y - 90, width: r.width + 24, height: Math.min(330, r.height + 110) } });
    // The mark beside Halo's own word count, magnified.
    const foot = p.locator(`.toggleReplyEditor[data-for="${jordan}"] [data-haloplus="words"]`);
    if (await foot.count()) {
      const f = await foot.boundingBox();
      await magnify(p);
      await p.screenshot({ path: `${OUT}/${tag}-mark-words.png`, clip: { x: f.x - 30, y: f.y - 8, width: f.width + 50, height: f.height + 16 }, scale: 'device' });
    }
    await p.close();
    p = await b.page('https://halo.gcu.edu/');
    await sleep(2000);
    const search = p.locator('[data-haloplus="search-bar"]').first();
    if (await search.count()) {
      const s = await search.boundingBox();
      await magnify(p);
      await p.screenshot({ path: `${OUT}/${tag}-mark-search.png`, clip: { x: s.x - 8, y: s.y - 8, width: s.width + 16, height: s.height + 16 }, scale: 'device' });
    }
    await p.close();
    console.log(`${WHICH} ${tag}: done`);
  } catch (e) {
    console.log(`${WHICH} ${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
