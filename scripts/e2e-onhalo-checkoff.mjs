// The check-off on submit (extension 0.12.9, George: "Submitting should feel great immediately"), on Halo's page
// stand-ins with the demo student (made up), never real Halo. Halo's own success toast, drawn as Halo draws it (its
// icon titled "SUCCESS", "Success", then the words), is the only signal:
// - an assignment turned in through Halo's own Submit Assignment flow: at once the moment on the page (the item, its
//   points, this week's bar), this computer's mark, the account's mark (sync-drop, Halo+'s id for the item), the
//   topic's "N of M done" ticking up; a few seconds later that one class read again from Halo (no sync); on Student
//   Home the class card's NEXT box ticks it off once and drops it, the week strip's dot is hollow, the calendar's chip
//   is checked, This week counts one fewer; the next Student Home does not tick it off again;
// - a DQ response ("Discussion response has been submitted", its window's address) and a quiz finished ("Quiz
//   successfully submitted") the same; an ordinary post or reply: no check-off, only its class read again; a failure
//   toast: nothing; the Celebrations switch off: done, no moment; Free: the same check-off;
// - Halo, read twice, still saying it is not turned in: the mark is taken back (Halo is right).
// Pictures and frames for a GIF of the moment into docs/screens/on-halo/checkoff/.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-checkoff.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { SUBMIT_REST, gradesGateway, topicGateway, topicPage } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/checkoff');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1800000);
const DAY = 864e5;

/** Halo's toast, as Halo's code builds it (react-toastify, 2026-10-28). */
const haloToast = (p, text, type = 'success') =>
  p.evaluate(
    ([t, k]) => {
      const box = document.createElement('div');
      box.className = 'Toastify';
      box.innerHTML = `<div class="Toastify__toast-container Toastify__toast-container--top-right"><div class="Toastify__toast Toastify__toast--${k}"><div role="alert" class="Toastify__toast-body"><div><svg width="24" height="24"><title>${k.toUpperCase()}</title></svg><strong>${k === 'success' ? 'Success' : 'Error'}</strong><div>${t}</div></div></div></div></div>`;
      document.body.append(box);
      setTimeout(() => box.remove(), 3000);
    },
    [text, type],
  );
/** Halo+'s id for a Halo assessment: the account's own (Halo+'s data on the computer), else the app's rule. */
const itemIdIn = (b, h) => {
  const it = (b.fx.snap.items || []).find((i) => i && i.h === h && i.id);
  return it ? it.id : b.worker.evaluate((x) => globalThis.HaloPlusModel.itemId(x), h);
};
const card = (p) => p.evaluate(() => {
  const c = document.getElementById('haloplus-joy')?.shadowRoot?.querySelector('.card');
  return c ? { text: c.textContent.replace('×', '').replace(/\s+/g, ' ').trim(), done: c.classList.contains('done'), pts: c.querySelector('.pts')?.textContent ?? null, week: c.querySelector('.wk .n')?.textContent ?? null } : null;
});

for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `checkoff-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/course-units/[^/]+$': topicPage }, rest: [SUBMIT_REST] });
  Object.assign(b.bench.state.gateway, topicGateway(b.fx), gradesGateway(b.fx));
  const st = b.bench.state;
  // What reaches the account (sync-drop), as the account answers it.
  const drops = [];
  await b.ctx.route('**/functions/v1/sync-drop', async (r) => {
    let body = null;
    try {
      body = JSON.parse(r.request().postData() || 'null');
    } catch {
      /* not JSON */
    }
    drops.push({ at: Date.now(), body });
    const reply = body && body.mark ? { ok: true, prev: body.mark.done ? { status: 'todo', completedAt: null, award: null } : undefined } : body && body.done ? { ok: true, done: [] } : { ok: true };
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
  });
  try {
    const fx = b.fx;
    const now = Date.now();
    // The assignment: the soonest open one due this week, with its own page (its class's NEXT has it first).
    const rows = fx.index.rows.filter((r) => r.kind === 'assignment' && r.href && r.unit && Date.parse(r.cdue) > now + 3 * 3600e3 && Date.parse(r.cdue) < now + 5 * DAY).sort((x, y) => Date.parse(x.cdue) - Date.parse(y.cdue));
    const row = rows[0];
    const cls = fx.index.classes[row.c];
    const a = fx.payload.classes.find((c) => c.slugId === cls.slug).assessments.find((x) => x.id === row.id);
    console.log(`assignment: ${cls.code} ${row.title}`);
    const others = fx.index.rows.filter((r) => r.c === row.c && r.id !== row.id && ['assignment', 'quiz', 'discussion'].includes(r.kind) && r.href);
    st.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
    st.working = { [row.id]: ['Paper.docx'] };
    const joySnap = { v: 1, celebrate: true, items: { [row.id]: [Number(a.points) || 50, cls.slug, 0] }, classes: { [cls.slug]: [cls.code, 120, 400] } };
    await b.seed({ lastAttemptAt: new Date().toISOString(), joySnap, haloWeekOpen: { open: true, at: new Date().toISOString() } });
    const hpId = await itemIdIn(b, row.id);

    // ---- before: Student Home has it ----
    let p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1000 });
    await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6, 20000, 200);
    await sleep(1200);
    const homeLook = () =>
      p.evaluate(([slug, title, id]) => {
        const card = [...document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')].find((c) => (c.querySelector('a[href^="/courses/"]')?.getAttribute('href') || '').includes(slug));
        const box = card?.querySelector('[data-haloplus="card-next"]');
        const strip = [...document.querySelectorAll('[data-haloplus="week-strip"] i')].filter((i) => (i.getAttribute('title') || '').includes(title));
        const chip = document.querySelector(`[data-haloplus="home-calendar"] .hp-chip[data-id="${CSS.escape(id)}"]`);
        const wk = document.querySelector('[data-haloplus="week"]')?.shadowRoot?.textContent || '';
        return {
          next: box ? [...box.querySelectorAll('.hp-n-row:not(.hp-n-just) .hp-n-t')].map((t) => t.textContent) : null,
          just: box ? [...box.querySelectorAll('.hp-n-just .hp-n-t')].map((t) => t.textContent) : [],
          dot: strip.length ? strip.every((i) => i.classList.contains('hp-dd')) : null,
          chip: chip ? { done: chip.classList.contains('hp-done') && !!chip.querySelector('.hp-check') } : null,
          due: Number((/(\d+) due/.exec(wk) || [])[1] ?? NaN),
        };
      }, [cls.slug, row.title, row.id]);
    const before = await homeLook();
    check(before.next && before.next.includes(row.title) && before.dot === false, `${tag}: before: ${cls.code}'s NEXT has "${row.title}" and the week strip's dot is filled`);
    await p.close();

    // ---- an assignment, through Halo's own Submit Assignment ----
    p = await b.page(`https://halo.gcu.edu/courses/${cls.slug}/course-units/${row.unit}`, { width: 1366, height: 900 });
    await until(async () => (await p.locator('[data-haloplus="topic"]').count()) === 1, 10000, 200);
    const topicBefore = (await p.locator('[data-haloplus="topic"]').textContent()).trim();
    const pillText = () => p.evaluate(() => [...document.querySelectorAll('[data-haloplus]')].map((h) => h.shadowRoot?.querySelector('.pill')?.textContent || '').join(' ').trim());
    await p.locator(`[data-open="${row.id}"]`).click();
    await sleep(500);
    await p.locator('#guide_anchor_submitAssignment_submit').click();
    await until(async () => (await p.locator('.hp-review .hp-submit').count()) === 1, 8000, 100);
    const g0 = b.bench.calls.gateway.length;
    const d0 = drops.length;
    const frames = [];
    const shotDir = `${OUT}/.frames-${BROWSER}-${tag}`;
    rmSync(shotDir, { recursive: true, force: true });
    mkdirSync(shotDir, { recursive: true });
    await p.locator('.hp-review .hp-submit').click();
    const t0 = Date.now();
    // Frames of the moment (for the GIF), as it happens.
    for (let i = 0; i < 26; i++) {
      const f = `${shotDir}/${String(i).padStart(2, '0')}.png`;
      await p.screenshot({ path: f, clip: { x: 1366 - 420, y: 900 - 200, width: 420, height: 200 } });
      frames.push(f);
      await sleep(60);
    }
    const c1 = await card(p);
    check(c1 && c1.done && c1.text.startsWith(`${row.title} · done`) && c1.pts === `+${Number(a.points) || 50} pts` && /done this week|Week done/.test(c1.week || ''), `${tag}: the moment at once: ${JSON.stringify(c1)}`);
    await p.screenshot({ path: `${OUT}/${tag}-1-moment.png` });
    const marks = (await b.read('haloMarks')).haloMarks || {};
    check(marks[hpId] && marks[hpId].h === row.id && marks[hpId].src === 'halo', `${tag}: this computer's mark at once (Halo+'s id, Halo's id with it)`);
    await until(async () => drops.slice(d0).some((d) => d.body && d.body.mark && d.body.mark.id === hpId && d.body.mark.done === true), 4000, 100);
    const sent = drops.slice(d0).find((d) => d.body && d.body.mark && d.body.mark.id === hpId && d.body.mark.done === true);
    check(!!sent && sent.at - t0 < 4000, `${tag}: and the account's, at once (${sent ? sent.at - t0 : '-'} ms)`);
    // Halo's submission view, closed back to the topic (as a student would): the count ticks up.
    await p.locator('[data-testid="full_page_header_close_button"]').click().catch(() => undefined);
    await until(async () => /^\d+ of \d+ done/.test(((await p.locator('[data-haloplus="topic"]').textContent()) || '').trim()) && ((await p.locator('[data-haloplus="topic"]').textContent()) || '').trim() !== topicBefore, 4000, 100);
    const topicAfter = (await p.locator('[data-haloplus="topic"]').textContent()).trim();
    const ticked = await p.evaluate(() => document.querySelector('[data-haloplus="topic"]').classList.contains('hp-tick'));
    check(Number(topicAfter.split(' ')[0]) === Number(topicBefore.split(' ')[0]) + 1 && ticked, `${tag}: back on the topic, its count ticks up: "${topicBefore}" → "${topicAfter}"`);
    await until(async () => b.bench.calls.gateway.slice(g0).some((c) => c.op === 'StudentAssessmentDetails' && c.vars.courseClassSlugId === cls.slug && c.at - t0 > 2500), 12000, 200);
    await sleep(1500);
    const asked = b.bench.calls.gateway.slice(g0).filter((c) => c.op === 'StudentAssessmentDetails' && !c.vars.courseUnitId);
    check(asked.length >= 1 && asked.every((c) => c.vars.courseClassSlugId === cls.slug), `${tag}: then that one class read again from Halo (${asked.map((c) => c.vars.courseClassSlugId.slice(0, 8)).join(', ')})`);
    const syncOps = b.bench.calls.gateway.slice(g0).filter((c) => /CourseClassesForUser|getCourseClassesForUser/i.test(c.op || ''));
    check(syncOps.length === 0, `${tag}: and no sync (${syncOps.length} class-list reads)`);
    const pill = await pillText();
    check(!pill.includes(row.title), `${tag}: the pill no longer names it ("${pill.slice(0, 60)}")`);
    await sleep(5000);
    await p.close();
    // A GIF of the moment (plain only: the light page; and dark under Better Halo).
    try {
      execFileSync('python3', ['-c', `from PIL import Image\nimport glob\nfs=sorted(glob.glob('${shotDir}/*.png'))\nims=[Image.open(f).convert('P', palette=Image.ADAPTIVE, colors=255) for f in fs]\nims[0].save('${OUT}/${tag}-moment.gif', save_all=True, append_images=ims[1:]+[ims[-1]]*12, duration=90, loop=0, disposal=2)`]);
      rmSync(shotDir, { recursive: true, force: true });
    } catch (e) {
      console.log(`(no GIF: ${e.message.split('\n')[0]})`);
    }

    // ---- Student Home after: ticked off once, then gone; strip, calendar and This week with it ----
    p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1000 });
    await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6, 20000, 200);
    await until(async () => (await homeLook()).just.length > 0, 5000, 80);
    const tick = await homeLook();
    check(tick.just.includes(row.title), `${tag}: Student Home: ${cls.code}'s NEXT ticks it off (${JSON.stringify(tick.just)})`);
    await sleep(350);
    await p.locator('[data-haloplus="card-next"]', { has: p.locator('.hp-n-just') }).first().screenshot({ path: `${OUT}/${tag}-2-next-tick.png` });
    await until(async () => (await homeLook()).just.length === 0, 6000, 150);
    await sleep(400);
    const after = await homeLook();
    check(!after.next.includes(row.title) && after.just.length === 0, `${tag}: then drops it (${JSON.stringify(after.next)})`);
    check(after.dot === true, `${tag}: the week strip's dot for it is hollow (done)`);
    check(after.chip && after.chip.done, `${tag}: the calendar's chip for it is checked`);
    check(after.due === before.due - 1, `${tag}: This week counts one fewer due (${before.due} → ${after.due})`);
    await p.screenshot({ path: `${OUT}/${tag}-3-home-after.png` });
    await p.close();
    p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1000 });
    await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6, 20000, 200);
    await sleep(2500);
    check((await homeLook()).just.length === 0, `${tag}: the next Student Home does not tick it off again`);
    await p.close();

    // ---- a DQ response, a quiz finished, an ordinary post, a failure ----
    const dq = others.find((r) => r.kind === 'discussion') || fx.index.rows.find((r) => r.kind === 'discussion' && r.href);
    const dqCls = fx.index.classes[dq.c];
    p = await b.page(`https://halo.gcu.edu/courses/${dqCls.slug}/course-units/${dq.unit}#discussion-submission/${dq.id}/fid/F1`, { width: 1366, height: 900 });
    await sleep(1500);
    await haloToast(p, 'Discussion response has been submitted');
    const dqId = await itemIdIn(b, dq.id);
    await until(async () => !!((await b.read('haloMarks')).haloMarks || {})[dqId], 3000, 100);
    check(!!((await b.read('haloMarks')).haloMarks || {})[dqId] && (await card(p)), `${tag}: a DQ response ("Discussion response has been submitted"): done, with its moment`);
    await p.close();
    const quiz = fx.index.rows.find((r) => r.kind === 'quiz');
    if (quiz) {
      p = await b.page(`https://halo.gcu.edu/quiz/${quiz.id}/start-quiz/uq-1`, { width: 1366, height: 900 });
      await sleep(1500);
      await haloToast(p, 'Quiz successfully submitted<br />See Gradebook for more details');
      const qId = await itemIdIn(b, quiz.id);
      await until(async () => !!((await b.read('haloMarks')).haloMarks || {})[qId], 3000, 100);
      check(!!((await b.read('haloMarks')).haloMarks || {})[qId] && (await card(p)), `${tag}: a quiz finished ("Quiz successfully submitted"): done, with its moment`);
      await p.close();
    }
    const m1 = Object.keys((await b.read('haloMarks')).haloMarks || {}).length;
    p = await b.page(`https://halo.gcu.edu/courses/${dqCls.slug}/course-units/${dq.unit}`, { width: 1366, height: 900 });
    await sleep(1500);
    const g1 = b.bench.calls.gateway.length;
    await haloToast(p, 'Discussion post has been submitted');
    await sleep(6500);
    const m2 = Object.keys((await b.read('haloMarks')).haloMarks || {}).length;
    const re = b.bench.calls.gateway.slice(g1).filter((c) => c.op === 'StudentAssessmentDetails' && c.vars.courseClassSlugId === dqCls.slug && !c.vars.courseUnitId);
    check(m2 === m1 && !(await card(p)) && re.length >= 1, `${tag}: an ordinary post or reply: nothing checked off, no moment; its class read again from Halo (${re.length})`);
    await haloToast(p, 'Failed to submit Assignment.', 'error');
    await sleep(1500);
    check(Object.keys((await b.read('haloMarks')).haloMarks || {}).length === m1 && !(await card(p)), `${tag}: a failure toast: nothing`);
    await p.close();

    // ---- Celebrations off; Free ----
    const two = others.filter((r) => r.kind === 'assignment' && r.unit).slice(0, 2);
    for (const [name, extra, moment] of [
      ['the Celebrations switch off', { joySnap: { ...joySnap, celebrate: false } }, false],
      ['Free', { tier: 'free', joySnap }, true],
    ]) {
      const r = two.shift();
      if (!r) continue;
      await b.store(extra);
      p = await b.page(`https://halo.gcu.edu/courses/${cls.slug}/course-units/${r.unit}#assignment-submission/${r.id}`, { width: 1366, height: 900 });
      await sleep(1500);
      st.grades[r.id] = { status: 'SUBMITTED' };
      await haloToast(p, 'Assignment has been submitted.');
      const id = await itemIdIn(b, r.id);
      await until(async () => !!((await b.read('haloMarks')).haloMarks || {})[id], 3000, 100);
      await sleep(400);
      const shown = !!(await card(p));
      check(!!((await b.read('haloMarks')).haloMarks || {})[id] && shown === moment, `${tag}: ${name}: done${moment ? ', with its moment' : ', no moment'}`);
      await p.close();
    }
    await b.store({ tier: 'max', joySnap });

    // ---- Halo, read twice, says it is not turned in: Halo is right ----
    const wrong = fx.index.rows.find((r) => r.kind === 'assignment' && r.unit && r.c !== row.c && !((b.bench.state.grades[r.id] || {}).status === 'SUBMITTED'));
    const wrongCls = fx.index.classes[wrong.c];
    st.grades[wrong.id] = { status: 'ACTIVE' };
    p = await b.page(`https://halo.gcu.edu/courses/${wrongCls.slug}/course-units/${wrong.unit}#assignment-submission/${wrong.id}`, { width: 1366, height: 900 });
    await sleep(1500);
    await haloToast(p, 'Assignment has been submitted.');
    const wId = await itemIdIn(b, wrong.id);
    await until(async () => !!((await b.read('haloMarks')).haloMarks || {})[wId], 3000, 100);
    const d1 = drops.length;
    await until(async () => !((await b.read('haloMarks')).haloMarks || {})[wId], 40000, 500);
    check(!((await b.read('haloMarks')).haloMarks || {})[wId] && drops.slice(d1).some((d) => d.body && d.body.mark && d.body.mark.id === wId && d.body.mark.done === false), `${tag}: Halo, read twice, still says not turned in: the mark taken back, here and in the account`);
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
