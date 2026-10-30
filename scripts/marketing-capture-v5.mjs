// The real Halo+ UI for the redone carousel (George, 2026-10-30), captured at 3× in Chrome (never Edge) on the saved
// Halo page copies with the real extension and the made-up demo student Maya Torres. No GCU logos or trademarks.
// Each is one whole element, by its exact box (the carousel shows it big, so the narrow pages use a narrow window):
// - plain-card / plus-card: the same class card on Student Home with "Show Halo+ on Halo pages" off, then on;
// - rubric: Halo+'s rubric box under an assignment (a 560 px window);
// - maxcard: an assignment card with Max's "due date moved" line (a 560 px window).
//   node scripts/marketing-capture-v5.mjs   → marketing/reel/public/ui5/ (pieces.json)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUBMIT_REST, classPage, gradesGateway, rubricFor, topicGateway, topicPage } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const OUT = resolve('marketing/reel/public/ui5');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const DAY = 864e5;
const sessions = new WeakMap();
const sharp = async (b, p, width, height) => {
  const cdp = await b.ctx.newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: false });
  sessions.set(p, cdp);
  await sleep(800);
};
const HELP = `
  window.__deep = (sel, root = document) => { const out = [...root.querySelectorAll(sel)]; for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...window.__deep(sel, el.shadowRoot)); return out; };
  window.__box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
`;
const tidy = (p) =>
  p.evaluate(() => {
    for (const el of document.querySelectorAll('[data-haloplus="sponsor"]')) el.style.visibility = 'hidden';
    for (const img of document.querySelectorAll('img')) if (/stand-in|sponsor/i.test(img.getAttribute('alt') || '') || /stand-in/.test(decodeURIComponent(img.src))) img.style.visibility = 'hidden';
    for (const h of document.querySelectorAll('[data-haloplus]')) {
      const sr = h.shadowRoot;
      if (!sr || sr.querySelector('style[data-shot]')) continue;
      const s = document.createElement('style');
      s.setAttribute('data-shot', '');
      s.textContent = '.pill,.tip{display:none!important}';
      sr.append(s);
    }
    window.getSelection()?.removeAllRanges();
  });
/** One element, by its exact box, scrolled into view first. */
const shoot = async (p, handle, path) => {
  await handle.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await sleep(400);
  await p.mouse.move(3, 3);
  await tidy(p);
  await p.evaluate(HELP);
  await sleep(300);
  const r = await handle.evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const { data } = await sessions.get(p).send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
  writeFileSync(`${OUT}/${path}`, Buffer.from(data, 'base64'));
  return r;
};

const pieces = {};
const b = await openBench({ label: 'marketing5', pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage }, rest: [SUBMIT_REST] });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx), topicGateway(b.fx));
await b.ctx.route('**/functions/v1/sync-drop', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, done: [] }) }));
try {
  const fx = b.fx;
  const now = Date.now();
  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  await b.seed({ lastAttemptAt: new Date().toISOString(), haloWeekOpen: { open: true, at: new Date().toISOString() } });
  const ready = (p) => until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="card-next"][aria-busy]').count()) === 0, 20000, 200);

  // 1. The same class card, Halo+ on Halo pages off (plain Halo), then on.
  await b.store({ haloUiOn: { on: false, at: new Date(Date.now() + 3600e3).toISOString() } });
  let p = await b.page('https://halo.gcu.edu/', { width: 1024, height: 1400 });
  await sharp(b, p, 1024, 1400);
  await sleep(3500);
  const plainHalo = (await p.locator('[data-haloplus="card-next"]').count()) === 0;
  pieces.plain = { box: await shoot(p, await p.locator('#Home--main [class*="CourseCard_cardContainer"]').first().elementHandle(), 'plain-card.png'), plainHalo };
  await p.close();
  await b.store({ haloUiOn: { on: true, at: new Date(Date.now() + 7200e3).toISOString() } });
  p = await b.page('https://halo.gcu.edu/', { width: 1024, height: 1400 });
  await sharp(b, p, 1024, 1400);
  await ready(p);
  await sleep(1200);
  pieces.plus = { box: await shoot(p, await p.locator('#Home--main [class*="CourseCard_cardContainer"]').first().elementHandle(), 'plus-card.png') };
  console.log('cards: plain', JSON.stringify(pieces.plain), 'plus', JSON.stringify(pieces.plus));
  await p.close();

  // 2. The rubric box, in a narrow window.
  const units = [];
  for (const c of fx.payload.classes) {
    const by = {};
    for (const a of c.assessments) (by[a.unitId] ??= []).push(a);
    for (const [unitId, list] of Object.entries(by)) units.push({ cls: c, unitId, items: list });
  }
  const pick = units.filter((u) => u.items.length && rubricFor(u.items[0])).sort((x, y) => y.items.length - x.items.length)[0];
  const rub = pick.items.find((a) => rubricFor(a));
  pick.items.forEach((a, k) => (b.bench.state.grades[a.id] = { dueDate: `${new Date(now + (k + 2) * DAY).toISOString().slice(0, 10)}T06:59:00.000Z`, status: 'ACTIVE' }));
  p = await b.page(`https://halo.gcu.edu/courses/${pick.cls.slugId}/course-units/${pick.unitId}`, { width: 560, height: 1200 });
  await sharp(b, p, 560, 1200);
  await sleep(2500);
  const card = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${rub.title}")`) });
  if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
  await card.locator('a[data-testid="print_rubric_link"]').click();
  await until(async () => (await p.locator('[data-haloplus="rubric"]').count()) === 1, 10000, 150);
  await sleep(600);
  pieces.rubric = { box: await shoot(p, await p.locator('[data-haloplus="rubric"]').elementHandle(), 'rubric.png'), title: rub.title };
  console.log('rubric', JSON.stringify(pieces.rubric));
  await p.close();

  // 3. An assignment card with Max's line: a due date an announcement moved, and a thing to bring.
  const snap = JSON.parse(JSON.stringify(fx.snap));
  const target = snap.items.find((i) => i.h === rub.id) ?? snap.items.find((i) => pick.items.some((a) => a.id === i.h));
  target.m = new Date(Date.parse(target.due) - 2 * DAY).toISOString();
  target.x = 1;
  target.xb = ['Bring two printed copies of your outline'];
  target.done = 0;
  await b.store({ tier: 'max', haloSnap: { ...snap, mx: 1 } });
  p = await b.page(`https://halo.gcu.edu/courses/${pick.cls.slugId}/course-units/${pick.unitId}`, { width: 560, height: 1200 });
  await sharp(b, p, 560, 1200);
  await until(async () => (await p.locator('[data-haloplus="box"]').count()) > 0, 10000, 200);
  await sleep(800);
  const host = await p.locator('[data-haloplus="box"]').first().evaluateHandle((e) => e.closest('[data-testid="assessment_card"]') || e.parentElement);
  pieces.maxcard = { box: await shoot(p, host, 'maxcard.png'), title: target.t ?? null };
  console.log('max card', JSON.stringify(pieces.maxcard));
  await p.close();
} finally {
  writeFileSync(`${OUT}/pieces.json`, JSON.stringify(pieces, null, 1));
  await b.close();
}
