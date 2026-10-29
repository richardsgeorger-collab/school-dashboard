// The Chrome Web Store screenshots for Halo+ ON HALO (George, 2026-10-28, 0.12.7): exactly 1280×800, 24-bit PNG (no
// alpha), a short Halo+ caption on top, then Halo's own page with Halo's purple bar in view. The saved Halo page copies
// (scripts/lib/haloPages.mjs stand-ins) with the real extension, the demo student Maya Torres (made up) only, never real
// student data; plain Halo, light (the purple bar). No price talk. Left out of the pictures only: the test page's
// placeholder sponsor logo (it reads "stand-in", and a real company's brand does not belong in the store's pictures; a
// patch of the bar's purple over it) and Halo+'s corner pill (it says "Due in 2h" when the pictures are made late in the day, over the cards).
//   1-home.png      Student Home: search, This week, the week strip, the class cards with NEXT
//   2-calendar.png  a class's Calendar page with "All classes": every class on one calendar
//   3-search.png    ⌘K / Ctrl+K search open, "topic 3"
//   4-rubric.png    a topic page with an assignment's rubric open right under it
//   5-next.png      a close-up (125%) of two class cards: the grade and NEXT
//   node scripts/webstore-shots-onhalo.mjs   → webstore-upload/screenshots/ (the earlier set → old-screenshots/)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { classPage, gradesGateway, rubricFor, topicGateway, topicPage } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const OUT = resolve('webstore-upload/screenshots');
const OLD = resolve('webstore-upload/old-screenshots');
const RAW = resolve('webstore-upload/.raw-onhalo');
mkdirSync(OUT, { recursive: true });
mkdirSync(OLD, { recursive: true });
mkdirSync(RAW, { recursive: true });
const BAR = 64;
const W = 1280;
const H = 800 - BAR;
const DAY = 864e5;
const SHOTS = [
  { file: '1-home.png', caption: 'Halo’s home page, with your week at a glance' },
  { file: '2-calendar.png', caption: 'Every class, one calendar' },
  { file: '3-search.png', caption: 'Find anything in your classes: ⌘K or Ctrl+K' },
  { file: '4-rubric.png', caption: 'The rubric, right under the assignment' },
  { file: '5-next.png', caption: 'Your grade and what’s next, on every class' },
];
const raw = (f) => resolve(RAW, f);
/** For the pictures only: no placeholder sponsor logo, no corner pill (see above). */
const tidy = (p) =>
  p.evaluate(() => {
    // The placeholder logo under a patch of the bar's own purple, inside Halo+'s logo spot (so the page stays as it is).
    const sp = document.querySelector('[data-haloplus="sponsor"]');
    const bar = document.querySelector('#header_main_container header');
    if (sp && bar && !sp.querySelector('[data-shot]')) {
      const d = document.createElement('div');
      d.setAttribute('data-shot', '');
      d.style.cssText = `position:absolute;inset:-6px 0;background:${getComputedStyle(bar).backgroundColor};z-index:2`;
      sp.style.position = 'relative';
      sp.append(d);
    }
    for (const h of document.querySelectorAll('[data-haloplus]')) {
      if (!h.shadowRoot || h.shadowRoot.querySelector('style[data-shot]')) continue;
      const s2 = document.createElement('style');
      s2.setAttribute('data-shot', '');
      s2.textContent = '.pill,.tip{display:none!important}';
      h.shadowRoot.append(s2);
    }
  });

const b = await openBench({ label: 'store-onhalo', pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage } });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx), topicGateway(b.fx));
try {
  const fx = b.fx;
  const now = Date.now();
  // George-like: an exam done in class in BIO-181 (Halo's in-person flag).
  const idx = JSON.parse(JSON.stringify(fx.index));
  const exam = idx.rows.find((r) => r.c === 0 && ['assignment', 'quiz'].includes(r.kind) && Date.parse(r.cdue) > now + DAY && Date.parse(r.cdue) < now + 6 * DAY);
  if (exam) Object.assign(exam, { ns: 1, inp: 1, title: 'Exam 1' });
  await b.seed({ lastAttemptAt: new Date().toISOString(), haloIndex: idx });
  const home = async (width) => {
    const p = await b.page('https://halo.gcu.edu/', { width, height: H });
    await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="week-strip"] .hp-sd').count()) > 0, 20000, 200);
    await sleep(1500);
    await p.mouse.move(3, 3);
    await tidy(p);
    return p;
  };

  // 1. Student Home.
  let p = await home(W);
  const compact = (q) => q.evaluate(() => document.documentElement.hasAttribute('data-hp-home-compact'));
  if (!(await compact(p))) throw new Error('1-home: Student Home not compact');
  await p.screenshot({ path: raw('1-home.png') });
  await p.close();

  // 5. The close-up: Student Home at 1024px (two cards a row) drawn at 125%, from the top so Halo's bar is in it.
  p = await home(1024);
  const cdp = await b.ctx.newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: Math.round(H / 1.25), deviceScaleFactor: 1.25, mobile: false });
  await sleep(1200);
  await tidy(p);
  await sleep(600);
  if (!(await compact(p))) throw new Error('5-next: Student Home not compact');
  await p.screenshot({ path: raw('5-next.png') });
  await p.close();

  // 2. A class's Calendar page, "All classes".
  const cls = fx.payload.classes[0];
  p = await b.page(`https://halo.gcu.edu/courses/${cls.slugId}`, { width: W, height: H });
  await until(async () => (await p.locator('[data-haloplus="calendar-switch"]').count()) === 1, 15000, 200);
  await p.locator('[data-hp-cal="all"]').click();
  await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 20000, 200);
  await sleep(1200);
  await p.mouse.move(3, 3);
  await tidy(p);
  await p.screenshot({ path: raw('2-calendar.png') });
  await p.close();

  // 3. Search, "topic 3", on Student Home.
  p = await home(W);
  const mod = (await p.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
  await p.keyboard.press(`${mod}+k`);
  await until(async () => (await p.locator('[data-haloplus="search-palette"]').count()) === 1, 8000, 100);
  await p.keyboard.type('topic 3', { delay: 40 });
  await sleep(1200);
  await tidy(p);
  await sleep(600);
  if (!(await compact(p))) throw new Error('3-search: Student Home not compact');
  await p.screenshot({ path: raw('3-search.png') });
  await p.close();

  // 4. A topic page with an assignment's rubric open under it (Halo's own View Rubric).
  const units = [];
  for (const c of fx.payload.classes) {
    const by = {};
    for (const a of c.assessments) (by[a.unitId] ??= []).push(a);
    for (const [unitId, list] of Object.entries(by)) units.push({ cls: c, unitId, items: list, rub: list.filter((a) => rubricFor(a)) });
  }
  // A topic whose first assignment has a rubric: it opens right there, under Halo's bar.
  const pick = units.filter((u) => u.items.length && rubricFor(u.items[0])).sort((x, y) => y.items.length - x.items.length)[0] ?? units.filter((u) => u.rub.length)[0];
  pick.rub = [pick.items.find((a) => rubricFor(a))];
  b.bench.state.grades = {};
  pick.items.forEach((a, k) => (b.bench.state.grades[a.id] = { dueDate: new Date(now + (k + 1) * 30 * 3600e3).toISOString(), status: 'ACTIVE' }));
  p = await b.page(`https://halo.gcu.edu/courses/${pick.cls.slugId}/course-units/${pick.unitId}`, { width: W, height: H });
  await sleep(2500);
  const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${pick.rub[0].title}")`) });
  if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
  await card.locator('a[data-testid="print_rubric_link"]').click();
  await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 10000, 150);
  await sleep(600);
  const top = await card.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await p.mouse.move(3, 3);
  await tidy(p);
  await p.screenshot({ path: raw('4-rubric.png') });
  console.log(`rubric: ${pick.cls.courseCode} ${pick.rub[0].title}, card at ${Math.round(top)}px`);
  await p.close();
} finally {
  await b.close();
}

// Compose: the caption, then Halo's page.
const br = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await br.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
for (const s of SHOTS) {
  const img = `data:image/png;base64,${readFileSync(raw(s.file)).toString('base64')}`;
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 800px; overflow: hidden; background: #f3f4f6; font-family: Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .bar { height: ${BAR}px; background: #171b21; color: #fff; display: flex; align-items: center; gap: 14px; padding: 0 36px; }
    .bar .mark { width: 11px; height: 11px; border-radius: 50%; background: #f2b84b; flex: none; }
    .bar b { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
    .screen { display: block; width: 1280px; height: ${H}px; object-fit: cover; object-position: top left; }
  </style></head><body><div class="bar"><span class="mark"></span><b>${s.caption}</b></div><img class="screen" src="${img}"></body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await sleep(200);
  const out = resolve(OUT, `.new-${s.file}`);
  await page.screenshot({ path: out });
  execFileSync('python3', ['-c', `from PIL import Image\nim = Image.open('${out}').convert('RGB')\nassert im.size == (1280, 800), im.size\nim.save('${out}')`]);
}
await br.close();
// The earlier set → old-screenshots/ (kept, never overwritten), then the new five in place.
for (const f of readdirSync(OUT)) {
  if (f.startsWith('.') || !f.endsWith('.png') || SHOTS.some((s) => s.file === f)) continue;
  const to = existsSync(resolve(OLD, f)) ? resolve(OLD, `2026-10-24-${f}`) : resolve(OLD, f);
  renameSync(resolve(OUT, f), to);
}
for (const s of SHOTS) renameSync(resolve(OUT, `.new-${s.file}`), resolve(OUT, s.file));
rmSync(RAW, { recursive: true, force: true });
console.log('wrote', SHOTS.map((s) => s.file).join(', '));
