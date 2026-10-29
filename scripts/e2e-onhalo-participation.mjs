// Feature 9 (extension 0.12.0) on Halo's discussion page stand-in, with the demo student (made up): "This week: posted
// Mon, Wed · 1 more day needed" under the prompt, from Halo's own participation rule for the class and Halo's own count
// of the student's posts in the topic's participation week; refreshed after a post goes through. Nothing for a class
// with no rule, outside a participation week, when Halo does not answer, or on Free.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-participation.mjs
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { discussionPage, FORUM_REST, forumState, participationGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/participation');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);
const L = (() => {
  const c = { URL, Intl, Date };
  c.globalThis = c;
  runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), c);
  return c.HaloPlusOnLogic;
})();
const H = 3_600_000;
const PHX = 'America/Phoenix';

// Open a reply box (Halo's Reply), and make sure it opened: content added above can still be settling in a slower
// browser, so a click that landed on nothing is tried again.
const openReply = async (p, postId) => {
  for (let i = 0; i < 3; i++) {
    await p.locator(`button[data-post="${postId}"]`).click();
    if (await until(async () => (await p.locator(`.toggleReplyEditor[data-for="${postId}"] .ProseMirror`).count()) === 1, 4000, 150)) return;
  }
  throw new Error(`the reply box for ${postId} did not open`);
};
for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `part-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/forums/discussion/[^/]+$': discussionPage }, rest: [FORUM_REST] });
  Object.assign(b.bench.state.gateway, participationGateway());
  const st = b.bench.state;
  try {
    const fx = b.fx;
    const now = Date.now();
    // This topic's participation week, as Halo dates it: started two days ago, ends in four.
    const idx = JSON.parse(JSON.stringify(fx.index));
    const k = idx.classes.findIndex((c) => c.code === 'COM-100');
    const com = idx.classes[k];
    idx.rows = idx.rows.filter((r) => !(r.c === k && r.kind === 'participation'));
    const start = new Date(now - 50 * H).toISOString();
    const end = new Date(now + 96 * H).toISOString();
    idx.rows.push({ c: k, kind: 'participation', id: 'part-now', title: 'Topic 3 Participation', href: `/courses/${com.slug}/forums/discussion`, start, cdue: end, due: end, type: 'PARTICIPATION' });
    await b.seed({ haloIndex: idx });
    const posts = [new Date(now - 30 * H).toISOString(), new Date(now - 29 * H).toISOString(), new Date(now - 2 * H).toISOString()];
    st.participation = { [com.id]: posts };
    const want = L.participationLine(posts, start, end, com.part.days, PHX, com.part.posts);
    const cls = fx.payload.classes.find((c) => c.courseCode === 'COM-100');
    const dq = cls.discussions[cls.discussions.length - 1];
    forumState(st, fx, dq.forumId);
    const url = `https://halo.gcu.edu/courses/${cls.slugId}/forums/discussion/${dq.forumId}`;

    // Before: switched off.
    await b.store({ haloFeat: { off: ['participation'], at: new Date().toISOString() } });
    let p = await b.page(url);
    if (!(await until(() => p.evaluate(() => window.__haloEditors === true), 30000, 200))) throw new Error("Halo's editor did not load on the stand-in");
    await sleep(1500);
    check((await p.locator('[data-haloplus="participation"]').count()) === 0, `${tag}: switched off: nothing`);
    await p.screenshot({ path: `${OUT}/${tag}-1-before.png` });
    await p.close();

    await b.store({ haloFeat: { off: [], at: new Date().toISOString() } });
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus="participation"]').count()) === 1, 10000, 200);
    let line = (await p.locator('[data-haloplus="participation"]').innerText()).trim();
    check(line === want && /needed/.test(want), `${tag}: "${line}"`);
    const under = await p.evaluate(() => /DiscussionDescriptionCard_discussionHeaderMeta/.test(document.querySelector('[data-haloplus="participation"]').previousElementSibling.className));
    check(under, `${tag}: under the prompt's title and dates`);
    const asked = b.bench.calls.gateway.filter((c) => c.op === 'StudentParticipation');
    check(asked.length === 1 && asked[0].vars.courseClassId === com.id && asked[0].vars.userId === 'user-maya', `${tag}: one question to Halo, for this class and student`);
    await p.screenshot({ path: `${OUT}/${tag}-2-after.png` });
    // A reply goes through; Halo counts it; the line follows.
    await openReply(p, forumState(st, fx, dq.forumId).posts[0].id);
    await p.locator(`.toggleReplyEditor .ProseMirror`).click();
    await p.keyboard.type('One more thought about listening in class today.', { delay: 4 });
    st.participation[com.id].push(new Date().toISOString());
    await p.locator('.toggleReplyEditor [data-testid="post_text_editor_submit"]').click();
    const want2 = L.participationLine(st.participation[com.id], start, end, com.part.days, PHX, com.part.posts);
    await until(async () => (await p.locator('[data-haloplus="participation"]').innerText()).trim() === want2, 10000, 300);
    line = (await p.locator('[data-haloplus="participation"]').innerText()).trim();
    check(line === want2, `${tag}: after a post: "${line}"`);
    await p.close();

    // Nothing: a class without a rule; outside a participation week; Halo silent; Free.
    const bio = fx.payload.classes.find((c) => c.courseCode === 'PSY-102');
    const bioDq = bio.discussions[0];
    forumState(st, fx, bioDq.forumId);
    p = await b.page(`https://halo.gcu.edu/courses/${bio.slugId}/forums/discussion/${bioDq.forumId}`);
    await sleep(3000);
    check((await p.locator('[data-haloplus="participation"]').count()) === 0, `${tag}: a class with no participation rule on Halo: nothing`);
    await p.close();
    const idx2 = JSON.parse(JSON.stringify(idx));
    idx2.rows = idx2.rows.filter((r) => r.id !== 'part-now');
    idx2.at = new Date().toISOString();
    await b.store({ haloIndex: idx2 });
    p = await b.page(url);
    await sleep(3000);
    check((await p.locator('[data-haloplus="participation"]').count()) === 0, `${tag}: no participation week now: nothing`);
    await p.close();
    await b.store({ haloIndex: idx });
    st.failGateway = true;
    p = await b.page(url);
    await sleep(3000);
    check((await p.locator('[data-haloplus="participation"]').count()) === 0, `${tag}: Halo does not answer: nothing`);
    st.failGateway = false;
    await p.close();
    // No Halo+ account on this computer yet: nothing (Free has it since 0.12.12).
    await b.store({ tier: null, haloSnap: null, haloLive: null, syncKey: null, lastSyncAt: null });
    p = await b.page(url);
    await sleep(3000);
    check((await p.locator('[data-haloplus="participation"]').count()) === 0, `${tag}: no account yet: nothing`);
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
