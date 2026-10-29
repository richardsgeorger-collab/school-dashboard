// Features 8 and 23 (extension 0.12.0) on Halo's topic page stand-in and its assignment submission view, with the demo
// student (made up). 8: handed-in work shows what Halo's card does not (0.12.1): when it was sent and which file, under
// Halo's own "Submitted" chip ("<when> · <file>"), from Halo's submission record, never a second "Submitted"; before submitting, a file clearly not the one type the instructions ask for gets one line, in
// the working files and in Review and Submit; nothing when the instructions allow two types or name none, nothing for
// graded work or a record with no final file. 23: open work shows the instructor's comment on the same assignment one
// topic earlier, folded, word for word, never a script; nothing without a graded earlier one with a comment.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-submit.mjs
import { SUBMIT_REST, topicGateway, topicPage, gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/submit');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);
const PHX = 'America/Phoenix';
const dayFmt = (t) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: PHX, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(t));
  const g = (x) => p.find((q) => q.type === x)?.value ?? '';
  return `${g('weekday')} ${g('hour')}:${g('minute')} ${g('dayPeriod').toUpperCase()}`;
};

for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `submit-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/course-units/[^/]+$': topicPage }, rest: [SUBMIT_REST] });
  Object.assign(b.bench.state.gateway, topicGateway(b.fx), gradesGateway(b.fx));
  const st = b.bench.state;
  try {
    await b.seed();
    const fx = b.fx;
    const com = fx.payload.classes.find((c) => c.courseCode === 'COM-100');
    const dq3 = com.assessments.find((a) => /^Topic 3 DQ 1/.test(a.title));
    const dq2 = com.assessments.find((a) => /^Topic 2 DQ 1/.test(a.title));
    const dq1 = com.assessments.find((a) => /^Topic 1 DQ 1/.test(a.title));
    const unitDq = dq3.unitId;
    // Assignments: one handed in an hour ago, one open with instructions asking for a Word document.
    const asg = fx.payload.classes.flatMap((c) => c.assessments.map((a) => ({ ...a, slug: c.slugId }))).filter((a) => a.type === 'ASSIGNMENT');
    const handed = asg[0];
    const open = asg.find((a) => a.unitId !== handed.unitId && a.slug === handed.slug) ?? asg[1];
    st.grades = { [handed.id]: { status: 'SUBMITTED' }, [open.id]: { status: 'ACTIVE' }, [dq3.id]: { status: 'ACTIVE' }, [dq2.id]: { status: 'PUBLISHED' }, [dq1.id]: { status: 'PUBLISHED' } };
    const subAt = new Date(Date.now() - 60 * 60_000).toISOString();
    st.submissions = { [handed.id]: { submissionDate: subAt, files: [{ name: 'Lab report final.docx' }, { name: 'Data.xlsx' }] } };
    st.assessments = { [open.id]: { description: '<p>Write two pages on the reading.</p><p>Submit your paper as a Microsoft Word document.</p>' } };
    st.working = { [open.id]: ['Paper draft.pdf', 'Paper.docx'] };
    st.feedback = { [dq2.id]: { comment: '<p>Great connection to the reading. <strong>Cite the page</strong> next time.</p><script>window.__pwned = 1</script><img src=x onerror="window.__pwned=2">' }, [dq1.id]: { comment: '<p>Older comment.</p>' } };

    // ---- 8a: Halo's confirmation on a handed-in card ----
    let p = await b.page(`https://halo.gcu.edu/courses/${handed.slug}/course-units/${handed.unitId}`);
    await until(async () => (await p.locator('[data-haloplus="submitted"]').count()) === 1, 10000, 200);
    const line = (await p.locator('[data-haloplus="submitted"]').textContent()).replace(/\s+/g, ' ').trim();
    check(line === `${dayFmt(subAt)} · Lab report final.docx +1 more`, `${tag}: handed in: "${line}"`);
    check(await p.evaluate(() => {
      const el = document.querySelector('[data-haloplus="submitted"]');
      return !!el.parentElement.querySelector('[data-testid="status"]') && !/Submitted/.test(el.textContent);
    }), `${tag}: under Halo's own status chip, without saying "Submitted" again`);
    const card = p.locator('[data-testid="assessment_card"]', { has: p.locator('[data-haloplus="submitted"]') });
    await card.locator('button[data-toggle]').click();
    await sleep(300);
    await card.screenshot({ path: `${OUT}/${tag}-1-submitted-card.png` });
    await p.close();
    // Graded, or a record with no final file, or Halo silent: nothing.
    for (const [name, setup] of [
      ['graded (published)', () => (st.grades[handed.id] = { status: 'PUBLISHED' })],
      ['no final file on record', () => ((st.grades[handed.id] = { status: 'SUBMITTED' }), (st.submissions[handed.id] = { submissionDate: subAt, files: [{ name: 'x.docx', final: false }] }))],
      ['Halo does not answer', () => ((st.submissions[handed.id] = { submissionDate: subAt, files: [{ name: 'Lab report final.docx' }] }), (st.failGateway = true))],
    ]) {
      setup();
      p = await b.page(`https://halo.gcu.edu/courses/${handed.slug}/course-units/${handed.unitId}`);
      await sleep(2500);
      check((await p.locator('[data-haloplus="submitted"]').count()) === 0, `${tag}: ${name}: no confirmation line`);
      await p.close();
    }
    st.failGateway = false;

    // ---- 8b: the file type, before submitting ----
    p = await b.page(`https://halo.gcu.edu/courses/${open.slug}/course-units/${open.unitId}`);
    await sleep(1200);
    await p.locator(`[data-open="${open.id}"]`).click();
    await until(async () => (await p.locator('[data-haloplus="wrongtype"]').count()) === 1, 8000, 200);
    const warn = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="wrongtype"]')].map((w) => [w.previousElementSibling.textContent.trim(), w.textContent.trim()]));
    check(warn.length === 1 && warn[0][0] === 'Paper draft.pdf' && /This is a \.pdf file\. The instructions ask for a Word document \(\.docx\)\./.test(warn[0][1]), `${tag}: the working files: one line under the PDF only (${JSON.stringify(warn)})`);
    await p.locator('#guide_anchor_submitAssignment_submit').click();
    await until(async () => (await p.locator('.hp-review [data-haloplus="wrongtype"]').count()) === 1, 8000, 200);
    check((await p.locator('.hp-review [data-haloplus="wrongtype"]').count()) === 1, `${tag}: and in Review and Submit, before the button`);
    await p.screenshot({ path: `${OUT}/${tag}-2-wrong-type.png` });
    await p.locator('.hp-review .hp-submit').click();
    await until(() => p.evaluate(() => /Submitted on /.test(document.body.innerText)), 8000, 200);
    await sleep(600);
    const left = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="wrongtype"]')].map((w) => `${w.parentElement && w.parentElement.className}|${w.previousElementSibling && w.previousElementSibling.textContent}`));
    check(left.length === 0, `${tag}: handed in: no file-type line any more${left.length ? ` (${JSON.stringify(left)})` : ''}`);
    await p.close();
    for (const [name, desc] of [
      ['two types allowed', '<p>Submit your paper as a Word document or PDF.</p>'],
      ['no type named', '<p>Write two pages on the reading and upload it.</p>'],
    ]) {
      st.assessments[open.id] = { description: desc };
      st.grades[open.id] = { status: 'ACTIVE' };
      delete st.submissions[open.id];
      p = await b.page(`https://halo.gcu.edu/courses/${open.slug}/course-units/${open.unitId}#assignment-submission/${open.id}`);
      await sleep(2500);
      check((await p.locator('[data-haloplus="wrongtype"]').count()) === 0, `${tag}: ${name}: no file-type line`);
      await p.close();
    }

    // ---- 23: last feedback ----
    const g0 = st.gatewayCalls;
    p = await b.page(`https://halo.gcu.edu/courses/${com.slugId}/course-units/${unitDq}`);
    await until(async () => (await p.locator('[data-haloplus="feedback"]').count()) === 1, 10000, 200);
    const fold = (await p.locator('[data-haloplus="feedback"] .hp-fold').innerText()).trim();
    check(fold === `Last feedback · ${dq2.title}`, `${tag}: "${fold}", folded`);
    check(await p.locator('[data-haloplus="feedback"] .hp-body').evaluate((e) => e.hidden), `${tag}: folded until opened`);
    await p.locator('[data-haloplus="feedback"] .hp-fold').click();
    const shown = (await p.locator('[data-haloplus="feedback"] .hp-body').innerText()).replace(/\s+/g, ' ').trim();
    check(shown === 'Great connection to the reading. Cite the page next time.', `${tag}: word for word ("${shown}")`);
    check(await p.evaluate(() => !window.__pwned && !document.querySelector('[data-haloplus="feedback"] script, [data-haloplus="feedback"] img')), `${tag}: never a script or a stray image`);
    const fbCalls = b.bench.calls.gateway.filter((c) => c.op === 'AssessmentFeedback');
    check(fbCalls.length <= 2 && fbCalls.every((c) => c.vars.userId === 'user-maya'), `${tag}: at most two questions for it, as the student (${fbCalls.length})`);
    await p.locator('[data-haloplus="feedback"]').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/${tag}-3-last-feedback.png` });
    await p.close();
    void g0;
    // The one just before has no comment: the one before that, if it is the next most recent with one.
    st.feedback[dq2.id] = { comment: '   ' };
    const fx2 = JSON.parse(JSON.stringify(fx.index));
    fx2.at = new Date().toISOString();
    await b.store({ haloIndex: fx2 });
    p = await b.page(`https://halo.gcu.edu/courses/${com.slugId}/course-units/${unitDq}`);
    await sleep(3000);
    const fold2 = (await p.locator('[data-haloplus="feedback"] .hp-fold').count()) ? (await p.locator('[data-haloplus="feedback"] .hp-fold').innerText()).trim() : null;
    check(fold2 === `Last feedback · ${dq1.title}`, `${tag}: the most recent earlier one with a comment ("${fold2}")`);
    await p.close();
    // Not graded yet, or no comment anywhere: nothing.
    st.grades[dq2.id] = { status: 'SUBMITTED' };
    st.grades[dq1.id] = { status: 'SUBMITTED' };
    p = await b.page(`https://halo.gcu.edu/courses/${com.slugId}/course-units/${unitDq}`);
    await sleep(3000);
    check((await p.locator('[data-haloplus="feedback"]').count()) === 0, `${tag}: nothing graded before it: no feedback fold`);
    await p.close();

    // No Halo+ account yet (Free has it since 0.12.12) and switched off: nothing.
    st.grades[dq2.id] = { status: 'PUBLISHED' };
    for (const [name, extra] of [['no account yet', { tier: null, haloSnap: null, haloLive: null, syncKey: null, lastSyncAt: null }], ['switched off', { haloFeat: { off: ['submit', 'feedback'], at: new Date().toISOString() } }]]) {
      await b.seed(extra);
      p = await b.page(`https://halo.gcu.edu/courses/${com.slugId}/course-units/${unitDq}`);
      await sleep(2500);
      check((await p.locator('[data-haloplus="feedback"], [data-haloplus="submitted"]').count()) === 0, `${tag}: ${name}: nothing`);
      if (name === 'switched off') {
        // The before pictures: the same three places as Halo shows them, with these features off.
        await p.locator('[data-testid="assessment_card"]', { hasText: dq3.title }).first().scrollIntoViewIfNeeded();
        await p.screenshot({ path: `${OUT}/${tag}-0-before-last-feedback.png` });
        await p.close();
        p = await b.page(`https://halo.gcu.edu/courses/${handed.slug}/course-units/${handed.unitId}`);
        await sleep(1500);
        const was = p.locator('[data-testid="assessment_card"]', { hasText: handed.title }).first();
        await was.locator('button[data-toggle]').click();
        await sleep(300);
        await was.screenshot({ path: `${OUT}/${tag}-0-before-submitted-card.png` });
        await p.close();
        st.assessments[open.id] = { description: '<p>Write two pages on the reading.</p><p>Submit your paper as a Microsoft Word document.</p>' };
        st.grades[open.id] = { status: 'ACTIVE' };
        delete st.submissions[open.id];
        st.working[open.id] = ['Paper draft.pdf', 'Paper.docx'];
        p = await b.page(`https://halo.gcu.edu/courses/${open.slug}/course-units/${open.unitId}#assignment-submission/${open.id}`);
        await sleep(1500);
        await p.locator('#guide_anchor_submitAssignment_submit').click();
        await until(async () => (await p.locator('.hp-review').count()) === 1, 8000, 200);
        await sleep(1500);
        check((await p.locator('[data-haloplus="wrongtype"]').count()) === 0, `${tag}: switched off: no file-type line in Review and Submit`);
        await p.screenshot({ path: `${OUT}/${tag}-0-before-wrong-type.png` });
      }
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
