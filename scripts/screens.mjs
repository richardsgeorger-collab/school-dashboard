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
  ['item', '#/now', async (page) => { await page.click('.hero-title-btn'); await page.waitForTimeout(500); }],
  ['you-progress', '#/you?s=progress'],
  ['you-workload', '#/you?s=workload'],
  ['you-halo', '#/you?s=halo'],
  ['you-study', '#/you?s=study'],
  ['you-advanced', '#/you?s=advanced'],
  ['you-notifications', '#/you?s=notifications'],
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
  ['onboarding-payoff', '#/now', async (page) => { await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); }],
  // "Am I okay?": the one paragraph behind the status line.
  ['okay', '#/now', async (page) => { await page.click('.now-status-btn'); await page.waitForTimeout(500); }],
  // Back after five days away: what slipped, what changed, the one thing to start with.
  ['welcome-back', '#/now', async (page) => { await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 5); localStorage.setItem('school-dashboard:last-seen', d.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' })); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800); await page.evaluate(() => localStorage.removeItem('school-dashboard:last-seen')); }],
  ['levelup', '#/now', async (page) => { await page.evaluate(() => localStorage.setItem('school-dashboard:seen-level', '0')); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1400); await page.evaluate(() => localStorage.removeItem('school-dashboard:seen-level')); }],
  // Last: this one marks the day's items done in the seed, and every shot after it would see that.
  ['now-done', '#/now', async (page) => { await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }); for (const i of d.items) if (i.dueAt.slice(0, 10) <= today && i.status !== 'done') { i.status = 'done'; i.completedAt = new Date().toISOString(); } localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500); }],
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
  for (const [group, list] of [['seeded', SEEDED], ['fresh', FRESH]]) {
    const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    if (group === 'seeded') {
      await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
      await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.theme = 'system'; d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
    }
    for (const [name, route, act, full] of list) {
      if (only && !only.has(name)) continue;
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
console.log(`wrote ${(SEEDED.length + FRESH.length) * 2} screenshots to ${OUT}/`);
