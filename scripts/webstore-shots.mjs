// The Chrome Web Store screenshots (George, 2026-10-24): exactly 1280×800, 24-bit PNG (no alpha), a short caption on
// top, the demo student (Maya Torres, made up) only, never real student data. Five, Halo's Student Home first:
//   1. Student Home with "This week" open, on the Halo page copy (scripts/lib/haloStandIn.mjs) with the extension;
//   2. a class page with the pill and its list: "✓ Today's done · 5 due tomorrow";
//   3. an assignment's page with the one-line Halo+ note;
//   4. the semester GPA in Halo+ (made by scripts/screens-maya.mjs, captioned here);
//   5. kept from the 2026-10-12 set: the Inbox, "Due dates hidden in announcements, caught for you".
//   [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/webstore-shots.mjs   (after screens-maya.mjs for no. 4)
// Into webstore-upload/screenshots/ (kept out of git).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { haloPage, launch, sleep, until } from './lib/haloStandIn.mjs';

const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const OUT = resolve('webstore-upload/screenshots');
const OLD = resolve('webstore-upload/old-screenshots');
mkdirSync(OUT, { recursive: true });
mkdirSync(OLD, { recursive: true });
const BAR = 64;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/halo-snap-fixture.ts'], { encoding: 'utf8' }));
const NOW = Date.now();
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();
/** A time zone where it is mid-morning now, so "today" and "tomorrow" read the same whenever this runs. */
const MORNING_TZ = (() => {
  const n = Math.max(-12, Math.min(12, new Date(NOW).getUTCHours() - 10));
  return n === 0 ? 'Etc/GMT' : `Etc/GMT${n > 0 ? '+' : '-'}${Math.abs(n)}`;
})();
const day = (t, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(t));

/** A wall-clock time in MORNING_TZ, `days` from today, as an instant ("Etc/GMT+7" is seven hours behind UTC). */
const wall = (days, hh, mm) => {
  const off = Number((MORNING_TZ.match(/[+-]\d+$/) ?? ['0'])[0]);
  const [y, m, d] = day(NOW, MORNING_TZ).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, hh, mm) + off * 3_600_000).toISOString();
};

/**
 * Maya's snapshot: today's work done, five graded things due tomorrow (at Halo's own times: 11:59 PM, on the hour),
 * three later this week, and the one real extra step on one of her labs (closed-toe shoes, a lab coat, goggles).
 */
function mayaWeek() {
  const s = JSON.parse(JSON.stringify(fx.snap));
  s.tz = MORNING_TZ;
  s.syncedAt = iso(-0.4);
  s.pw = 2;
  s.top = null;
  const tomorrow = day(NOW + 86_400_000, MORNING_TZ);
  for (const i of s.items) if (day(Date.parse(i.due), MORNING_TZ) <= tomorrow) i.done = 1;
  for (const i of s.items) delete i.xb;
  const g = s.items.filter((i) => i.pts > 0 && !i.pa && i.h && !i.done);
  // Lab 4 (its page lists it near the top), kept open and due tomorrow.
  const lab = s.items.find((i) => /^Lab 4: Photosynthesis/.test(i.ht || i.t)) ?? g[0];
  const rest = g.filter((i) => i !== lab);
  if (!g.includes(lab)) g.unshift(lab);
  const when = [[1, 9, 0], [1, 12, 0], [1, 23, 59], [1, 23, 59], [3, 23, 59], [4, 23, 59], [5, 10, 30]];
  Object.assign(lab, { due: wall(1, 23, 59), hd: wall(1, 23, 59), done: 0, x: 1, xb: ['Bring a lab coat, goggles and closed-toe shoes'] });
  rest.slice(0, when.length).forEach((i, k) => Object.assign(i, { due: wall(...when[k]), hd: wall(...when[k]), done: 0 }));
  return { snap: s, rows: g, lab };
}

const SHOTS = [
  { file: '1-this-week-on-halo.png', caption: 'This week, on Halo’s home page' },
  { file: '2-today-and-tomorrow.png', caption: 'Today’s done. What’s due tomorrow.' },
  { file: '3-on-the-assignment.png', caption: 'What announcements added, on the assignment' },
  { file: '4-gpa.png', caption: 'Your semester GPA from your Halo grades' },
  { file: '5-announcements-caught.png', caption: 'Due dates hidden in announcements, caught for you', kept: true },
];

const { browser, ctx, proc, load } = await launch('chrome', 'store');
const raw = {};
try {
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'text/html', body: haloPage(fx, u.href) });
  });
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"done":[]}' }));
  const { worker } = await load(EXT);
  const { snap, lab } = mayaWeek();
  const store = (o) => worker.evaluate((x) => chrome.storage.local.set(x), o);
  await store({ tier: 'max', lastSyncAt: new Date().toISOString(), syncKey: 'a'.repeat(48), haloSnap: snap, haloLive: null, haloDone: null, haloMarks: null, haloWeekOpen: { open: true, at: new Date().toISOString() }, haloUi: { day: day(NOW, MORNING_TZ), first: true, reopens: 0, closes: 0, flagged: [], weekShown: day(NOW, MORNING_TZ) }, haloUiOn: null, haloBase: null });
  await sleep(1200);
  for (const pg of ctx.pages()) if (pg.url().startsWith('https://haloplus.app')) await pg.close().catch(() => undefined);
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 800 - BAR });
  await p.emulateMedia({ colorScheme: 'light' });

  // 1. Student Home, "This week" open.
  await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
  await until(() => p.evaluate(() => !!document.querySelector('[data-haloplus="week"]')?.shadowRoot?.querySelector('.r')), 8000, 200);
  await sleep(800);
  raw[SHOTS[0].file] = resolve(OUT, `.raw-${SHOTS[0].file}`);
  await p.screenshot({ path: raw[SHOTS[0].file] });

  // 2. A class page: the pill, its list open.
  await p.goto(`https://halo.gcu.edu/courses/${fx.courses[2].slug}`, { waitUntil: 'load' });
  const pill = await until(() => p.evaluate(() => document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector('.pill .short')?.textContent ?? null), 8000, 200);
  if (!/Today's done · 5 due tomorrow/.test(pill ?? '')) throw new Error(`the pill says "${pill}"`);
  await sleep(6500); // the day's peek, if any, has gone back in
  await p.locator('[data-haloplus="layer"] .pill').hover();
  await until(() => p.evaluate(() => !!document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector('.tip')), 3000, 100);
  await sleep(300);
  raw[SHOTS[1].file] = resolve(OUT, `.raw-${SHOTS[1].file}`);
  await p.screenshot({ path: raw[SHOTS[1].file] });
  await p.mouse.move(200, 200);

  // 3. An assignment's page: the one-line note.
  const course = fx.courses.find((c) => fx.snap.classes.find((k) => k.id === lab.c)?.slug === c.slug) ?? fx.courses[1];
  await p.goto(`https://halo.gcu.edu/courses/${course.slug}/course-units/u3`, { waitUntil: 'load' });
  await until(() => p.evaluate(() => !!document.querySelector('[data-haloplus="box"]')), 8000, 200);
  // The assignment with the note near the top of the screen.
  // The note in view, from the top of the page (Halo's bar is fixed).
  if (!(await p.evaluate(() => { const r = document.querySelector('[data-haloplus="box"]').getBoundingClientRect(); return r.bottom < window.innerHeight - 20; }))) throw new Error('the note is below the fold');
  await sleep(600);
  raw[SHOTS[2].file] = resolve(OUT, `.raw-${SHOTS[2].file}`);
  await p.screenshot({ path: raw[SHOTS[2].file] });
} finally {
  await browser.close().catch(() => undefined);
  proc.kill();
}

// The GPA card (screens-maya.mjs wrote it at full size): its top part under the caption.
const gpaSrc = resolve(OUT, '4-gpa.png');
if (!existsSync(gpaSrc)) throw new Error('run scripts/screens-maya.mjs first (it writes the GPA card)');
raw[SHOTS[3].file] = resolve(OUT, '.raw-4-gpa.png');
renameSync(gpaSrc, raw[SHOTS[3].file]);
// The kept one (2026-10-12): its screen as it was, under the same caption bar as the others (its old, taller bar cut off).
const kept = [resolve(OUT, '2-announcements-caught.png'), resolve(OLD, '2-announcements-caught.png')].find((f) => existsSync(f));
if (!kept) throw new Error('the kept Inbox screenshot is missing');
raw[SHOTS[4].file] = resolve(OUT, '.raw-5-announcements-caught.png');
copyFileSync(kept, raw[SHOTS[4].file]);

// Compose: the caption, then the screen.
const b2 = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await b2.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
for (const s of SHOTS) {
  const img = `data:image/png;base64,${readFileSync(raw[s.file]).toString('base64')}`;
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 800px; overflow: hidden; background: #f3f4f6; font-family: Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .bar { height: ${BAR}px; background: #171b21; color: #fff; display: flex; align-items: center; gap: 14px; padding: 0 36px; }
    .bar .mark { width: 11px; height: 11px; border-radius: 50%; background: #f2b84b; flex: none; }
    .bar b { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
    .screen { display: block; width: 1280px; height: ${800 - BAR}px; object-fit: cover; object-position: top; }
    .kept { display: block; width: 1280px; height: ${800 - BAR}px; background: #f3f4f6 url(${img}) no-repeat 0 -72px; }
  </style></head><body><div class="bar"><span class="mark"></span><b>${s.caption}</b></div>${s.kept ? '<div class="kept"></div>' : `<img class="screen" src="${img}">`}</body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await sleep(200);
  const out = resolve(OUT, s.file);
  await page.screenshot({ path: out });
  execFileSync('python3', ['-c', `from PIL import Image\nim = Image.open('${out}').convert('RGB')\nassert im.size == (1280, 800), im.size\nim.save('${out}')`]);
  rmSync(raw[s.file], { force: true });
  console.log('wrote', s.file);
}
await b2.close();
// The older shots out of the way (not part of the five).
for (const f of ['1-whats-due-next.png', '2-announcements-caught.png', '3-on-your-phone.png', '4-classes-and-grades.png', '5-ask-a-question.png']) {
  const from = resolve(OUT, f);
  if (existsSync(from)) renameSync(from, resolve(OLD, f));
}
console.log('five:', SHOTS.map((s) => s.file).join(', '));
