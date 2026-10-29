// Features 18 and 19 (extension 0.12.0) on Halo's discussion page stand-in, with a real TipTap editor (the library
// Halo's editor is built on), Halo's own 5-second server autosave and its restore, and the demo student (made up).
// Drafts (0.12.1): typed text is kept on this computer; after a reload with nothing from Halo in the box, "Restore your
// draft from <time>?" shows right above the box, every time the box opens empty, and Restore puts the words back
// through the editor; Dismiss deletes the draft; when Halo brought its own draft back (the same words), nothing is
// offered; once the post goes through (Halo's message), the draft is gone. Word count: "N / 150 words" in Halo's
// footer only when the prompt states a minimum for that box (150 for the post, 75 for a reply), nothing otherwise.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-discussion.mjs
import { discussionPage, FORUM_REST, forumState } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/discussion');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);
const PROMPT = '<p>Describe one listening habit you want to build this week and why.</p><p>Your initial post should be at least 150 words. Reply to two classmates with at least 75 words each.</p>';
const editorsReady = async (p) => {
  const ok = await until(() => p.evaluate(() => window.__haloEditors === true), 30000, 200);
  if (!ok) throw new Error(`Halo's editor did not load on the stand-in (${p.url()})`);
};
const typeIn = async (p, sel, text) => {
  await p.locator(`${sel} .ProseMirror`).click();
  await p.keyboard.type(text, { delay: 4 });
};
const words = (p, sel) => p.evaluate((s) => {
  const w = document.querySelector(s);
  const halo = w && w.querySelector('.tiptap-editor [aria-live="polite"][aria-atomic="true"]');
  const ours = w && w.querySelector('[data-haloplus="words"]');
  const c = ours && ours.shadowRoot.querySelector('.c');
  return { halo: halo ? halo.textContent : null, haloHidden: halo ? halo.getBoundingClientRect().width <= 1 : null, ours: ours ? (c ? c.textContent.trim() : '') : null };
}, sel);

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
  const b = await openBench({ label: `disc-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/forums/discussion/[^/]+$': discussionPage }, rest: [FORUM_REST] });
  try {
    await b.seed();
    const cls = b.fx.payload.classes.find((c) => c.courseCode === 'COM-100');
    const dq = cls.discussions[0];
    const url = `https://halo.gcu.edu/courses/${cls.slugId}/forums/discussion/${dq.forumId}`;
    const forum = forumState(b.bench.state, b.fx, dq.forumId);
    forum.prompt = PROMPT;
    const jordan = forum.posts[0].id;
    const replySel = `.toggleReplyEditor[data-for="${jordan}"] [data-testid="post_text_editor"]`;
    const draftKeys = async () => Object.keys((await b.read(['haloDrafts'])).haloDrafts || {});

    // ---- 19: the word count against the minimum ----
    let p = await b.page(url);
    await editorsReady(p);
    await p.locator('#guide_anchor_discussion_reply').click();
    await until(async () => (await words(p, '#compose [data-testid="post_text_editor"]')).ours !== null, 8000, 200);
    let w = await words(p, '#compose [data-testid="post_text_editor"]');
    check(w.ours && w.ours.startsWith('0 / 150 words') && w.haloHidden, `${tag}: the new post box: "${w.ours}" (Halo's own count kept for screen readers)`);
    await typeIn(p, '#compose', 'Listening is a skill that improves when we slow down and ask a question back before we answer anything at all. ');
    await sleep(500);
    w = await words(p, '#compose [data-testid="post_text_editor"]');
    const n = Number(/^(\d+)/.exec(w.halo || '')?.[1]);
    check(n > 0 && w.ours.startsWith(`${n} / 150 words`), `${tag}: typing: Halo says "${w.halo}", Halo+ "${w.ours}"`);
    await p.screenshot({ path: `${OUT}/${tag}-words-post.png` });
    await openReply(p, jordan);
    await until(async () => (await words(p, replySel)).ours !== null, 8000, 200);
    w = await words(p, replySel);
    check(w.ours && w.ours.startsWith('0 / 75 words'), `${tag}: a reply box: "${w.ours}"`);
    await p.close();

    // ---- 18: drafts ----
    // Typed, then the page reloads before Halo's own autosave (5 s): Halo has nothing to bring back.
    p = await b.page(url);
    await editorsReady(p);
    await openReply(p, jordan);
    const text = 'Jordan, I like that you ask a question back. I tried it in lab today and it changed the whole conversation.';
    await typeIn(p, `.toggleReplyEditor[data-for="${jordan}"]`, text);
    await sleep(1500);
    check((await draftKeys()).some((k) => k.includes(`reply:${dq.forumId}:`)), `${tag}: the reply is kept on this computer while typing`);
    check(forum.sent.length === 0, `${tag}: nothing sent anywhere by Halo+ (Halo's own autosave had not run yet)`);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await editorsReady(p);
    check((await p.locator(replySel).count()) === 0, `${tag}: after the reload Halo has no draft: its reply box stays closed`);
    await openReply(p, jordan);
    const offered = await until(async () => (await p.locator('[data-haloplus="draft-offer"]').count()) === 1, 9000, 200);
    const ask = offered ? (await p.locator('[data-haloplus="draft-offer"] .t').innerText()).trim() : '';
    check(offered && /^Restore your draft from \d{1,2}:\d{2} (AM|PM)\?$/.test(ask), `${tag}: the empty reply box asks "${ask}"`);
    check(await p.evaluate((s) => {
      const h = document.querySelector('[data-haloplus="draft-offer"]');
      return !!h && h.nextElementSibling === document.querySelector(s);
    }, replySel), `${tag}: right above the reply box`);
    check((await p.locator('[data-haloplus="draft-offer"] button').allInnerTexts()).map((t) => t.trim().toLowerCase()).join('|') === 'restore|dismiss', `${tag}: with Restore and Dismiss`);
    await p.screenshot({ path: `${OUT}/${tag}-draft-offer.png` });
    // Not acted on: the next time the box opens empty, it asks again.
    await p.reload({ waitUntil: 'domcontentloaded' });
    await editorsReady(p);
    await openReply(p, jordan);
    check(await until(async () => (await p.locator('[data-haloplus="draft-offer"]').count()) === 1, 9000, 200), `${tag}: not answered: asked again the next time`);
    await p.locator('[data-haloplus="draft-offer"] .r').click();
    await sleep(600);
    const box = await p.evaluate((s) => document.querySelector(`${s} .ProseMirror`).innerText.trim(), replySel);
    check(box === text, `${tag}: Restore puts the words back in Halo's editor ("${box.slice(0, 40)}…")`);
    w = await words(p, replySel);
    check(/^\d+ words$/.test(w.halo || '') && Number(w.halo.split(' ')[0]) >= 18, `${tag}: Halo's editor took them as typing (its count: ${w.halo})`);
    await p.screenshot({ path: `${OUT}/${tag}-draft-restored.png` });
    // Halo's own autosave then runs; a reload brings Halo's draft back, and Halo+ offers nothing.
    await sleep(6500);
    check(forum.drafts.reply[jordan] && forum.sent.some((x) => x.draft), `${tag}: Halo's own autosave saved it on Halo's server`);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await editorsReady(p);
    await until(async () => (await p.locator(replySel).count()) === 1, 8000, 200);
    await sleep(4500);
    check((await p.locator('[data-haloplus="draft-offer"]').count()) === 0, `${tag}: Halo brought its own draft back: Halo+ offers nothing`);
    // It goes through: Halo's message, the box closes, the draft is gone; opening a reply again offers nothing.
    await p.locator(`${replySel} [data-testid="post_text_editor_submit"]`).click();
    await until(() => p.evaluate(() => /Discussion post has been submitted/.test(document.body.innerText)), 8000, 100);
    await sleep(800);
    check(!(await draftKeys()).some((k) => k.includes(`reply:${dq.forumId}:${jordan}`)), `${tag}: posted: the draft on this computer is deleted`);
    await openReply(p, jordan);
    await sleep(4500);
    check((await p.locator('[data-haloplus="draft-offer"]').count()) === 0, `${tag}: a new reply box offers nothing`);
    await p.close();

    // Dismiss deletes the draft; a two-word draft is never kept.
    await b.store({ haloDrafts: null });
    p = await b.page(url);
    await editorsReady(p);
    await p.locator('#guide_anchor_discussion_reply').click();
    await typeIn(p, '#compose', 'ok then');
    await sleep(1500);
    check(!(await draftKeys()).some((k) => k.endsWith(`post:${dq.forumId}`)), `${tag}: two words are not kept`);
    await typeIn(p, '#compose', ' and here is the rest of a longer new post about listening.');
    await sleep(1500);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await editorsReady(p);
    await p.locator('#guide_anchor_discussion_reply').click();
    check(await until(async () => (await p.locator('[data-haloplus="draft-offer"]').count()) === 1, 9000, 200), `${tag}: the new post's draft is offered`);
    await p.locator('[data-haloplus="draft-offer"] .x').click();
    await sleep(400);
    check(!(await draftKeys()).some((k) => k.endsWith(`post:${dq.forumId}`)), `${tag}: Dismiss deletes the draft`);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await editorsReady(p);
    await p.locator('#guide_anchor_discussion_reply').click();
    await sleep(4500);
    check((await p.locator('[data-haloplus="draft-offer"]').count()) === 0, `${tag}: dismissed: not offered again`);
    await p.close();

    // Show nothing: no minimum in the prompt; two different minimums for the same box; drafts switched off; Free.
    forum.prompt = '<p>Describe one listening habit you want to build this week.</p>';
    p = await b.page(url);
    await editorsReady(p);
    await p.locator('#guide_anchor_discussion_reply').click();
    await sleep(1500);
    w = await words(p, '#compose [data-testid="post_text_editor"]');
    check(w.ours === null && !w.haloHidden, `${tag}: no minimum stated: Halo's own count only ("${w.halo}")`);
    await p.close();
    forum.prompt = '<p>Write at least 150 words. Some weeks need at least 250 words.</p>';
    p = await b.page(url);
    await editorsReady(p);
    await p.locator('#guide_anchor_discussion_reply').click();
    await sleep(1500);
    w = await words(p, '#compose [data-testid="post_text_editor"]');
    check(w.ours === null, `${tag}: two different minimums: nothing`);
    await p.close();
    await b.seed({ haloFeat: { off: ['drafts', 'words'], at: new Date().toISOString() }, haloDrafts: null });
    forum.prompt = PROMPT;
    p = await b.page(url);
    await editorsReady(p);
    await openReply(p, forum.posts[1].id);
    await typeIn(p, `.toggleReplyEditor[data-for="${forum.posts[1].id}"]`, 'Adding one more thought to my own post here today.');
    await sleep(1500);
    w = await words(p, `.toggleReplyEditor[data-for="${forum.posts[1].id}"] [data-testid="post_text_editor"]`);
    check(w.ours === null && !(await draftKeys()).length, `${tag}: switched off: no count and nothing kept`);
    await p.close();
    // No Halo+ account on this computer yet (Free has it since 0.12.12): nothing.
    await b.seed({ tier: null, haloSnap: null, haloLive: null, syncKey: null, lastSyncAt: null });
    p = await b.page(url);
    await editorsReady(p);
    await p.locator('#guide_anchor_discussion_reply').click();
    await typeIn(p, '#compose', 'Listening is a skill that improves when we slow down and ask a question back before we answer anything at all. ');
    await sleep(1500);
    check((await p.locator('[data-haloplus]').count()) <= 1, `${tag}: no account yet: nothing on the discussion page but Halo+'s pill`);
    check(!(await draftKeys()).length, `${tag}: no account yet: nothing kept while typing`);
    // The before picture: the same box with Halo's own count only.
    await p.screenshot({ path: `${OUT}/${tag}-0-before-words-post.png` });
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
