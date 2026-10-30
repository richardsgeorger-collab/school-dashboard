// The real Halo+ UI for the Instagram reel and carousel (George, 2026-10-30), captured at 2× in Chrome (never Edge) on the
// saved Halo page copies with the real extension and the made-up demo student Maya Torres. No GCU logos or trademarks:
// the sponsor's logo spot (its tagline names GCU) is left empty, and nothing else carries GCU's marks. Stills and short
// frame sequences (search being typed, the submit moment with its confetti) go to marketing/reel/public/ui/.
//   node scripts/marketing-capture.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUBMIT_REST, classPage, gradesGateway, rubricFor, topicGateway, topicPage } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const OUT = resolve('marketing/reel/public/ui');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/search`, { recursive: true });
mkdirSync(`${OUT}/confetti`, { recursive: true });
const W = 1280;
const H = 800;
const DAY = 864e5;
const sessions = new WeakMap();
const sharp = async (b, p, width = W, height = H) => {
  const cdp = await b.ctx.newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  sessions.set(p, cdp);
  await sleep(800);
};
const grab = async (p, path) => {
  const { data } = await sessions.get(p).send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
/** No sponsor logo (its tagline names GCU), no corner pill (it changes with the hour). */
const tidy = (p) =>
  p.evaluate(() => {
    for (const el of document.querySelectorAll('[data-haloplus="sponsor"]')) el.style.visibility = 'hidden';
    for (const img of document.querySelectorAll('img')) if (/stand-in|sponsor/i.test(img.getAttribute('alt') || '') || /stand-in/.test(decodeURIComponent(img.src))) img.style.visibility = 'hidden';
    for (const h of document.querySelectorAll('[data-haloplus]')) {
      const sr = h.shadowRoot;
      if (!sr || sr.querySelector('style[data-shot]')) continue;
      const s = document.createElement('style');
      s.setAttribute('data-shot', '');
      s.textContent = '.pill,.tip{display:none!important} img[alt*="ponsor"]{visibility:hidden!important}';
      sr.append(s);
      for (const img of sr.querySelectorAll('img')) if (/stand-in/.test(decodeURIComponent(img.src))) img.style.visibility = 'hidden';
    }
  });
const still = async (p, name) => {
  await p.mouse.move(3, 3);
  await tidy(p);
  await sleep(600);
  await grab(p, `${OUT}/${name}.png`);
  console.log('still', name);
};

const b = await openBench({ label: 'marketing', pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage }, rest: [SUBMIT_REST] });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx), topicGateway(b.fx));
await b.ctx.route('**/functions/v1/sync-drop', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, done: [] }) }));
try {
  const fx = b.fx;
  const now = Date.now();
  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  await b.seed({ lastAttemptAt: new Date().toISOString(), haloWeekOpen: { open: true, at: new Date().toISOString() } });

  // 1. The class cards: the grade and what's next (1024 wide, two a row, tall so they are all there).
  let p = await b.page('https://halo.gcu.edu/', { width: 1024, height: 1700 });
  await sharp(b, p, 1024, 1700);
  await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="card-next"][aria-busy]').count()) === 0, 20000, 200);
  await sleep(1200);
  await still(p, 'cards');
  await p.close();

  // 2. Student Home, full width (the search bar, This week, the cards).
  p = await b.page('https://halo.gcu.edu/', { width: W, height: H });
  await sharp(b, p);
  await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="card-next"][aria-busy]').count()) === 0, 20000, 200);
  await sleep(1200);
  await still(p, 'home');
  // 3. Search, typed one letter at a time.
  const mod = (await p.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
  await p.keyboard.press(`${mod}+k`);
  await until(async () => (await p.locator('[data-haloplus="search-palette"]').count()) === 1, 8000, 100);
  await tidy(p);
  await sleep(300);
  await grab(p, `${OUT}/search/00.png`);
  const q = 'topic 3 quiz';
  for (let i = 0; i < q.length; i++) {
    await p.keyboard.type(q[i]);
    await sleep(260);
    await grab(p, `${OUT}/search/${String(i + 1).padStart(2, '0')}.png`);
  }
  console.log('search frames', q.length + 1);
  await p.close();

  // 4. Every class on one calendar.
  const cls = fx.payload.classes[0];
  p = await b.page(`https://halo.gcu.edu/courses/${cls.slugId}`, { width: W, height: H });
  await sharp(b, p);
  await until(async () => (await p.locator('[data-haloplus="calendar-switch"]').count()) === 1, 15000, 200);
  await p.locator('[data-hp-cal="all"]').click();
  await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 20000, 200);
  await sleep(1000);
  await still(p, 'calendar');
  await p.close();

  // 5. The rubric under the assignment.
  const units = [];
  for (const c of fx.payload.classes) {
    const by = {};
    for (const a of c.assessments) (by[a.unitId] ??= []).push(a);
    for (const [unitId, list] of Object.entries(by)) units.push({ cls: c, unitId, items: list });
  }
  const pick = units.filter((u) => u.items.length && rubricFor(u.items[0])).sort((x, y) => y.items.length - x.items.length)[0];
  const rub = pick.items.find((a) => rubricFor(a));
  pick.items.forEach((a, k) => (b.bench.state.grades[a.id] = { dueDate: `${new Date(now + (k + 2) * DAY).toISOString().slice(0, 10)}T06:59:00.000Z`, status: 'ACTIVE' }));
  p = await b.page(`https://halo.gcu.edu/courses/${pick.cls.slugId}/course-units/${pick.unitId}`, { width: W, height: H });
  await sharp(b, p);
  await sleep(2500);
  const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${rub.title}")`) });
  if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
  await card.locator('a[data-testid="print_rubric_link"]').click();
  await until(async () => (await card.locator('[data-testid="hp-rubric-total"]').count()) === 1, 10000, 150);
  await still(p, 'rubric');
  await p.close();

  // 5b. Max's line on an assignment's own Halo page: a due date an announcement moved, and a thing to bring.
  {
    const snap = JSON.parse(JSON.stringify(fx.snap));
    const target = snap.items.find((i) => i.h === rub.id) ?? snap.items.find((i) => pick.items.some((a) => a.id === i.h));
    if (target) {
      target.m = new Date(Date.parse(target.due) - 2 * DAY).toISOString();
      target.x = 1;
      target.xb = ['Bring two printed copies of your outline'];
      target.done = 0;
      await b.store({ tier: 'max', haloSnap: { ...snap, mx: 1 } });
      p = await b.page(`https://halo.gcu.edu/courses/${pick.cls.slugId}/course-units/${pick.unitId}`, { width: W, height: H });
      await sharp(b, p);
      await until(async () => (await p.locator('[data-haloplus="box"]').count()) > 0, 10000, 200);
      await sleep(600);
      const r = await p.locator('[data-haloplus="box"]').first().evaluate((e) => { const b = e.shadowRoot.querySelector('.b').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
      await still(p, 'maxbox2x');
      writeFileSync(`${OUT}/maxbox2x.json`, JSON.stringify(r));
      console.log('max line at', JSON.stringify(r));
      await p.close();
      await b.store({ haloSnap: fx.snap });
    }
  }

  // 6. The submit moment: the toast and the confetti, frame by frame.
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
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('#__next *')) if (el.children.length === 0 && /^\s*Submitted on .+, \d+:\d+ [AP]M\s*$/.test(el.textContent)) el.dataset.fixTime = '1';
  });
  await p.locator('.hp-review .hp-submit').click();
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 3200) {
    await p.evaluate(() => {
      for (const el of document.querySelectorAll('#__next *')) if (el.children.length === 0 && /^\s*Submitted on .+, \d+:\d+ [AP]M\s*$/.test(el.textContent)) el.textContent = el.textContent.replace(/\d+:\d+ [AP]M/, '4:12 PM');
    });
    await grab(p, `${OUT}/confetti/${String(n++).padStart(2, '0')}.png`);
  }
  console.log('confetti frames', n, `over ${Date.now() - t0} ms`, `${k.code} ${row.title}`);
  writeFileSync(`${OUT}/confetti/meta.json`, JSON.stringify({ frames: n, ms: Date.now() - t0 }));
  await p.close();
} finally {
  await b.close();
}
