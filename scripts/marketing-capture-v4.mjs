// The real Halo+ UI for the 3D laptop reel (round 4, George 2026-10-30), captured at 3× in Chrome (never Edge) on the
// saved Halo page copies with the real extension and the made-up demo student Maya Torres. No GCU logos or trademarks.
// Every capture is the whole laptop screen (a 1280×800 window), so the laptop in the reel shows real, whole pages, and
// pieces.json holds the boxes (in screen pixels) the camera pushes in to, the cursor goes to, and the build-ups use:
// - home-cards: Student Home scrolled to the first row of class cards; the first card, its NEXT rows, its tint.
// - calendar: a class's Calendar on "All classes"; Fri to Sun of both weeks and every chip in them.
// - search/NN: Halo+'s search at each letter of "topic 3 quiz" (a scrolling list ends after its last whole row).
// - submit: an assignment's Submit (Halo+'s review), then the done toast frame by frame (confetti off: the reel draws it).
// - week-0 / week-1: Student Home's This week before and after a box is ticked by hand.
//   node scripts/marketing-capture-v4.mjs   → marketing/reel/public/ui4/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUBMIT_REST, classPage, gradesGateway, topicGateway, topicPage } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const OUT = resolve('marketing/reel/public/ui4');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/search`, { recursive: true });
mkdirSync(`${OUT}/toast`, { recursive: true });
const W = 1280;
const H = 800;
const DAY = 864e5;
const sessions = new WeakMap();
const sharp = async (b, p) => {
  const cdp = await b.ctx.newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 3, mobile: false });
  sessions.set(p, cdp);
  await sleep(800);
};
/** The whole window, as it is on screen (no clip: scrolled pages too). */
const grab = async (p, path) => {
  await tidy(p);
  await p.evaluate(() => window.getSelection()?.removeAllRanges());
  const { data } = await sessions.get(p).send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
const HELP = `
  window.__deep = (sel, root = document) => { const out = [...root.querySelectorAll(sel)]; for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...window.__deep(sel, el.shadowRoot)); return out; };
  window.__box = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  window.__ground = (el) => { for (let e = el; e; e = e.parentElement || (e.getRootNode() && e.getRootNode().host)) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; } return '#ffffff'; };
`;
const help = (p) => p.evaluate(HELP);
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
    }
  });
const settle = async (p) => {
  await p.mouse.move(3, 3);
  await tidy(p);
  await help(p);
  await sleep(500);
};

const pieces = { screen: { w: W, h: H } };
const b = await openBench({ label: 'marketing4', pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage }, rest: [SUBMIT_REST] });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx), topicGateway(b.fx));
await b.ctx.route('**/functions/v1/sync-drop', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, done: [] }) }));
try {
  const fx = b.fx;
  const now = Date.now();
  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  await b.seed({ lastAttemptAt: new Date().toISOString(), haloWeekOpen: { open: true, at: new Date().toISOString() } });
  const ready = (p) => until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="card-next"][aria-busy]').count()) === 0, 20000, 200);

  // 1. Student Home, scrolled to the first row of cards.
  let p = await b.page('https://halo.gcu.edu/', { width: W, height: H });
  await sharp(b, p);
  await ready(p);
  await sleep(1200);
  await p.evaluate(() => {
    const c = document.querySelector('#Home--main [class*="CourseCard_cardContainer"]');
    c.scrollIntoView({ block: 'center' });
  });
  await sleep(600);
  await settle(p);
  const card = await p.evaluate(() => {
    const c = document.querySelector('#Home--main [class*="CourseCard_cardContainer"]');
    const next = c.querySelector('[data-haloplus="card-next"]');
    return { box: window.__box(c), next: window.__box(next), tint: getComputedStyle(next).backgroundColor, rows: window.__deep('.hp-n-row', next.shadowRoot || next).map(window.__box), ground: window.__ground(c) };
  });
  await grab(p, `${OUT}/home-cards.png`);
  pieces.homeCards = { src: 'home-cards.png', ...card };
  console.log('home cards', JSON.stringify(card.box), card.rows.length, 'rows');
  await p.close();

  // 2. The calendar, all classes.
  const cls = fx.payload.classes[0];
  p = await b.page(`https://halo.gcu.edu/courses/${cls.slugId}`, { width: W, height: H });
  await sharp(b, p);
  await until(async () => (await p.locator('[data-haloplus="calendar-switch"]').count()) === 1, 15000, 200);
  await p.locator('[data-hp-cal="all"]').click();
  await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 20000, 200);
  await sleep(1000);
  await settle(p);
  const cal = await p.evaluate(() => {
    const ch = document.querySelector('[data-haloplus="calendar-all"]');
    const weeks = window.__deep('.hp-week', ch.shadowRoot || ch);
    const cells = [];
    const days = [];
    for (const w of weeks) {
      const heads = [...w.querySelectorAll('.hp-dh')].slice(4, 7);
      const ds = [...w.querySelectorAll('.hp-day')].slice(4, 7);
      cells.push(...heads.map(window.__box), ...ds.map(window.__box));
      for (const d of ds) days.push({ box: window.__box(d), ground: window.__ground(d), chips: [...d.querySelectorAll('.hp-chip')].filter((c) => c.offsetParent).map(window.__box) });
    }
    const x = Math.min(...cells.map((c) => c.x));
    const y = Math.min(...cells.map((c) => c.y));
    return { focus: { x, y, w: Math.max(...cells.map((c) => c.x + c.w)) - x, h: Math.max(...cells.map((c) => c.y + c.h)) - y }, days, tab: (() => { const t = [...document.querySelectorAll('a, button')].find((e) => /^calendar$/i.test(e.textContent.trim())); return t ? window.__box(t) : null; })() };
  });
  await grab(p, `${OUT}/calendar.png`);
  pieces.calendar = { src: 'calendar.png', ...cal };
  console.log('calendar', JSON.stringify(cal.focus), cal.days.map((d) => d.chips.length).join(' '));
  await p.close();

  // 3. Search, at each letter, on Student Home.
  p = await b.page('https://halo.gcu.edu/', { width: W, height: H });
  await sharp(b, p);
  await ready(p);
  await sleep(1500);
  await settle(p);
  await grab(p, `${OUT}/home-top.png`);
  const mod = (await p.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
  await p.keyboard.press(`${mod}+k`);
  await until(async () => (await p.locator('[data-haloplus="search-palette"]').count()) === 1, 8000, 100);
  await help(p);
  const q = 'topic 3 quiz';
  const states = [];
  for (let i = 0; i <= q.length; i++) {
    if (i) await p.keyboard.type(q[i - 1]);
    await sleep(450);
    await p.evaluate(() => {
      const h = document.querySelector('[data-haloplus="search-palette"]');
      const l = window.__deep('.list', h.shadowRoot || h)[0];
      l.style.maxHeight = '';
      if (l.scrollHeight <= l.clientHeight + 1) return;
      const top = l.getBoundingClientRect().top;
      const whole = [...l.children].filter((li) => li.getBoundingClientRect().bottom <= top + l.clientHeight);
      const last = whole[whole.length - 1];
      if (last) l.style.maxHeight = `${last.getBoundingClientRect().bottom - top + 4}px`;
    });
    await sleep(100);
    const d = await p.evaluate(() => { const h = document.querySelector('[data-haloplus="search-palette"]'); return window.__box(window.__deep('.dlg', h.shadowRoot || h)[0]); });
    const name = `search/${String(i).padStart(2, '0')}.png`;
    await grab(p, `${OUT}/${name}`);
    states.push({ src: name, box: d });
  }
  pieces.search = states;
  console.log('search', states.map((s) => Math.round(s.box.h)).join(' '));
  await p.close();

  // 4. Submit on the assignment's own Halo page, then the toast frame by frame (Celebrations' confetti off).
  const rows = fx.index.rows.filter((r) => r.kind === 'assignment' && r.href && r.unit && Date.parse(r.cdue) > now + 3 * 3600e3 && Date.parse(r.cdue) < now + 5 * DAY).sort((x, y) => Date.parse(x.cdue) - Date.parse(y.cdue));
  const row = rows[0];
  const k = fx.index.classes[row.c];
  const a = fx.payload.classes.find((c) => c.slugId === k.slug).assessments.find((x) => x.id === row.id);
  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  b.bench.state.working = { [row.id]: ['Lab report.docx'] };
  await b.store({ joySnap: { v: 1, celebrate: false, items: { [row.id]: [Number(a.points) || 50, k.slug, 0] }, classes: { [k.slug]: [k.code, 120, 400] } } });
  p = await b.page(`https://halo.gcu.edu/courses/${k.slug}/course-units/${row.unit}`, { width: W, height: H });
  await sharp(b, p);
  await until(async () => (await p.locator('[data-haloplus="topic"]').count()) === 1, 10000, 200);
  await p.locator(`[data-open="${row.id}"]`).click();
  await sleep(800);
  await settle(p);
  // Before: the assignment's page with Halo's Review & Submit button (the review dialog in between is cut).
  const button = await p.locator('#guide_anchor_submitAssignment_submit').evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await grab(p, `${OUT}/submit-0.png`);
  await p.locator('#guide_anchor_submitAssignment_submit').click();
  await until(async () => (await p.locator('.hp-review .hp-submit').count()) === 1, 8000, 100);
  await sleep(500);
  await settle(p);
  // The submitted-at time is the bench's clock; fixed so frames match.
  const fix = () => p.evaluate(() => { for (const el of document.querySelectorAll('#__next *')) if (el.children.length === 0 && /^\s*Submitted on .+, \d+:\d+ [AP]M\s*$/.test(el.textContent)) el.textContent = el.textContent.replace(/\d+:\d+ [AP]M/, '4:12 PM'); });
  await p.locator('.hp-review .hp-submit').click();
  await p.mouse.move(3, 3);
  const t0 = Date.now();
  const frames = [];
  while (Date.now() - t0 < 2600) {
    await fix();
    const at = Date.now() - t0;
    const name = `toast/${String(frames.length).padStart(3, '0')}.png`;
    await grab(p, `${OUT}/${name}`);
    frames.push({ src: name, ms: at });
  }
  await help(p);
  const toast = await p.evaluate(() => { const jh = document.querySelector('#haloplus-joy'); const t = jh && window.__deep('.t', jh.shadowRoot)[0]; return t ? window.__box(t) : null; });
  pieces.submit = { before: 'submit-0.png', button, frames, toast, title: `${row.title} done` };
  console.log('submit', frames.length, 'frames; toast', JSON.stringify(toast));
  await p.close();

  // 5. Student Home's This week: a box ticked by hand (the item the submission did not tick).
  p = await b.page('https://halo.gcu.edu/', { width: W, height: H });
  await sharp(b, p);
  await until(async () => (await p.locator('[data-haloplus="week"]').count()) === 1, 20000, 200);
  await sleep(2500);
  await settle(p);
  const week = await p.evaluate((skip) => {
    const wh = document.querySelector('[data-haloplus="week"]');
    const boxes = window.__deep('li.r input[type="checkbox"]', wh.shadowRoot || wh).filter((x) => !x.checked);
    const pick = boxes.find((x) => !x.getAttribute('aria-label').includes(skip)) ?? boxes[0];
    const li = pick.closest('li');
    const panel = (wh.shadowRoot || wh).querySelector('section, .panel, .wk, div') || wh;
    return { check: window.__box(pick), row: window.__box(li), title: li.querySelector('a.t').textContent, panel: window.__box(wh) , _ : panel ? 1 : 0 };
  }, row.title);
  await grab(p, `${OUT}/week-0.png`);
  await p.mouse.click(week.check.x + week.check.w / 2, week.check.y + week.check.h / 2);
  await sleep(350);
  await p.mouse.move(3, 3);
  await p.evaluate(() => { const h = document.querySelector('[data-haloplus="week"]'); const f = (h.shadowRoot || document).activeElement; if (f) f.blur(); });
  await sleep(250);
  await grab(p, `${OUT}/week-1.png`);
  pieces.week = { before: 'week-0.png', after: 'week-1.png', ...week };
  console.log('week', week.title, JSON.stringify(week.check));
  await p.close();
} finally {
  writeFileSync(`${OUT}/pieces.json`, JSON.stringify(pieces, null, 1));
  await b.close();
}
