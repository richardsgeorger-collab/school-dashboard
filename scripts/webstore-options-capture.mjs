// The five Halo scenes for the new store screenshots (George's overnight brief, 2026-10-29), captured once at 2× in
// Chrome (never Edge) on the saved Halo page copies with the real extension and the demo student Maya Torres (made up):
// plain Halo, light, with Halo's purple bar and the school's sponsor logo where Halo+ puts it on Student Home (in the
// bar, on its white plate). The test pages carry a labelled stand-in for that logo; for these pictures it is replaced by
// the sponsor's wordmark (Better Halo's bundled copy of it, from BH_DIR, never copied into this repo), in one dark
// color. webstore-options-shots.mjs then builds both caption styles from these captures.
//   BH_DIR=<Better Halo unpacked> node scripts/webstore-options-capture.mjs   → .scratch/store-raw/*.png
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SUBMIT_REST, classPage, gradesGateway, rubricFor, topicGateway, topicPage } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const RAW = resolve('.scratch/store-raw');
mkdirSync(RAW, { recursive: true });
const W = 1280;
const H = 800;
const DAY = 864e5;
const BH = process.env.BH_DIR;
const logoFile = BH && join(BH, 'global-credit-union.svg');
if (!logoFile || !existsSync(logoFile)) throw new Error('BH_DIR with global-credit-union.svg is needed for the sponsor logo');
// The wordmark in one dark navy (Better Halo's copy draws it with its theme colors).
const LOGO = `data:image/svg+xml;base64,${Buffer.from(readFileSync(logoFile, 'utf8').replaceAll('var(--better-halo-foreground)', '#13294b').replaceAll('var(--better-halo-primary)', '#13294b')).toString('base64')}`;

/** For the pictures: the sponsor's wordmark in place of the test page's stand-in; no corner pill (it changes with the hour). */
const tidy = (p) =>
  p.evaluate((logo) => {
    for (const img of document.querySelectorAll('img')) if (/stand-in|sponsor/i.test(img.getAttribute('alt') || '') || /stand-in/.test(decodeURIComponent(img.src))) img.src = logo;
    for (const h of document.querySelectorAll('[data-haloplus]')) {
      const sr = h.shadowRoot;
      if (sr) {
        for (const img of sr.querySelectorAll('img')) if (/stand-in/.test(decodeURIComponent(img.src))) img.src = logo;
        if (!sr.querySelector('style[data-shot]')) {
          const s2 = document.createElement('style');
          s2.setAttribute('data-shot', '');
          s2.textContent = '.pill,.tip{display:none!important}';
          sr.append(s2);
        }
      }
    }
  }, LOGO);
const sessions = new WeakMap();
const sharp = async (b, p, width = W, height = H) => {
  const cdp = await b.ctx.newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  sessions.set(p, cdp);
  await sleep(900);
};
/** The page at 2× (Chrome's own capture: Playwright's would be at 1×, it does not know of the override). */
const grab = async (p, path) => {
  const { data } = await sessions.get(p).send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
const shot = async (p, name) => {
  await p.mouse.move(3, 3);
  await tidy(p);
  await sleep(700);
  await grab(p, `${RAW}/${name}.png`);
  console.log('captured', name);
};

const b = await openBench({ label: 'store-options', pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage }, rest: [SUBMIT_REST] });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx), topicGateway(b.fx));
await b.ctx.route('**/functions/v1/sync-drop', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, done: [] }) }));
try {
  const fx = b.fx;
  const now = Date.now();
  const idx = JSON.parse(JSON.stringify(fx.index));
  const exam = idx.rows.find((r) => r.c === 0 && ['assignment', 'quiz'].includes(r.kind) && Date.parse(r.cdue) > now + DAY && Date.parse(r.cdue) < now + 6 * DAY);
  if (exam) Object.assign(exam, { ns: 1, inp: 1, title: 'Exam 1' });
  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  await b.seed({ lastAttemptAt: new Date().toISOString(), haloIndex: idx, haloWeekOpen: { open: true, at: new Date().toISOString() } });
  const home = async () => {
    const p = await b.page('https://halo.gcu.edu/', { width: W, height: H });
    await sharp(b, p);
    await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="card-next"][aria-busy]').count()) === 0 && (await p.locator('[data-haloplus="week-strip"] .hp-sd').count()) > 0, 20000, 200);
    await sleep(1500);
    return p;
  };

  // 1. Search, "topic 3", on Student Home.
  let p = await home();
  await shot(p, 'home');
  const mod = (await p.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
  await p.keyboard.press(`${mod}+k`);
  await until(async () => (await p.locator('[data-haloplus="search-palette"]').count()) === 1, 8000, 100);
  await p.keyboard.type('topic 3', { delay: 40 });
  await sleep(1200);
  await shot(p, 'search');
  await p.close();

  // 2. The class cards: the grade and NEXT, at 1024 wide (two a row) so they are big.
  p = await b.page('https://halo.gcu.edu/', { width: 1024, height: 1500 });
  await sharp(b, p, 1024, 1500);
  await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="card-next"][aria-busy]').count()) === 0, 20000, 200);
  await sleep(1500);
  await shot(p, 'cards');
  await p.close();

  // 3. Every class on one calendar (a class's Calendar page, All classes).
  const cls = fx.payload.classes[0];
  p = await b.page(`https://halo.gcu.edu/courses/${cls.slugId}`, { width: W, height: H });
  await sharp(b, p);
  await until(async () => (await p.locator('[data-haloplus="calendar-switch"]').count()) === 1, 15000, 200);
  await p.locator('[data-hp-cal="all"]').click();
  await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 20000, 200);
  await sleep(1200);
  await shot(p, 'calendar');
  await p.close();

  // 4. The rubric under the assignment.
  const units = [];
  for (const c of fx.payload.classes) {
    const by = {};
    for (const a of c.assessments) (by[a.unitId] ??= []).push(a);
    for (const [unitId, list] of Object.entries(by)) units.push({ cls: c, unitId, items: list });
  }
  const pick = units.filter((u) => u.items.length && rubricFor(u.items[0])).sort((x, y) => y.items.length - x.items.length)[0];
  const rub = pick.items.find((a) => rubricFor(a));
  // Due as Halo's work usually is: 11:59 PM in Phoenix (06:59 UTC the next day), one day after another.
  pick.items.forEach((a, k) => (b.bench.state.grades[a.id] = { dueDate: `${new Date(now + (k + 2) * DAY).toISOString().slice(0, 10)}T06:59:00.000Z`, status: 'ACTIVE' }));
  p = await b.page(`https://halo.gcu.edu/courses/${pick.cls.slugId}/course-units/${pick.unitId}`, { width: W, height: H });
  await sharp(b, p);
  await sleep(2500);
  const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${rub.title}")`) });
  if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
  await card.locator('a[data-testid="print_rubric_link"]').click();
  await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 10000, 150);
  await sleep(600);
  await shot(p, 'rubric');
  console.log(`rubric: ${pick.cls.courseCode} ${rub.title}`);
  await p.close();

  // 5. Checked off the moment Halo confirms the submission (Halo's own Submit Assignment on the copy; nothing real).
  const rows = fx.index.rows.filter((r) => r.kind === 'assignment' && r.href && r.unit && Date.parse(r.cdue) > now + 3 * 3600e3 && Date.parse(r.cdue) < now + 5 * DAY).sort((x, y) => Date.parse(x.cdue) - Date.parse(y.cdue));
  const row = rows[0];
  const k = fx.index.classes[row.c];
  const a = fx.payload.classes.find((c) => c.slugId === k.slug).assessments.find((x) => x.id === row.id);
  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  b.bench.state.working = { [row.id]: ['Lab report.docx'] };
  await b.store({ joySnap: { v: 1, celebrate: true, items: { [row.id]: [Number(a.points) || 50, k.slug, 0] }, classes: { [k.slug]: [k.code, 120, 400] } } });
  p = await b.page(`https://halo.gcu.edu/courses/${k.slug}/course-units/${row.unit}`, { width: W, height: H });
  await sharp(b, p);
  await until(async () => (await p.locator('[data-haloplus="topic"]').count()) === 1, 10000, 200);
  await p.locator(`[data-open="${row.id}"]`).click();
  await sleep(500);
  await p.locator('#guide_anchor_submitAssignment_submit').click();
  await until(async () => (await p.locator('.hp-review .hp-submit').count()) === 1, 8000, 100);
  await tidy(p);
  await p.locator('.hp-review .hp-submit').click();
  await until(() => p.evaluate(() => !!document.getElementById('haloplus-joy')?.shadowRoot?.querySelector('.t')), 8000, 50);
  // The points count up and the confetti is in the air.
  // The submission's time as an afternoon (the pictures are made at night).
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('#__next *')) if (el.children.length === 0 && /^\s*Submitted on .+, \d+:\d+ [AP]M\s*$/.test(el.textContent)) el.textContent = el.textContent.replace(/\d+:\d+ [AP]M/, '4:12 PM');
  });
  await sleep(650);
  await grab(p, `${RAW}/checkoff.png`);
  console.log(`checkoff: ${k.code} ${row.title}`);
  await p.close();
} finally {
  await b.close();
}
