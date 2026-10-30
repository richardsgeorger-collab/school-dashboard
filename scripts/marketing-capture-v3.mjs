// The real Halo+ UI for the calm Instagram reel (round 3, George 2026-10-30), captured at 3× in Chrome (never Edge) on the
// saved Halo page copies with the real extension and the made-up demo student Maya Torres. No GCU logos or trademarks.
// Each piece is captured as one whole element (its exact box, nothing cut through) with the boxes of its parts, so the
// reel can build it up on screen: a class card and its NEXT rows; three whole calendar days (Fri to Sun, both weeks)
// and their chips; Halo+'s search box at each letter of "topic 3 quiz"; a This week group before and after its box is
// ticked; and the done toast frame by frame on a plain ground (the confetti off; the reel draws its own, softer).
// When the search list scrolls it is ended just after its last whole row (nothing cut in half). The search box and This week are captured in a 520 px wide window so they come out about as wide as a class card.
//   node scripts/marketing-capture-v3.mjs   → marketing/reel/public/ui3/ (pieces.json says where everything is)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUBMIT_REST, classPage, gradesGateway, topicGateway, topicPage } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const OUT = resolve('marketing/reel/public/ui3');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/search`, { recursive: true });
mkdirSync(`${OUT}/toast`, { recursive: true });
const PAPER = '#F6F7F9';
const DAY = 864e5;
const sessions = new WeakMap();
const sharp = async (b, p, width, height) => {
  const cdp = await b.ctx.newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: false });
  sessions.set(p, cdp);
  await sleep(800);
};
const grab = async (p, path, r) => {
  const { data } = await sessions.get(p).send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
/** In the page: every match of `sel`, looking inside open shadow roots too; boxes in CSS px; an element's own ground. */
const HELP = `
  window.__deep = (sel, root = document) => { const out = [...root.querySelectorAll(sel)]; for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...window.__deep(sel, el.shadowRoot)); return out; };
  window.__box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  window.__ground = (el) => { for (let e = el; e; e = e.parentElement || (e.getRootNode() && e.getRootNode().host)) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; } return '#ffffff'; };
`;
const help = (p) => p.evaluate(HELP);
/** No sponsor logo (its tagline names GCU), no corner pill (it changes with the hour). */
const tidy = (p) =>
  p.evaluate(() => {
    for (const el of document.querySelectorAll('[data-haloplus="sponsor"]')) el.style.visibility = 'hidden';
    for (const h of document.querySelectorAll('[data-haloplus]')) {
      const sr = h.shadowRoot;
      if (!sr || sr.querySelector('style[data-shot]')) continue;
      const s = document.createElement('style');
      s.setAttribute('data-shot', '');
      s.textContent = '.pill,.tip{display:none!important}';
      sr.append(s);
    }
  });
const rel = (r, o) => ({ x: +(r.x - o.x).toFixed(2), y: +(r.y - o.y).toFixed(2), w: +r.w.toFixed(2), h: +r.h.toFixed(2) });
const union = (rs) => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

const pieces = {};
const b = await openBench({ label: 'marketing3', pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage }, rest: [SUBMIT_REST] });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx), topicGateway(b.fx));
await b.ctx.route('**/functions/v1/sync-drop', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, done: [] }) }));
try {
  const fx = b.fx;
  const now = Date.now();
  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  await b.seed({ lastAttemptAt: new Date().toISOString(), haloWeekOpen: { open: true, at: new Date().toISOString() } });
  const ready = (p) => until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6 && (await p.locator('[data-haloplus="card-next"][aria-busy]').count()) === 0, 20000, 200);

  // 1. One class card, whole, and its NEXT rows.
  let p = await b.page('https://halo.gcu.edu/', { width: 1024, height: 1700 });
  await sharp(b, p, 1024, 1700);
  await ready(p);
  await sleep(1200);
  await p.mouse.move(3, 3);
  await tidy(p);
  await help(p);
  const card = await p.evaluate(() => {
    const c = document.querySelector('#Home--main [class*="CourseCard_cardContainer"]');
    const next = c.querySelector('[data-haloplus="card-next"]');
    const rows = window.__deep('.hp-n-row', next.shadowRoot || next);
    return { box: window.__box(c), radius: getComputedStyle(c).borderTopLeftRadius, ground: window.__ground(c), next: window.__box(next), tint: getComputedStyle(next).backgroundColor, rows: rows.map(window.__box), title: c.querySelector('[class*="CourseCard_title"], h2, h3')?.textContent };
  });
  await grab(p, `${OUT}/card.png`, card.box);
  pieces.card = { src: 'card.png', w: card.box.w, h: card.box.h, radius: parseFloat(card.radius) || 0, ground: card.ground, next: rel(card.next, card.box), tint: card.tint, rows: card.rows.map((r) => rel(r, card.box)) };
  console.log('card', card.title, `${card.box.w}×${card.box.h}`, card.rows.length, 'rows');
  await p.close();

  // 2. Three whole days on the calendar, Fri to Sun of both weeks, and their chips.
  const cls = fx.payload.classes[0];
  p = await b.page(`https://halo.gcu.edu/courses/${cls.slugId}`, { width: 1280, height: 800 });
  await sharp(b, p, 1280, 800);
  await until(async () => (await p.locator('[data-haloplus="calendar-switch"]').count()) === 1, 15000, 200);
  await p.locator('[data-hp-cal="all"]').click();
  await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 20000, 200);
  await sleep(1000);
  await p.mouse.move(3, 3);
  await tidy(p);
  await help(p);
  const cal = await p.evaluate(() => {
    const ch = document.querySelector('[data-haloplus="calendar-all"]'); const weeks = window.__deep('.hp-week', ch.shadowRoot || ch);
    const cells = [];
    const days = [];
    for (const w of weeks) {
      const heads = [...w.querySelectorAll('.hp-dh')].slice(4, 7);
      const ds = [...w.querySelectorAll('.hp-day')].slice(4, 7);
      cells.push(...heads.map(window.__box), ...ds.map(window.__box));
      for (const d of ds) days.push({ box: window.__box(d), ground: window.__ground(d), chips: [...d.querySelectorAll('.hp-chip')].filter((c) => c.offsetParent).map(window.__box) });
    }
    return { cells, days, ground: window.__ground(weeks[0]) };
  });
  const calBox = union(cal.cells);
  await grab(p, `${OUT}/calendar.png`, calBox);
  pieces.calendar = { src: 'calendar.png', w: calBox.w, h: calBox.h, ground: cal.ground, days: cal.days.map((d) => ({ box: rel(d.box, calBox), ground: d.ground, chips: d.chips.map((c) => rel(c, calBox)) })) };
  console.log('calendar', `${calBox.w}×${calBox.h}`, cal.days.map((d) => d.chips.length).join(' '), 'chips');
  await p.close();

  // 3. The search box, 520 px wide window, at each letter of "topic 3 quiz".
  p = await b.page('https://halo.gcu.edu/', { width: 520, height: 900 });
  await sharp(b, p, 520, 900);
  await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 1, 20000, 200);
  await sleep(1500);
  await p.mouse.move(3, 3);
  await tidy(p);
  const mod = (await p.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
  await p.keyboard.press(`${mod}+k`);
  await until(async () => (await p.locator('[data-haloplus="search-palette"]').count()) === 1, 8000, 100);
  await help(p);
  const dlg = () => p.evaluate(() => { const h = document.querySelector('[data-haloplus="search-palette"]'); const d = window.__deep('.dlg', h.shadowRoot || h)[0]; return { box: window.__box(d), foot: window.__box(d.querySelector('.foot')).h, radius: getComputedStyle(d).borderTopLeftRadius, ground: window.__ground(d) }; });
  const q = 'topic 3 quiz';
  const states = [];
  for (let i = 0; i <= q.length; i++) {
    if (i) await p.keyboard.type(q[i - 1]);
    await sleep(450);
    // When the list scrolls, end it just after its last whole row, so no result shows cut in half.
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
    const d = await dlg();
    await grab(p, `${OUT}/search/${String(i).padStart(2, '0')}.png`, d.box);
    states.push({ src: `search/${String(i).padStart(2, '0')}.png`, w: d.box.w, h: d.box.h, foot: d.foot });
    pieces.searchRadius = parseFloat(d.radius) || 0;
    pieces.searchGround = d.ground;
  }
  pieces.search = states;
  console.log('search', states.map((s) => `${Math.round(s.w)}×${Math.round(s.h)}`).join(' '));
  await p.close();

  // 4. The done toast, frame by frame on a plain ground (the page hidden, the confetti off), and This week ticking off.
  const rows = fx.index.rows.filter((r) => r.kind === 'assignment' && r.href && r.unit && Date.parse(r.cdue) > now + 3 * 3600e3 && Date.parse(r.cdue) < now + 5 * DAY).sort((x, y) => Date.parse(x.cdue) - Date.parse(y.cdue));
  const row = rows[0];
  const k = fx.index.classes[row.c];
  const a = fx.payload.classes.find((c) => c.slugId === k.slug).assessments.find((x) => x.id === row.id);

  // This week first (before the submission marks it done): the group with that item, before and after its box is ticked.
  p = await b.page('https://halo.gcu.edu/', { width: 520, height: 1400 });
  await sharp(b, p, 520, 1400);
  await until(async () => (await p.locator('[data-haloplus="week"]').count()) === 1, 20000, 200);
  await sleep(2000);
  await p.mouse.move(3, 3);
  await tidy(p);
  await help(p);
  const week = await p.evaluate((title) => {
    const wh = document.querySelector('[data-haloplus="week"]'); const t = window.__deep('li.r a.t', wh.shadowRoot || wh).find((x) => x.textContent === title);
    if (!t) return null;
    const li = t.closest('li');
    const ul = li.parentElement;
    const h4 = ul.previousElementSibling;
    const box = li.querySelector('input[type="checkbox"]');
    return { group: window.__box(h4), list: window.__box(ul), row: window.__box(li), check: box ? window.__box(box) : null, ground: window.__ground(ul) };
  }, row.title);
  if (week && week.check) {
    const g = union([week.group, week.list]);
    await grab(p, `${OUT}/week-0.png`, g);
    await p.mouse.click(week.check.x + week.check.w / 2, week.check.y + week.check.h / 2);
    await sleep(350);
    await p.mouse.move(3, 3);
    // No focus ring or focus tint on the ticked row: it would run past the group's edges.
    await p.evaluate(() => { const h = document.querySelector('[data-haloplus="week"]'); const f = (h.shadowRoot || document).activeElement; if (f) f.blur(); });
    await sleep(200);
    await grab(p, `${OUT}/week-1.png`, g);
    pieces.week = { src0: 'week-0.png', src1: 'week-1.png', w: g.w, h: g.h, ground: week.ground, row: rel(week.row, g), check: rel(week.check, g), title: row.title };
    console.log('week', `${g.w}×${g.h}`, row.title);
  } else console.log('week: no box to tick for', row.title);
  await p.close();

  b.bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  b.bench.state.working = { [row.id]: ['Lab report.docx'] };
  await b.store({ joySnap: { v: 1, celebrate: false, items: { [row.id]: [Number(a.points) || 50, k.slug, 0] }, classes: { [k.slug]: [k.code, 120, 400] } } });
  p = await b.page(`https://halo.gcu.edu/courses/${k.slug}/course-units/${row.unit}`, { width: 1280, height: 800 });
  await sharp(b, p, 1280, 800);
  await until(async () => (await p.locator('[data-haloplus="topic"]').count()) === 1, 10000, 200);
  await p.locator(`[data-open="${row.id}"]`).click();
  await sleep(500);
  await p.locator('#guide_anchor_submitAssignment_submit').click();
  await until(async () => (await p.locator('.hp-review .hp-submit').count()) === 1, 8000, 100);
  await p.mouse.move(3, 3);
  await p.locator('.hp-review .hp-submit').click();
  // Hide the page under a plain ground the moment the click lands; only Halo+'s toast shows.
  await p.evaluate((paper) => {
    const s = document.createElement('style');
    s.textContent = `html,body{background:${paper}!important} body>*:not(#haloplus-joy){visibility:hidden!important}`;
    document.head.append(s);
  }, PAPER);
  const area = { x: 880, y: 0, w: 400, h: 260 };
  const t0 = Date.now();
  const frames = [];
  while (Date.now() - t0 < 3000) {
    const at = Date.now() - t0;
    const name = `toast/${String(frames.length).padStart(3, '0')}.png`;
    await grab(p, `${OUT}/${name}`, area);
    frames.push({ src: name, ms: at });
  }
  await help(p);
  const toast = await p.evaluate(() => { const jh = document.querySelector('#haloplus-joy'); const t = jh && window.__deep('.t', jh.shadowRoot)[0]; return t ? window.__box(t) : null; });
  pieces.toast = { area, frames, box: toast ? rel(toast, area) : null, title: `${row.title} done`, pts: Number(a.points) || 50 };
  console.log('toast frames', frames.length, 'over', Date.now() - t0, 'ms; box', JSON.stringify(pieces.toast.box));
  await p.close();
} finally {
  writeFileSync(`${OUT}/pieces.json`, JSON.stringify(pieces, null, 1));
  await b.close();
}
