// Screenshots of every screen, light and dark, against a running preview (npm run preview).
//   node scripts/screens.mjs <label>            → docs/screens/<label>/<screen>-<light|dark>.png  (iPhone 14)
//   VIEWPORT=laptop node scripts/screens.mjs <label>   → the same at 1280×800
//   VIEWPORT=desk node scripts/screens.mjs <label>     → the same at 1440×900
//   VIEWPORT=tiny node scripts/screens.mjs <label>     → the same at 320×568 (the smallest phone)
//   ONLY=now,landing node scripts/screens.mjs <label>  → just those screens
// Populated screens use the sample term (#/now?seed=1); onboarding and empty states use a fresh profile.
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const label = process.argv[2] ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = `docs/screens/${label}`;
mkdirSync(OUT, { recursive: true });
const SEEDED = [
  ['now', '#/now'],
  ['calendar', '#/calendar'],
  ['calendar-month', '#/calendar?v=month'],
  ['classes', '#/classes'],
  ['class', '#/classes', async (page) => { await page.click('.classes-list a'); await page.waitForTimeout(500); }],
  ['inbox', '#/inbox'],
  ['you', '#/you'],
  ['plans', '#/you?s=plan'],
  ['ai', '#/ai'],
  ['load', '#/load'],
  ['grades', '#/grades'],
  ['library', '#/library'],
  ['item', '#/now', async (page) => {
    await page.click('.hero-title-btn');
    await page.waitForTimeout(500);
    // Opening the hero's own sheet once duplicated the card (two siblings sharing a React key); keep it at one.
    const heroes = await page.evaluate(() => document.querySelectorAll('.now > .hero').length);
    if (heroes !== 1) throw new Error(`item: ${heroes} hero cards on Now with the sheet open; expected 1`);
  }],
  // The AI screens and the ingest review, on the first class: locked previews on this build, the real shape of each.
  ...['ingest', 'tutor', 'study', 'quiz'].map((r) => [r, '#/now', async (page) => { const id = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses[0].id); await page.goto(`${BASE}#/${r}?c=${id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); }]),
  ['looks', '#/looks?d=violet'],
  ['you-progress', '#/you?s=progress'],
  ['you-workload', '#/you?s=workload'],
  ['you-halo', '#/you?s=halo'],
  ['you-study', '#/you?s=study'],
  ['you-advanced', '#/you?s=advanced'],
  ['you-notifications', '#/you?s=notifications'],
  ['you-invite', '#/you?s=invite'],
  ['you-feedback', '#/you?s=feedback'],
  ['home-nudge', '#/now', async (page) => { await page.evaluate(() => localStorage.removeItem('school-dashboard:home-screen-nudge')); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600); await page.evaluate(() => localStorage.setItem('school-dashboard:home-screen-nudge', 'done')); }],
  ['you-display', '#/you?s=display'],
  ['palette', '#/now', async (page) => { await page.keyboard.press('Meta+KeyK'); await page.waitForTimeout(400); await page.keyboard.type('chem'); await page.waitForTimeout(400); }],
  // Announcements arrive the way a sync brings them: a Halo export posted to the window. The review sheet saves
  // them on mount; Escape closes it; the Inbox then has six posts to show in two panes.
  // The review sheet itself, as a sync opens it: what arrived, what changed, one line on whether everything came through.
  ['sync-review', '#/now', async (page) => {
    const chm = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113'));
    const post = (n, title, body) => ({ id: `rev-${n}`, forumId: 'f1', title, content: `<p>${body}</p>`, publishedAt: `2026-09-${String(10 + n).padStart(2, '0')}T15:00:00.000Z`, modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] });
    const assess = (n, title, due, pts) => ({ id: `a-${n}`, title, dueDate: due, points: pts, type: 'ASSIGNMENT', status: null, score: null, description: '' });
    const payload = { kind: 'halo-export', version: 1, build: 'shot', exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [{ id: `h-${chm.id}`, slugId: 'X', classCode: `${chm.code}-X`, courseCode: chm.code, name: chm.name, instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [assess(1, 'Chem Lab 4 report', '2026-10-09T23:59:00.000Z', 50), assess(2, 'Chem Quiz 3', '2026-10-12T23:59:00.000Z', 20)], announcements: [post(1, 'Lab 3 goggles', 'Bring your own splash goggles to lab from now on.')], resources: [], discussions: [], messages: [] }], alerts: [], problems: [] };
    await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
    await page.waitForTimeout(1800);
  }],
  // A sync from the current bookmark where Halo refused one class's announcements: the honest "not everything" path.
  ['sync-partial', '#/now', async (page) => {
    const cs = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.filter((c) => c.code === 'CHM-113' || c.code === 'ENG-105'));
    const cls = (c, posts) => ({ id: `h-${c.id}`, slugId: 'X', classCode: `${c.code}-X`, courseCode: c.code, name: c.name, instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [], announcements: posts, resources: [], discussions: [], messages: [] });
    const post = { id: 'sp-1', forumId: 'f1', title: 'Office hours moved', content: '<p>Office hours are Thursdays 1–2 this week only.</p>', publishedAt: '2026-09-24T15:00:00.000Z', modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] };
    const payload = { kind: 'halo-export', version: 1, build: '2026-09-24a', exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [cls(cs[0], [post]), cls(cs[1], undefined)], alerts: [], problems: [{ klass: 'ENG-105', kind: 'announcements', message: 'Internal server error', op: 'getForums', status: 500 }], pulls: ['assessments', 'grades', 'instructors', 'announcements', 'class facts', 'instructor feedback', 'rubrics', 'class resources', 'discussions', 'quiz results', 'alerts', 'inbox'] };
    await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
    await page.waitForTimeout(1800);
  }],
  ['inbox-full', '#/now', async (page) => {
    const chm = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113'));
    const post = (n, title, body) => ({ id: `shot-${n}`, forumId: 'f1', title, content: `<p>${body}</p>`, publishedAt: `2026-09-${String(10 + n).padStart(2, '0')}T15:00:00.000Z`, modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] });
    const posts = [
      post(1, 'Welcome to CHM-113', 'Welcome to General Chemistry. Office hours are Tuesdays 2–3 in the science building. Bring questions.'),
      post(2, 'Lab 3 goggles', 'Starting this week you must bring your own splash goggles to lab. No goggles, no lab, no points. Lab 3 (titration) will now be due Friday October 9 instead of the 2nd.'),
      post(3, 'DQ replies', 'A reminder that your initial post is due by Wednesday and you need to reply to at least two classmates by Sunday with substantive replies of 100 words or more.'),
      post(4, 'Exam 1', 'Exam 1 covers chapters 1 through 4. Bring a pencil and your calculator; no phones. Review the practice quiz first.'),
      post(5, 'Attached', 'Attached'),
      post(6, 'Reading for next week', 'Read chapters 5 and 6 before Monday. We will start with limiting reagents.'),
    ];
    const payload = { kind: 'halo-export', version: 1, build: 'shot', exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [{ id: `h-${chm.id}`, slugId: 'X', classCode: `${chm.code}-X`, courseCode: chm.code, name: chm.name, instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [], announcements: posts, resources: [], discussions: [], messages: [] }], alerts: [], problems: [] };
    await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
    await page.waitForTimeout(1800);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.goto(`${BASE}#/inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.click('.news-head').catch(() => undefined);
    await page.waitForTimeout(400);
  }],
  // The Max welcome, as it opens the moment the trial starts: four screens on the student's own classes.
  ['max-welcome', '#/now', async (page) => { await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.maxOnboarding = { startedAt: 'x', step: 'welcome', doneAt: null }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200); }],
  ['max-colour', '#/now', async (page) => { await page.click('.max-welcome button:has-text("Let\'s go")'); await page.waitForTimeout(400); await page.click('.accent-swatch[title="Violet"]'); await page.waitForTimeout(500); }],
  ['max-receipts', '#/now', async (page) => { await page.click('.max-welcome button:has-text("Keep")'); await page.waitForTimeout(500); }],
  ['max-tour', '#/now', async (page) => { await page.click('.max-welcome button:has-text("Next")'); await page.waitForTimeout(500); }],
  ['max-done', '#/now', async (page) => { await page.click('.max-welcome button:has-text("Take me to Now")'); await page.waitForTimeout(600); await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.accent = 'gold'; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); }],
  // The three tooltips on Now after onboarding, first stop.
  ['tour', '#/now', async (page) => { await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: null }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(900); await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding.tourDoneAt = 'x'; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); }],
  // The core promise, as it looks once it has happened: announcements read, one requirement attached to a real
  // assignment with the professor's words, the Inbox sorted into "Needs you". Posts arrive the normal way; the
  // read stamps are set on the stored posts (the ledger heals itself from them) and the requirement is put on the
  // item in local storage, so no model is called.
  ['inbox-read', '#/now', async (page) => {
    const chm = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113'));
    const post = (n, title, body) => ({ id: `read-${n}`, forumId: 'f1', title, content: `<p>${body}</p>`, publishedAt: `2026-09-${String(10 + n).padStart(2, '0')}T15:00:00.000Z`, modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] });
    const posts = [
      post(1, 'Welcome to CHM-113', 'Welcome to General Chemistry. Office hours are Tuesdays 2–3 in the science building.'),
      post(2, 'Lab goggles and Quiz 2', 'Starting this week you must bring your own splash goggles to lab. Also: Quiz 2 will now cover chapters 3 and 4, not just 3, and you need to show your work on the stoichiometry problems for credit.'),
      post(3, 'Exam 1 room', 'Exam 1 is in Room 204, not our usual room. Bring a pencil and your calculator; no phones.'),
      post(4, 'Attached', 'Attached'),
    ];
    const payload = { kind: 'halo-export', version: 1, build: 'shot', exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [{ id: `h-${chm.id}`, slugId: 'X', classCode: `${chm.code}-X`, courseCode: chm.code, name: chm.name, instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [], announcements: posts, resources: [], discussions: [], messages: [] }], alerts: [], problems: [] };
    await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // Stamp the posts as read (the ledger heals from these) and attach the requirement to Chem Quiz 2.
    await page.evaluate(async () => {
      const at = new Date().toISOString();
      const stamp = { 'read-1': ['Office hours Tuesdays 2–3, science building.', 0], 'read-2': ['Bring your own splash goggles to lab. Quiz 2 covers chapters 3 and 4; show your work on stoichiometry.', 2], 'read-3': ['Exam 1 is in Room 204. Pencil and calculator, no phones.', 1], 'read-4': [null, 0] };
      await new Promise((res, rej) => { const r = indexedDB.open('school-dashboard-announcements', 3); r.onerror = () => rej(r.error); r.onsuccess = () => { const db = r.result; const t = db.transaction('posts', 'readwrite'); const st = t.objectStore('posts'); const all = st.getAll(); all.onsuccess = () => { for (const p of all.result) if (stamp[p.id]) { p.actionsAt = at; p.actionsModifiedAt = p.modifiedAt ?? null; p.actionsSummary = stamp[p.id][0]; p.actionCount = stamp[p.id][1]; p.readAt = p.id === 'read-4' ? null : at; st.put(p); } }; t.oncomplete = () => { db.close(); res(); }; t.onerror = () => rej(t.error); }; });
      const d = JSON.parse(localStorage.getItem('school-dashboard:v1'));
      const quiz = d.items.find((i) => /Chem Quiz 2/.test(i.label));
      if (quiz) {
        const source = { kind: 'announcement', id: 'read-2', title: 'Lab goggles and Quiz 2', at: '2026-09-12T15:00:00.000Z', quote: 'Quiz 2 will now cover chapters 3 and 4, not just 3, and you need to show your work on the stoichiometry problems for credit.' };
        quiz.requirements = [
          { id: 'req-1', text: 'Study chapters 3 and 4, not just 3', dueAt: null, done: false, doneAt: null, gradedOn: true, redefinesDone: true, scope: 'instance', source, addedAt: at },
          { id: 'req-2', text: 'Show your work on the stoichiometry problems', dueAt: null, done: false, doneAt: null, gradedOn: true, scope: 'instance', source, addedAt: at },
        ];
        localStorage.setItem('school-dashboard:v1', JSON.stringify(d));
      }
    });
    await page.goto(`${BASE}#/inbox`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.click('.news-head').catch(() => undefined);
    await page.waitForTimeout(400);
  }],
  ['hero-required', '#/now', async (page) => {
    await page.evaluate(() => {
      const label = document.querySelector('.hero-title')?.textContent?.trim();
      const d = JSON.parse(localStorage.getItem('school-dashboard:v1'));
      const it = d.items.find((i) => i.label === label);
      if (it) {
        const source = { kind: 'announcement', id: 'read-2', title: 'This week', at: '2026-09-22T15:00:00.000Z', quote: 'Your reflection must cite two sources from the library database, not the open web, and include a screenshot of each.' };
        it.requirements = [
          { id: 'hr-1', text: 'Cite two sources from the library database', dueAt: null, done: false, doneAt: null, gradedOn: true, scope: 'instance', source, addedAt: new Date().toISOString() },
          { id: 'hr-2', text: 'Include a screenshot of each source', dueAt: null, done: false, doneAt: null, gradedOn: true, scope: 'instance', source, addedAt: new Date().toISOString() },
        ];
        localStorage.setItem('school-dashboard:v1', JSON.stringify(d));
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
  }],
  ['item-required', '#/classes', async (page) => { await page.click('.classes-list a'); await page.waitForTimeout(500); await page.click('.item-main:has-text("Chem Quiz 2")'); await page.waitForTimeout(500); }],
  ['onboarding-payoff', '#/now', async (page) => { await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); }],
  // The coach, opened from Now's side column (locked on this build, so the honest card with the trial shows).
  ['coach', '#/now', async (page) => { await page.click('.coach-ask'); await page.waitForTimeout(500); }],
  // "Am I okay?": the one paragraph behind the status line.
  // Done from the hero: the toast with Undo, then Undo puts the card back.
  ['done-toast', '#/now', async (page) => { await page.click('.hero-actions button[aria-label="Mark done"]'); await page.waitForTimeout(900); }],
  ['done-undone', '#/now', async (page) => { await page.click('.hero-actions button[aria-label="Mark done"]'); await page.waitForTimeout(900); await page.click('.time-ask-undo, .done-toast-undo'); await page.waitForTimeout(500); }],
  // Start pressed: the timer runs on the card and Done becomes the primary action.
  ['hero-started', '#/now', async (page) => { await page.click('.hero-actions .btn.primary:has-text("Start")'); await page.waitForTimeout(700); await page.click('.hero-actions .btn.quiet'); await page.waitForTimeout(400); }],
  ['okay', '#/now', async (page) => { await page.click('.now-status-btn'); await page.waitForTimeout(500); }],
  // Back after five days away: what slipped, what changed, the one thing to start with.
  ['welcome-back', '#/now', async (page) => { await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 5); localStorage.setItem('school-dashboard:last-seen', d.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' })); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800); await page.evaluate(() => localStorage.removeItem('school-dashboard:last-seen')); }],
  ['levelup', '#/now', async (page) => { await page.evaluate(() => localStorage.setItem('school-dashboard:seen-level', '0')); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1400); await page.evaluate(() => localStorage.removeItem('school-dashboard:seen-level')); }],
  // Mid-term: everything due before today done and scored (85–100%), so rings, percentages, projections and the
  // skip-impact line can be looked at. Idempotent, so any one of these can run on its own; they sit before now-done.
  ...['now', 'classes', 'class', 'grades', 'item', 'you-grades'].map((name) => [`graded-${name}`, name === 'class' ? '#/classes' : name === 'item' ? '#/now' : name === 'you-grades' ? '#/you?s=grades' : `#/${name}`, async (page) => {
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); let k = 0; for (const i of d.items) if (i.dueAt.slice(0, 10) < today && i.type !== 'participation') { i.status = 'done'; i.completedAt = i.dueAt; i.score = Math.round(i.points * (0.85 + ((k++ * 7) % 16) / 100)); } localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    if (name === 'class') { await page.click('.classes-list a'); await page.waitForTimeout(500); }
    if (name === 'item') { await page.click('.hero-actions .btn.quiet'); await page.waitForTimeout(400); }
  }]),
  // Last: this one marks the day's items done in the seed, and every shot after it would see that.
  ['now-done', '#/now', async (page) => { await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); for (const i of d.items) if (i.dueAt.slice(0, 10) <= today && i.status !== 'done') { i.status = 'done'; i.completedAt = new Date().toISOString(); } localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500); }],
];
// Time travel runs in a context of its own: an installed clock outlives its scene, and everything after it would
// otherwise be captured on that date.
const TIMED = [
  // Time travel (Playwright's clock): the Sunday review as it is offered on a Sunday morning, and Now in exam mode
  // five days before Chem Exam 1. The clock is pinned before the page loads and released after the shot.
  ['sunday', '#/now', async (page) => { await page.clock.install({ time: new Date('2026-09-27T17:00:00.000Z') }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(900); }],
  ['exam-mode', '#/now', async (page) => {
    // Tuesday Oct 27, 6 PM Phoenix, three days before Chem Exam 1. Not a Sunday, and not "back after days away".
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); localStorage.setItem('school-dashboard:last-seen', '2026-10-27'); });
    await page.clock.install({ time: new Date('2026-10-28T01:00:00.000Z') });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.evaluate(() => localStorage.removeItem('school-dashboard:last-seen'));
  }],
];
const FRESH = [
  ['onboarding-1', '#/now'],
  ['onboarding-halo', '#/now', async (page) => { await page.click('.onboard button:has-text("Get started")'); await page.waitForTimeout(400); }],
  ['onboarding-wait', '#/now', async (page) => { await page.click('.onboard button:has-text("Get started")'); await page.waitForTimeout(250); await page.click('.onboard button:has-text("I dragged it"), .onboard button:has-text("I made the bookmark")'); await page.waitForTimeout(400); }],
  ['now-empty', '#/now', async (page) => { await page.click('.onboard button:has-text("Skip for now")'); await page.waitForTimeout(400); }],
  ['landing', ''],
  ['landing-full', '', null, true],
  ['login', '#/login'],
  ['onboarding-start', '#/start'],
];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const vp = process.env.VIEWPORT;
const device = vp === 'desk' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } : vp === 'laptop' ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } : vp === 'tiny' ? { ...devices['iPhone SE'], viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 } : { ...devices['iPhone 14'], deviceScaleFactor: 2 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const scheme of ['light', 'dark']) {
  for (const [group, list] of [['seeded', SEEDED], ['timed', TIMED], ['fresh', FRESH]]) {
    const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    if (group !== 'fresh') {
      await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
      // The iPhone device carries an iPhone user agent, so the Home Screen nudge would sit on every phone shot; it gets its own.
      await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.theme = 'system'; d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); localStorage.setItem('school-dashboard:home-screen-nudge', 'done'); });
    }
    for (const [name, route, act, full] of list) {
      if (only && !only.has(name)) continue;
      if (process.env.VERBOSE) console.log(`${scheme} ${name}`);
      // Every fresh screen starts from nothing: onboarding progress must not carry over between shots.
      if (group === 'fresh') await page.evaluate(() => localStorage.clear()).catch(() => undefined);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      // A reload can restore the previous screen's scroll; every shot starts at the top.
      await page.evaluate(() => window.scrollTo(0, 0));
      if (act) await act(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${name}-${scheme}.png`, fullPage: !!full });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (wide > 2) console.log(`${name}-${scheme}: page overflows its width by ${wide}px`);
      // No icon may render over 48px: an unsized SVG once filled the Now screen. Rings and charts are not icons.
      const oversized = await page.evaluate(() => [...document.querySelectorAll('svg[data-icon]')].map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), where: el.parentElement?.className || el.parentElement?.tagName || '?' }; }).filter((x) => x.w > 48 || x.h > 48));
      if (oversized.length) throw new Error(`${name}-${scheme}: icon over 48px: ${oversized.map((x) => `${x.w}×${x.h} in ${x.where}`).join(', ')}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`wrote ${(SEEDED.length + TIMED.length + FRESH.length) * 2} screenshots to ${OUT}/`);
