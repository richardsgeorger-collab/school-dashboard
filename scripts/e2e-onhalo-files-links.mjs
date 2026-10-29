// Features 28 and 15 (extension 0.12.0) on Halo's announcements stand-in, with the demo student (made up).
// 28: plain-text addresses in an announcement become links in Halo's own link style (Halo's class and colour, a new
// tab), only real addresses, never twice, never inside an existing link; Halo changing the text afterwards leaves no
// word doubled. 15: a PDF attachment opens in a viewer over the page, fetched from Halo's file service with the page's
// session, with Download and Open in Halo's viewer; Esc closes; a file that turns out not to be a PDF, or one Halo does
// not send, says so and offers Halo's viewer; a Word file opens as it always has.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-files-links.mjs
import { announcementsPage, FILE_REST, resourceGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/files-links');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);

for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `fl-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/announcements/?$': announcementsPage }, rest: [FILE_REST] });
  Object.assign(b.bench.state.gateway, resourceGateway(b.fx));
  const st = b.bench.state;
  try {
    await b.seed();
    const cls = b.fx.payload.classes[0];
    const url = `https://halo.gcu.edu/courses/${cls.slugId}/announcements`;
    st.announcements = {
      [cls.slugId]: [
        { ...cls.announcements[0], content: '<p>Review session: https://gcu.zoom.us/j/5550101?pwd=abc. Practice set at www.gcu.edu/library, and the syllabus says 3.5 hours (see Ch. 3.2). Email prof@gcu.edu.</p><p>Already a link: <a href="https://www.gcu.edu/help">https://www.gcu.edu/help</a></p><pre>https://in-code.example.com</pre>' },
        { ...cls.announcements[1], resources: [{ id: 'file-word', name: 'Rubric.docx', kind: 'FILE', type: 'forum_resource' }, { id: 'file-fake', name: 'Notes.pdf', kind: 'FILE', type: 'forum_resource' }] },
      ],
    };
    st.resources = { 'file-word': { id: 'file-word', name: 'Rubric.docx', type: 'forum_resource' }, 'file-fake': { id: 'file-fake', name: 'Notes.pdf', type: 'forum_resource' } };
    st.notPdf = ['file-fake'];

    // Before (switched off): plain text stays text, files open Halo's viewer in a new tab.
    await b.store({ haloFeat: { off: ['links', 'files'], at: new Date().toISOString() } });
    let p = await b.page(url);
    await sleep(2500);
    check((await p.locator('[data-haloplus-link]').count()) === 0, `${tag}: switched off: no links added`);
    await p.screenshot({ path: `${OUT}/${tag}-1-before.png` });
    await p.close();

    await b.store({ haloFeat: { off: [], at: new Date().toISOString() } });
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus-link]').count()) > 0, 8000, 200);
    await sleep(500);
    const links = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus-link]')].map((a) => ({ href: a.href, text: a.textContent, target: a.target, cls: a.className })));
    check(links.length === 2 && links[0].href === 'https://gcu.zoom.us/j/5550101?pwd=abc' && links[0].text === 'https://gcu.zoom.us/j/5550101?pwd=abc' && links[1].href === 'https://www.gcu.edu/library' && links[1].text === 'www.gcu.edu/library', `${tag}: the two real addresses, without the sentence's period (${links.map((l) => l.text).join(' | ')})`);
    check(links.every((l) => l.target === '_blank' && /HTMLDescription_link__/.test(l.cls)), `${tag}: in Halo's own link style, a new tab like Halo's links`);
    const body = (await p.locator('[class*="AnnouncementCard_announcementDescriptionContainer"] [data-testid="description"]').first().innerText()).replace(/\s+/g, ' ');
    check(body.includes('3.5 hours (see Ch. 3.2). Email prof@gcu.edu.') && (body.match(/gcu\.zoom\.us/g) || []).length === 1, `${tag}: every word once, decimals and an email address left alone`);
    check((await p.locator('pre [data-haloplus-link], a a').count()) === 0, `${tag}: nothing inside code or an existing link`);
    await p.screenshot({ path: `${OUT}/${tag}-2-links.png` });
    // Halo rewrites the text it owns (an edited announcement): the additions go, the new text is linked once.
    await p.evaluate(() => {
      const box = document.querySelector('[class*="AnnouncementCard_announcementDescriptionContainer"] [data-testid="description"] p');
      box.firstChild.nodeValue = 'Updated: the session moved to https://gcu.zoom.us/j/5550202 today. ';
    });
    await sleep(800);
    const after = (await p.locator('[class*="AnnouncementCard_announcementDescriptionContainer"] [data-testid="description"]').first().innerText()).replace(/\s+/g, ' ');
    check(!after.includes('5550101') && (after.match(/5550202/g) || []).length === 1, `${tag}: Halo changed the text: nothing doubled ("${after.slice(0, 90)}…")`);

    // 15: a PDF opens over the page.
    const d0 = st.downloads || 0;
    await p.locator('a[href^="/resource/"]', { hasText: 'Study guide.pdf' }).first().click();
    await until(async () => (await p.locator('[data-haloplus="file-viewer"] object').count()) === 1, 10000, 200);
    check((await p.locator('[data-haloplus="file-viewer"] object[type="application/pdf"]').count()) === 1 && p.context().pages().length >= 1, `${tag}: the PDF opens over the page`);
    check(p.url() === url, `${tag}: no new tab, still on the announcements`);
    check((st.downloads || 0) === d0 + 1, `${tag}: fetched once from Halo's file service, with the page's session`);
    const dl = await p.locator('[data-haloplus="file-viewer"] .dl').getAttribute('download');
    check(dl === 'Study guide.pdf', `${tag}: Download saves it as "${dl}"`);
    await sleep(800);
    await p.screenshot({ path: `${OUT}/${tag}-3-pdf-viewer.png` });
    await p.keyboard.press('Escape');
    await sleep(300);
    check((await p.locator('[data-haloplus="file-viewer"]').count()) === 0, `${tag}: Esc closes it`);
    // Not a PDF after all: it says so and offers Halo's viewer.
    await p.locator('a[href="/resource/file-fake"]').click();
    const msg = () => p.locator('[data-haloplus="file-viewer"] .msg').textContent().catch(() => '');
    await until(async () => /not a PDF/.test((await msg()) || ''), 8000, 200);
    check(/not a PDF/.test(await msg()) && (await p.locator('[data-haloplus="file-viewer"] .msg a[target="_blank"]').count()) === 1, `${tag}: a file that is not really a PDF: it says so, with Halo's viewer`);
    await p.keyboard.press('Escape');
    // A Word file: Halo's own way (its viewer, in a new tab).
    const [tab] = await Promise.all([p.context().waitForEvent('page', { timeout: 8000 }).catch(() => null), p.locator('a[href="/resource/file-word"]').click()]);
    check(!!tab && (await p.locator('[data-haloplus="file-viewer"]').count()) === 0, `${tag}: a Word file opens as it always has (Halo's viewer, new tab)`);
    if (tab) await tab.close();
    await p.close();

    // No Halo+ account on this computer yet: nothing (Free has it since 0.12.12).
    await b.seed({ tier: null, haloSnap: null, haloLive: null, syncKey: null, lastSyncAt: null });
    p = await b.page(url);
    await sleep(2500);
    const [tab2] = await Promise.all([p.context().waitForEvent('page', { timeout: 8000 }).catch(() => null), p.locator('a[href^="/resource/"]', { hasText: 'Study guide.pdf' }).first().click()]);
    check((await p.locator('[data-haloplus-link]').count()) === 0 && !!tab2, `${tag}: no account yet: no links added, files open Halo's way`);
    if (tab2) await tab2.close();
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
