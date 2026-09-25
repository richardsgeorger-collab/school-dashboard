// Announcements: the bookmark carries them, a sync stores them without approval, Now says one quiet line, the AI pass
// turns one into findings that go through the same approval flow, and an unsynced class never looks clean.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const t = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const clickText = (sel, re) => page.$$eval(sel, (els, src) => { const b = els.find((e) => new RegExp(src).test(e.textContent)); if (!b) return false; b.click(); return true; }, re.source);

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': '*' };
const calls = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.anthropic.com/')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const body = JSON.parse(req.postData() ?? '{}');
  const tool = body.tool_choice?.name ?? 'text';
  const user = typeof body.messages?.at(-1)?.content === 'string' ? body.messages.at(-1).content : '';
  calls.push({ tool, posted: /Posted: \d{4}-\d{2}-\d{2}/.test(user), hasItems: /Planner items already tracked/.test(user) });
  if (tool !== 'announcement_findings') return req.respond({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: `unexpected ${tool}` } }) });
  const input = { summary: 'Goggles Thursday, and the Topic 3 quiz moved.', findings: [
    { kind: 'date_change', title: 'Topic 3 Quiz', date: '2026-09-25', time: '23:59', points: 0, quote: 'the Topic 3 quiz moves to Friday the 25th', confidence: 'high', item_id: '', note: 'It moved later.' },
    { kind: 'info', title: 'Bring goggles', date: '', time: '', points: 0, quote: 'bring your lab goggles on Thursday', confidence: 'high', item_id: '', note: 'Pack them Wednesday night.' },
  ] };
  return req.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 'tu', name: 'announcement_findings', input }], stop_reason: 'tool_use', usage: { input_tokens: 2400, output_tokens: 260 } }) });
});

await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle0' });
let s = await state();
const chm = s.courses.find((c) => c.code === 'CHM-113');
const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }));

// 1. Nothing synced: Now says so rather than implying the picture is complete.
console.log('never synced:', await t('.verify'));

// 2. A bookmark export carrying announcements, handed over the way the real one does.
const iso = (d) => `${d}T15:00:00.000Z`;
const shift = (d, n) => { const x = new Date(`${d}T12:00:00-07:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); };
// One assessment per class so the sync has something to apply; the announcements ride along with it.
const payload = { kind: 'halo-export', version: 1, exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: s.courses.map((c) => ({
  id: `h-${c.id}`, slugId: `s-${c.id}`, classCode: `${c.code}-101`, courseCode: c.code, name: c.name, stage: 'CURRENT', modality: 'ONGROUND', credits: 4, startDate: null, endDate: null,
  assessments: [{ id: `a-${c.id}`, title: `${c.code} Topic 4 Check`, description: 'A short check on Topic 4.', unit: 'Topic 4', unitSequence: 4, sequence: 1, startDate: null, dueDate: new Date(`${shift(today, 5)}T23:59:00-07:00`).toISOString(), points: 20, type: 'ASSIGNMENT', tags: [], inPerson: false, isGroupEnabled: false, requiresLopesWrite: false, status: 'ACTIVE', submittedAt: null, score: null,
    rubric: c.code !== 'CHM-113' ? null : { id: 'rb1', name: 'Topic 4 Check Rubric', criteria: [
      { id: 'c1', name: 'Correct setup', description: 'The equation chosen and the units are right.', points: 12, levels: [{ cellId: 'l1', name: 'Exemplary', description: 'Equation, units, and given values all correct.', points: 12 }, { cellId: 'l2', name: 'Developing', description: 'Right equation, units slipped.', points: 8 }] },
      { id: 'c2', name: 'Shown work', description: 'Each step is visible.', points: 8, levels: [{ cellId: 'l3', name: 'Exemplary', description: 'Every step shown.', points: 8 }] },
    ] },
    feedback: c.code !== 'CHM-113' ? null : { comment: 'Good setup. Watch your significant figures in step 3 — you lost a digit converting grams to moles.', gradedAt: iso(today), criteria: [{ criteriaId: 'c1', cellId: 'l2', comment: 'Units slipped on the conversion.' }], files: [{ id: 'f9', name: 'marked-up.pdf' }], post: null },
    quiz: c.code !== 'CHM-113' ? null : { userQuizId: 'uq1', finalScore: 14, answered: 10, correct: 7, incorrect: 3, submittedAt: iso(today), questions: [{ id: 'q1', type: 'MULTIPLE_CHOICE', content: 'Which reactant limits the product?', chosen: ['The one with the larger mass'] }] },
    attachments: c.code !== 'CHM-113' ? [] : [{ id: 'at1', resourceId: 'res1', title: 'Topic4_Rubric.pdf', downloadUrl: 'https://example.invalid/presigned' }] }],
  gradeScale: [{ label: 'A', minPercent: 90, maxPercent: 100 }, { label: 'B', minPercent: 80, maxPercent: 89.99 }, { label: 'C', minPercent: 70, maxPercent: 79.99 }],
  holidays: [{ title: 'Fall break', description: 'No classes', startDate: iso(shift(today, 30)), duration: 2, active: true }],
  participation: { description: 'Post on three separate days each week.', days: 3, posts: 1 },
  resources: c.code !== 'CHM-113' ? [] : [
    { id: 'cr1', title: 'Lab safety contract', description: 'Sign before the first lab.', instructorAdded: false, unit: null, files: [{ id: 'rf1', name: 'safety.pdf', kind: 'FILE', type: 'application/pdf' }] },
    { id: 'cr2', title: 'Extra worked examples', description: 'Posted after Tuesday.', instructorAdded: true, unit: 'Topic 4', files: [] },
  ],
  discussions: c.code !== 'CHM-113' ? [] : [{ forumId: 'dq1', title: 'Topic 4 DQ 1', description: null, startDate: null, dueDate: iso(shift(today, 2)), totalPosts: 18 }],
  messages: c.code !== 'CHM-113' ? [] : [{ id: 'msg1', forumId: 'if1', content: '<p>Saw your draft — the setup is fine, focus on the conclusion.</p>', publishedAt: iso(today), author: 'Dr. Awad', fromInstructor: true }],
  announcements: c.code !== 'CHM-113' ? [] : [
    { id: 'ann-1', forumId: 'f1', title: 'Week 4: goggles and a date change', content: '<p>Everyone, <b>bring your lab goggles on Thursday</b> — we are doing the flame test. Also the Topic 3 quiz moves to Friday the 25th.</p>', publishedAt: iso(today), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: true, acknowledged: false, resources: [{ id: 'r1', name: 'FlameTest_Prelab.pdf', kind: 'FILE', type: 'application/pdf' }] },
    { id: 'ann-2', forumId: 'f1', title: 'Office hours moved', content: '<p>Office hours are in 214 this week.</p>', publishedAt: iso('2026-09-14'), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
  ],
})), alerts: [{ id: 'al1', classId: `h-${s.courses[0].id}`, type: 'ANNOUNCEMENT', at: iso(today), read: false, title: 'Week 4: goggles and a date change', assessmentId: null, sender: 'Dr. Awad' }] };
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
await page.waitForSelector('.modal .diff-section, .modal .modal-actions', { timeout: 8000 });
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await page.waitForFunction(() => document.querySelector('.modal')?.textContent.includes('Applied'), { timeout: 8000 });
await sleep(600);
console.log('applied summary:', (await all('.modal li')).find((x) => /announcement/.test(x)));
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(400);

// 3. Now: one quiet line, without a reload, because the sync tells it to look again.
await sleep(900);
console.log('unread line:', await t('.now-news'));
console.log('verify now:', await t('.verify'));

// 4. Reading one: the pass gets the posting date and the planner list; findings go through the approval flow.
await page.evaluate(() => localStorage.setItem('school-dashboard:anthropic-key', JSON.stringify('sk-ant-e2e')));
await page.goto(`${BASE}#/inbox`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.news-item', { timeout: 8000 });
console.log('list:', (await all('.news-announcements .news-title')).join(' | '), '| unread marks:', await page.$$eval('.news-announcements .news-dot', (e) => e.length));
await page.$$eval('.news-announcements .news-head', (els) => els[0].click());
await sleep(400);
console.log('body:', (await t('.news-announcements .news-text'))?.slice(0, 80), '| attached:', (await all('.news-announcements .news-body .hint')).find((x) => /Attached/.test(x)));
await clickText('.news-announcements .news-body .btn', /What does this change/);
await page.waitForSelector('.modal .rev-mentions', { timeout: 10000 });
console.log('call:', JSON.stringify(calls[0]));
console.log('findings:', (await all('.modal .rev-mentions li')).map((x) => x.slice(0, 70)).join(' || '));
await page.screenshot({ path: (process.argv[2] ?? 'news.png').replace(/\.png$/, '-review.png'), fullPage: false });
// Approving one writes it to the planner through the same flow as a lecture finding.
const before = await state();
console.log('approve buttons:', (await all('.modal .rev-mentions .btn')).join(' | '));
await clickText('.modal .rev-mentions .btn', /Add it|Approve move/);
await sleep(700);
const after = await state();
const changed = after.items.filter((i) => { const b = before.items.find((x) => x.id === i.id); return !b || b.dueAt !== i.dueAt; }).map((i) => `${i.label} → ${i.dueAt.slice(0, 10)}`);
console.log('written to the planner:', changed.join(', ') || '(nothing)', '| items', before.items.length, '→', after.items.length);
await page.$$eval('.modal .modal-actions .btn.primary', (els) => els[0].click());
await sleep(400);
// Read once: it stays read, and the finding count shows instead of the button.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.news-item', { timeout: 8000 });
console.log('unread marks after reading:', await page.$$eval('.news-announcements .news-dot', (e) => e.length));
await page.$$eval('.news-announcements .news-head', (els) => els[0].click());
await sleep(300);
console.log('already read:', (await all('.news-announcements .news-body .btn')).join(' | '));
console.log('second call made:', calls.length);

// 8. Everything else the one click carried: the rubric, the instructor's words, class resources, the grade scale.
console.log('messages section:', await t('.news-messages .news-text'));
const st2 = await state();
const chmItem = st2.items.find((i) => i.title === 'CHM-113 Topic 4 Check');
console.log('rubric on the item:', chmItem?.rubric?.criteria?.length, 'criteria |', chmItem?.rubric?.criteria?.[0]?.name);
console.log('feedback:', chmItem?.feedback?.comment?.slice(0, 60), '| criterion level:', chmItem?.feedback?.criteria?.[0]?.cellId);
console.log('quiz:', chmItem?.quiz?.correct, 'of', (chmItem?.quiz?.correct ?? 0) + (chmItem?.quiz?.incorrect ?? 0), '| questions:', chmItem?.quiz?.questions?.length);
const chmCourse = st2.courses.find((c) => c.code === 'CHM-113');
console.log('class facts:', JSON.stringify({ scale: chmCourse?.gradeScale?.length, holidays: chmCourse?.holidays?.length, participation: chmCourse?.participation?.days }));
await page.goto(`${BASE}#/class?c=${chm.id}`, { waitUntil: 'networkidle0' });
await sleep(700);
console.log('class resources:', (await all('.class-resources li')).join(' | ').slice(0, 140));
await page.evaluate((label) => { const row = [...document.querySelectorAll('.item-row')].find((r) => r.textContent.includes(label)); row?.querySelector('.item-main').click(); }, chmItem.label);
await page.waitForSelector('.modal', { timeout: 6000 });
await sleep(500);
console.log('feedback shown:', (await t('.modal .feedback-comment'))?.slice(0, 60), '| rubric block:', !!(await page.$('.modal .rubric-block')));
await page.screenshot({ path: (process.argv[2] ?? 'news.png').replace(/\.png$/, '-item.png'), fullPage: false });
await page.$$eval('.modal .modal-actions .btn, .modal-close', (els) => (els.find((e) => /Cancel|Close/.test(e.textContent)) ?? els[0]).click());
await page.goto(`${BASE}#/grades`, { waitUntil: 'networkidle0' });
await sleep(600);
console.log('letter grades:', (await all('.grade-pct')).slice(0, 3).join(' | '));
// 8. The screen has to be findable. A News tab that only a synced payload links to is a screen that does not exist.
// A fresh tab, because the approval flow above leaves this one mid-navigation.
const page2 = await browser.newPage();
await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const t2 = (sel) => page2.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all2 = (sel) => page2.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
await page2.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
const navLabels = await all2('.nav-bottom .nav-link span');
console.log('bottom nav:', navLabels.join(' | '));
const clicked = await page2.$$eval('.nav-bottom .nav-link', (els) => {
  const a = els.find((e) => /News/.test(e.textContent));
  if (!a) return false;
  a.click();
  return true;
});
await sleep(500);
console.log('News reachable from the nav:', clicked, '| landed on:', await page2.evaluate(() => location.hash));
console.log('News heading:', await t2('.page-title'));
console.log('announcements on the screen:', (await all2('.news-announcements .news-title')).join(' | ') || '(none)');
console.log('what it says when empty:', (await t2('.lib-head .hint')) ?? '(no hint)');

// 9. The tally: a sync that got everything and a sync that got nothing must not read the same.
await page2.goto(`${BASE}#/you`, { waitUntil: 'networkidle0' });
const tally = (await all2('.pull-tally')).find((x) => /assignment/.test(x));
console.log('persistent tally in Settings:', tally ? tally.slice(0, 200) : '(none)');

// 10. Cancel must not discard what nothing asked about. This is the bug that lost 47 announcements: the assignment
// diff was empty, so the button read "Nothing to apply" and Cancel threw the reference data away with it.
await page2.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
const s2 = await page2.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')));
const chm2 = s2.courses.find((c) => c.code === 'CHM-113');
const quiet = {
  kind: 'halo-export', version: 1, build: 'e2e', exportedAt: new Date().toISOString(), source: 'bookmarklet',
  classes: [{
    id: `h-${chm2.id}`, slugId: `${chm2.code}-X`, classCode: `${chm2.code}-X`, courseCode: chm2.code, name: chm2.name,
    instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3,
    // The class exactly as the planner already has it, so the assignment diff has nothing to offer.
    assessments: s2.items.filter((i) => i.courseId === chm2.id && i.haloId).map((i) => ({
      id: i.haloId, title: i.title, description: null, unit: null, unitSequence: null, sequence: null,
      startDate: null, dueDate: i.dueAt, classDueDate: i.dueAt, points: i.points, type: 'ASSIGNMENT', tags: [],
      inPerson: false, isGroupEnabled: false, requiresLopesWrite: false, status: null, submittedAt: null, score: null,
    })),
    gradeScale: [{ label: 'A', minPercent: 90, maxPercent: 100 }],
    announcements: [{ id: 'ann-cancel', forumId: 'f1', title: 'Lab moved to 214', content: '<p>Thursday only.</p>', publishedAt: new Date().toISOString(), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] }],
    resources: [], discussions: [], messages: [],
  }],
  alerts: [], problems: [],
};
await page2.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), quiet);
await page2.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await sleep(900);
const keptLine = (await all2('.modal .pull-tally')).find((x) => /Saved already/.test(x));
console.log('kept line:', keptLine ? keptLine.slice(keptLine.indexOf('Saved already')) : '(none)');
console.log('primary button:', await page2.$eval('.modal .modal-actions .btn.primary', (e) => e.textContent.trim()));
console.log('secondary button:', (await all2('.modal .modal-actions .btn')).join(' | '));
// Press the one that throws everything away.
await page2.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Cancel|Close/.test(e.textContent)) ?? els[0]).click());
await sleep(600);
await page2.goto(`${BASE}#/inbox`, { waitUntil: 'networkidle0' });
await sleep(500);
const kept2 = await all2('.news-announcements .news-title');
console.log('after Cancel, announcements on News:', kept2.join(' | ') || '(none)');
console.log('the cancelled one survived:', kept2.some((x) => /Lab moved to 214/.test(x)));

await browser.close();
