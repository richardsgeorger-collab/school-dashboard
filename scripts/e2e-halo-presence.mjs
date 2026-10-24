// Halo+ on Halo, 0.9.0 (George, 2026-10-23: 0.8.0 "looks like an ad"), in real Chrome and Edge with this repo's
// extension. Halo's pages are stand-ins built from Halo's own code (build Jk7eKpHtXMWHqa6Y8LtAT): the home page's class
// cards are its ClassDetails component, the class code inside an <h3> after a stage badge ("Topic 7" + the code), which is
// why 0.8.0's class lines never showed on real Halo. The data is the demo student's (Maya Torres, made up).
// Checks: the peek (one line, about 6 seconds, held while hovered, × on hover only, opens the item), no peek again the
// same day, never "new" counts and never on first run, re-peeks only for a moved graded date, a new requirement on 20+
// points, graded work due within 3 hours; participation never red, never counted, one line in the list; the pill's four
// states; the hover list (3 rows at most, headers, participation, See all); class lines (gray, gold, red, no
// participation); the toolbar badge; the assignment box; "Nice. Next up" after a submission with the confetti; the
// switch; the popup (no empty bar, Next up, last synced from the account, a sync that did not go in). Light and dark.
//   [BROWSER=chrome|edge] [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-halo-presence.mjs
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const BROWSER = process.env.BROWSER ?? 'chrome';
const EXE = BROWSER === 'edge' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : chromium.executablePath();
const OUT = 'docs/screens/halo-presence';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${BROWSER}: ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 300) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(every); } return null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 900000);
const fx = JSON.parse(execFileSync('npx', ['tsx', 'scripts/halo-snap-fixture.ts'], { encoding: 'utf8' }));
const NOW = Date.now();
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();
const day = (t, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(t));

// ---- Halo, as its own code builds it ---------------------------------------------------------------------------------
const shell = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Halo</title><style>
:root{color-scheme:light dark}
body{margin:0;font:14px/1.45 "Open Sans",Arial,sans-serif;background:#f4f4f7;color:#212121}
@media (prefers-color-scheme: dark){body{background:#17171c;color:#e6e6ea}.ClassDetails_containerCard__x{background:#23232b!important;border-color:#3a3a46!important}.ClassDetails_description__x{color:#c9c9d2!important}.assess{background:#23232b!important;border-color:#3a3a46!important}}
header{position:fixed;top:0;left:0;right:0;height:64px;background:#4b2e83;color:#fff;display:flex;align-items:center;gap:18px;padding:0 24px;z-index:10}
header b{font-size:20px;letter-spacing:.02em} header nav{display:flex;gap:16px;margin-left:24px} header nav a{color:#fff;text-decoration:none;opacity:.9}
main{padding:88px 32px 40px;max-width:1180px}
h2{font-size:22px;margin:0 0 12px;color:#7a5ad0}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
.ClassDetails_containerCard__x{background:#fff;border:1px solid #d6d6de;border-left:6px solid #7a5ad0;border-radius:6px;padding:0 12px 10px}
.ClassDetails_innerButton__jJQws{all:unset;display:block;width:100%;cursor:pointer;padding-top:12px}
.ClassDetails_innerContainer__O93i7 h3{margin:0;font-size:15px;display:flex;align-items:center;gap:8px}
.stage{font-size:11px;font-weight:700;background:#e9e3f8;color:#4b2e83;border-radius:4px;padding:2px 6px}
.ClassDetails_description__x{margin:4px 0 6px;color:#424242;font-size:16px}
.meta{font-size:12px;color:#757575}
.assess{background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px 18px;margin:12px 0}.assess h3{margin:0;font-size:16px}.assess p{margin:6px 0 0;color:#616161}
.assess .row{display:flex;align-items:center;gap:12px}.btn{background:#4b2e83;color:#fff;border:0;border-radius:6px;padding:8px 14px}
</style></head><body><div id="__next"><header><b>HALO</b><nav><a href="/">Home</a><a href="#">Calendar</a><a href="#">Inbox</a></nav></header><main>${body}</main></div></body></html>`;
const homeHtml = () =>
  shell(
    `<h2>My Classes</h2><div class="grid-cards">${fx.courses
      .map(
        (c, k) => `<div class="MuiPaper-root ClassDetails_containerCard__x"><a href="/courses/${c.slug}"><button class="ClassDetails_innerButton__jJQws" type="submit"><div class="ClassDetails_innerContainer__O93i7"><h3><span class="stage">Topic ${k + 5}</span>${c.cc}</h3><p class="ClassDetails_description__x" title="${c.name}">${c.name}</p><div class="flex flex-row"><span class="meta">Sep 8 – Dec 20</span></div></div></button></a></div>`,
      )
      .join('')}</div>`,
  );
const unitHtml = (c) =>
  shell(`<h2>${c.code} · Topic 3</h2>${c.items.map((i) => `<section class="assess"><div class="row"><h3>${i.title}</h3><span class="meta">${i.type}</span></div><p>Read the instructions and submit by the due date.</p><button class="btn">View</button></section>`).join('')}`);

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const look = BROWSER === 'edge' ? ['--use-mock-keychain', '--window-position=-3000,-3000', '--window-size=1366,900'] : ['--headless=new'];
  const proc = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), `haloplus-presence-${BROWSER}-`))}`, '--enable-unsafe-extension-debugging', ...look, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`), 30000, 500);
  return { browser, ctx: browser.contexts()[0], proc };
}

const inLayer = (p, fn, arg) => p.evaluate(([f, a]) => { const r = document.querySelector('[data-haloplus="layer"]')?.shadowRoot; return r ? new Function('r', 'a', `return (${f})(r, a)`)(r, a) : null; }, [fn.toString(), arg]);
const pillState = (p) => inLayer(p, (r) => { const el = r.querySelector('.pill'); if (!el) return null; const vis = (s) => { const n = el.querySelector(s); return n && getComputedStyle(n).display !== 'none' ? n.textContent : ''; }; return { tone: el.dataset.tone, peek: el.hasAttribute('data-peek'), text: (vis('.long') || vis('.short')).trim(), x: getComputedStyle(el.querySelector('.x')).display, width: el.getBoundingClientRect().width }; });
const hoverPill = (p) => p.locator('[data-haloplus="layer"] .pill').hover();
const leavePill = (p) => p.mouse.move(400, 300);
const tipText = (p) => inLayer(p, (r) => r.querySelector('.tip')?.innerText ?? null);

/** A time zone where it is mid-morning right now, so "due in 5 hours" is still today whenever the test runs. */
const MORNING_TZ = (() => {
  const n = Math.max(-12, Math.min(12, new Date(NOW).getUTCHours() - 10));
  return n === 0 ? 'Etc/GMT' : `Etc/GMT${n > 0 ? '+' : '-'}${Math.abs(n)}`;
})();
/**
 * The demo snapshot for one state. Everything due up to tomorrow is done first, then: calm (one graded item tomorrow),
 * gold (two today), red (one in 2 hours), green (nothing graded today or tomorrow). A participation post is always
 * overdue: it must never show.
 */
function shaped(kind) {
  const s = JSON.parse(JSON.stringify(fx.snap));
  s.tz = MORNING_TZ;
  s.syncedAt = iso(-1);
  const tz = s.tz;
  const tomorrow = day(NOW + 86_400_000, tz);
  for (const i of s.items) if (day(Date.parse(i.due), tz) <= tomorrow) i.done = 1;
  const open = s.items.filter((i) => !i.done && i.pts > 0);
  if (kind === 'calm') open[0].due = iso(26);
  if (kind === 'gold') [open[0].due, open[1].due] = [iso(5), iso(6)];
  if (kind === 'red') open[0].due = iso(2);
  s.items.push({ id: 'demo-part-1', h: 'h-part-1', c: s.classes[0].id, t: 'BIO-181 Participation W7 Day 2', ht: 'Week 7, Day 2 Participation', due: iso(-9), hd: iso(-9), pts: 0, ty: 'discussion', done: 0, x: 0, pa: 1 });
  s.top = null;
  return s;
}

const { browser, ctx, proc } = await launch();
try {
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const unit = /^\/courses\/([^/]+)\/course-units\//.exec(u.pathname);
    const html = unit ? unitHtml(fx.courses.find((c) => c.slug === decodeURIComponent(unit[1])) ?? fx.courses[0]) : homeHtml();
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
  // The account's answer to the popup: last applied 8:12 PM-ish, and (second state) a sync that came in and did not go in.
  // What the account says is done (0.9.1): Halo+ on another device checked these off.
  let doneIds = [];
  let status = { ok: true, appliedAt: iso(-2), via: 'extension', lastDropAt: iso(-2), takenAt: iso(-2) };
  await ctx.route('**/functions/v1/sync-drop', async (r) => {
    const b = r.request().postDataJSON?.() ?? null;
    if (b && b.done === true) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, at: new Date().toISOString(), done: doneIds }) });
    if (b && b.status === true) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(status) });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
  });
  const cdp = await browser.newBrowserCDPSession();
  const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const worker = await until(async () => ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`)) ?? null, 15000);
  const store = (o) => worker.evaluate((x) => chrome.storage.local.set(x), o);
  const badge = () => worker.evaluate(async () => ({ text: await chrome.action.getBadgeText({}), color: await chrome.action.getBadgeBackgroundColor({}) }));
  await store({ tier: 'max', lastSyncAt: new Date().toISOString(), syncKey: 'a'.repeat(48), haloSnap: shaped('calm'), haloLive: null, haloUi: null, haloUiOn: null, haloBase: null });
  await sleep(1500);
  for (const pg of ctx.pages()) if (pg.url().startsWith('https://haloplus.app')) await pg.close().catch(() => undefined);

  for (const scheme of ['light', 'dark']) {
    const L = scheme === 'light';
    await store({ haloUi: null, haloBase: null, haloSnap: shaped('calm') });
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1366, height: 860 });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });

    // ---- the peek: first visit of the day, first run (no baseline) ----
    const pk = await until(async () => { const s = await pillState(p); return s && s.peek ? s : null; }, 8000, 150);
    if (L) {
      check(!!pk && /^Next up: .+ · tomorrow · \d+ pts$/.test(pk.text), `first visit: the pill slides out with one line: "${pk?.text}"`);
      check(!/new|hidden|\d+ things/i.test(pk?.text ?? 'x'), 'no counts, nothing "new" on the first run');
      check(pk?.x === 'none', '× only on hover');
    }
    if (L) {
      await hoverPill(p);
      await sleep(300);
      check((await pillState(p))?.x !== 'none', 'hovering shows the ×');
      await p.screenshot({ path: `${OUT}/${BROWSER}-1b-peek-hover-${scheme}.png`, clip: { x: 566, y: 660, width: 800, height: 200 } });
      if (process.env.TRACE) for (let k = 0; k < 7; k++) { console.log('  hold', k, JSON.stringify(await pillState(p)), await p.evaluate(() => { const el = document.querySelector('[data-haloplus="layer"]').shadowRoot.querySelector('.pill'); return el.matches(':hover'); })); await sleep(1000); }
      // A pointer resting on the pill (Edge, windowed off-screen, drops :hover between scripted moves, so it is re-placed).
      else for (let k = 0; k < 13; k++) { await hoverPill(p).catch(() => undefined); await sleep(500); }
      check(!!(await pillState(p))?.peek, 'hovered, it stays out past 6 seconds');
      await leavePill(p);
      const back = await until(async () => { const s = await pillState(p); return s && !s.peek ? s : null; }, 4000, 200);
      check(!!back && /^Next: .+ tomorrow$/.test(back.text), `then it shrinks back to the calm pill: "${back?.text}"`);
      check(back?.tone === 'calm', 'calm: dark with gold text');
      // The peek as it first shows, untouched (a fresh day's memory).
      await store({ haloUi: null });
      await p.reload({ waitUntil: 'load' });
      await until(async () => (await pillState(p))?.peek, 8000, 150);
    }
    await sleep(500);
    await p.screenshot({ path: `${OUT}/${BROWSER}-1-peek-${scheme}.png`, clip: { x: 566, y: 660, width: 800, height: 200 } });
    await until(async () => !(await pillState(p))?.peek, 10000, 300);

    // ---- the same day again: no peek ----
    await p.reload({ waitUntil: 'load' });
    await sleep(2500);
    if (L) check(!(await pillState(p))?.peek, 'a second visit the same day: no peek');

    // ---- the pill's four states ----
    for (const kind of ['calm', 'gold', 'red', 'green']) {
      await store({ haloSnap: shaped(kind) });
      const want = { calm: /^Next: .+ tomorrow$/, gold: /^2 due today$/, red: /^Due in 2h: .+/, green: /^✓ All caught up$/ }[kind];
      const st = await until(async () => { const s = await pillState(p); return s && s.tone === kind && !s.peek ? s : null; }, 9000, 200);
      if (L) check(!!st && want.test(st.text), `the ${kind} pill: "${st?.text}"`);
      if (L && kind === 'gold') {
        const b = await until(async () => { const x = await badge(); return x.text ? x : null; }, 5000).catch(() => null);
        check(!!b && b.text === '2', `the toolbar badge counts graded work only, not the overdue participation post: "${b?.text}"`);
      }
      await p.screenshot({ path: `${OUT}/${BROWSER}-2-pill-${kind}-${scheme}.png`, clip: { x: 866, y: 700, width: 500, height: 160 } });
    }
    // ---- the hover list ----
    await store({ haloSnap: shaped('gold') });
    await until(async () => (await pillState(p))?.tone === 'gold', 5000);
    await hoverPill(p);
    const tip = await until(() => tipText(p), 3000);
    if (L) {
      const rows = (await inLayer(p, (r) => r.querySelectorAll('.tip li').length)) ?? 0;
      check(!!tip && /^TODAY/m.test(tip) && rows <= 3 && rows >= 2, `hover: at most 3 rows under headers (${rows}): "${(tip ?? '').replace(/\s+/g, ' ').slice(0, 120)}"`);
      check(/Participation: 2 posts left this week/.test(tip ?? ''), 'participation: one quiet line');
      check(/See all in Halo\+/.test(tip ?? ''), '"See all in Halo+"');
    }
    await p.screenshot({ path: `${OUT}/${BROWSER}-3-hover-${scheme}.png`, clip: { x: 866, y: 460, width: 500, height: 400 } });
    await leavePill(p);

    // ---- class lines under Halo's real class cards ----
    const lines = await until(async () => { const l = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].map((h) => h.shadowRoot.querySelector('.l')?.textContent.replace(/\s+/g, ' ').trim() ?? '')); return l.length === fx.courses.length ? l : null; }, 6000);
    if (L) {
      check(!!lines && lines.every((l) => /^Halo\+ · /.test(l)), `a line under every class card, behind Halo's "Topic N" badge (${lines?.length ?? 0} of ${fx.courses.length}): "${lines?.[0]}"`);
      check(!!lines && lines.some((l) => /with extra requirements/.test(l)), 'gold for a real extra requirement');
      check(!!lines && !lines.some((l) => /overdue/.test(l)), 'the overdue participation post makes no class red');
      const tones = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].map((h) => getComputedStyle(h.shadowRoot.querySelector('.l')).whiteSpace));
      check(tones.every((t) => t === 'nowrap'), 'one line each');
      const outside = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].every((h) => !h.closest('button') && !h.closest('a')));
      check(outside, "outside Halo's own button and link");
    }
    await p.screenshot({ path: `${OUT}/${BROWSER}-4-class-lines-${scheme}.png`, clip: { x: 0, y: 64, width: 1366, height: 420 } });
    await p.close();
  }

  // ---- re-peeks: only what matters ----
  {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1366, height: 860 });
    const base = shaped('calm');
    await store({ haloSnap: base, haloUi: { day: day(NOW, MORNING_TZ), first: true, reopens: 0, closes: 0, flagged: [] }, haloBase: null });
    await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await sleep(2500);
    check(!(await pillState(p))?.peek, 'first run with today already peeked: the baseline is only recorded');
    const moved = JSON.parse(JSON.stringify(base));
    const g = moved.items.find((i) => !i.done && i.pts > 0 && !i.pa);
    g.due = iso(70);
    g.hd = g.due;
    await store({ haloSnap: moved });
    const mv = await until(async () => { const s = await pillState(p); return s && s.peek ? s : null; }, 6000, 200);
    check(!!mv && /^Moved: .+ is now due /.test(mv.text), `a graded date moved: "${mv?.text}"`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-1c-repeek-moved-light.png`, clip: { x: 566, y: 660, width: 800, height: 200 } });
    await until(async () => !(await pillState(p))?.peek, 9000, 300);
    const small = JSON.parse(JSON.stringify(moved));
    const s5 = small.items.find((i) => !i.done && i.pts > 0 && i.pts < 20 && !i.pa);
    if (s5) s5.x = (s5.x || 0) + 1;
    small.items.push({ id: 'demo-part-2', h: 'h-part-2', c: small.classes[1].id, t: 'Participation W7 Day 3', due: iso(1), hd: iso(1), pts: 0, ty: 'discussion', done: 0, x: 0, pa: 1 });
    await store({ haloSnap: small });
    await sleep(3000);
    check(!(await pillState(p))?.peek, 'no re-peek for a requirement on small work, or participation due in an hour');
    await p.close();
  }

  // ---- done in Halo+, participation, a past in-class quiz (0.9.1) ----
  {
    const snap = shaped('gold');
    snap.items.push({ id: 'demo-q2', h: 'h-q2', c: snap.classes[2].id, t: 'MAT-250 Quiz 2', ht: 'Quiz 2: Derivatives', due: iso(-5), hd: iso(-5), pts: 40, ty: 'quiz', done: 0, x: 0, ns: 1 });
    snap.items.push({ id: 'demo-lr', h: 'h-lr', c: snap.classes[0].id, t: 'Lab Report 3', ht: 'Lab Report 3', due: iso(-6), hd: iso(-6), pts: 30, ty: 'lab', done: 0, x: 0 });
    doneIds = ['h-lr'];
    await store({ haloSnap: snap, haloDone: null, haloUi: { day: day(NOW, MORNING_TZ), first: true, reopens: 0, closes: 0, flagged: [] }, haloBase: null });
    for (const scheme of ['light', 'dark']) {
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 1366, height: 860 });
      await p.emulateMedia({ colorScheme: scheme });
      await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
      const pill = await until(async () => { const s2 = await pillState(p); return s2 && s2.tone === 'gold' ? s2 : null; }, 15000, 300);
      await hoverPill(p);
      const tip = await until(() => tipText(p), 3000);
      if (scheme === 'light') {
        check(!!pill && pill.text === '2 due today', `done in Halo+ on another device, a past in-class quiz, an overdue participation post: none overdue ("${pill?.text}", ${pill?.tone})`);
        check(!!tip && !/Quiz 2: Derivatives|Lab Report 3/.test(tip) && /Participation: 2 posts left this week/.test(tip), `the list leaves them out; participation is one line: "${(tip ?? '').replace(/\s+/g, ' ').slice(0, 140)}"`);
        const b2 = await until(async () => { const x = await badge(); return x.text === '2' ? x : null; }, 12000).catch(() => null);
        check(b2?.text === '2', `the toolbar badge counts only the two due today (${b2?.text})`);
        const lines = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].map((h) => h.shadowRoot.textContent));
        check(!lines.some((l) => /overdue/.test(l)), 'no class line says overdue');
      }
      await p.screenshot({ path: `${OUT}/${BROWSER}-7-done-part-pastquiz-${scheme}.png`, clip: { x: 866, y: 400, width: 500, height: 460 } });
      await p.close();
    }
    doneIds = [];
  }

  // ---- the assignment line: one line in Halo's own look, "+2 more" inline (0.9.1) ----
  {
    const snap = shaped('gold');
    const course = fx.courses[0];
    const open = snap.items.filter((i) => i.c === snap.classes[0].id && !i.done && !i.pa);
    for (const i of snap.items) {
      delete i.xb;
      delete i.m;
    }
    open[0].xb = ['Bring lab coat', 'Goggles', 'Closed-toe shoes', 'Submit the data table as one PDF', 'Bring a calculator'];
    if (open[1]) Object.assign(open[1], { x: 1, xs: ['Review chapter 3 before class'] });
    await store({ haloSnap: snap });
    for (const scheme of ['light', 'dark']) {
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 1100, height: 760 });
      await p.emulateMedia({ colorScheme: scheme });
      await p.goto(`https://halo.gcu.edu/courses/${course.slug}/course-units/u3`, { waitUntil: 'load' });
      const line = await until(() => p.evaluate(() => document.querySelector('[data-haloplus="box"]')?.shadowRoot?.querySelector('.b')?.innerText ?? null), 6000);
      const n = await p.locator('[data-haloplus="box"]').count();
      const bg = await p.evaluate(() => getComputedStyle(document.querySelector('[data-haloplus="box"]').shadowRoot.querySelector('.b')).backgroundColor);
      if (scheme === 'light') {
        check(!!line && /^Halo\+\s*·\s*Bring lab coat · Goggles · Closed-toe shoes\s*\+2 more$/.test(line.replace(/\s+/g, ' ').trim()) && n === 1, `one line, only where it matters (${n} on the page): "${(line ?? '').replace(/\s+/g, ' ')}"`);
        check(bg === 'rgb(255, 255, 255)', `light: Halo's white card (${bg})`);
        check((await p.evaluate(() => document.querySelector('[data-haloplus="box"]').shadowRoot.querySelector('a').href)).includes('via=box'), 'the line opens the item in Halo+');
      } else {
        const [r, g, b2] = (bg.match(/\d+/g) ?? ['255', '255', '255']).map(Number);
        check((r + g + b2) / 3 < 90, `dark: matches Halo's dark card (${bg})`);
      }
      const box = p.locator('[data-haloplus="box"]');
      await box.scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${OUT}/${BROWSER}-8-assignment-line-${scheme}.png`, clip: await box.evaluate((e) => { const r = e.parentElement.getBoundingClientRect(); return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(900, r.width + 24), height: r.height + e.getBoundingClientRect().height + 30 }; }) });
      await p.evaluate(() => document.querySelector('[data-haloplus="box"]').shadowRoot.querySelector('.more').click());
      await sleep(300);
      const open2 = await p.evaluate(() => document.querySelector('[data-haloplus="box"]').shadowRoot.querySelector('.b').innerText);
      if (scheme === 'light') check(/Submit the data table as one PDF/.test(open2) && /Bring a calculator/.test(open2) && /less/.test(open2), '"+2 more" opens the rest inline');
      await p.screenshot({ path: `${OUT}/${BROWSER}-8b-assignment-line-open-${scheme}.png`, clip: await box.evaluate((e) => { const r = e.parentElement.getBoundingClientRect(); return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(900, r.width + 24), height: r.height + e.getBoundingClientRect().height + 30 }; }) });
      await p.close();
    }
  }

  // ---- the assignment box, the switch, "Nice. Next up" with the confetti ----
  {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1366, height: 860 });
    const snap = shaped('gold');
    await store({ haloSnap: snap, haloUi: { day: day(NOW, MORNING_TZ), first: true, reopens: 0, closes: 0, flagged: [] } });
    await store({ haloUiOn: { on: false, at: new Date().toISOString() } });
    await sleep(1200);
    check((await p.locator('[data-haloplus]').count()) === 0, 'switched off: nothing of Halo+ on the page');
    await store({ haloUiOn: { on: true, at: new Date().toISOString() } });
    const sub = snap.items.find((i) => !i.done && i.h && i.pts > 0);
    await p.goto(`https://halo.gcu.edu/courses/${fx.courses[0].slug}/course-units/u3#assignment-submission/${sub.h}`, { waitUntil: 'load' });
    await sleep(1200);
    await p.evaluate(() => { history.replaceState(null, '', location.pathname); const t = document.createElement('div'); t.className = 'Toastify__toast'; t.textContent = 'Assignment has been submitted.'; document.body.appendChild(t); });
    const confetti = await until(() => p.evaluate(() => !!document.querySelector('[id^="haloplus"], [class*="haloplus"], [data-haloplus-celebrate]') || document.querySelectorAll('canvas').length > 0), 4000);
    const nice = await until(async () => { const s = await pillState(p); return s && s.peek ? s : null; }, 8000, 200);
    check(!!nice && /^Nice\. Next up: /.test(nice.text), `after a submission: "${nice?.text}"`);
    check(!!confetti, 'the confetti still runs');
    await p.screenshot({ path: `${OUT}/${BROWSER}-5-nice-next-light.png`, clip: { x: 566, y: 660, width: 800, height: 200 } });
    await p.close();
  }

  // ---- the popup ----
  for (const scheme of ['light', 'dark']) {
    const L = scheme === 'light';
    await store({ haloSnap: shaped('calm'), serverStatus: null, running: false, setup: null, lastError: null });
    status = { ok: true, appliedAt: iso(-2), via: 'extension', lastDropAt: iso(-2), takenAt: iso(-2) };
    const pp = await ctx.newPage();
    await pp.setViewportSize({ width: 340, height: 520 });
    await pp.emulateMedia({ colorScheme: scheme });
    await pp.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
    await until(() => pp.evaluate(() => /Last synced/.test(document.getElementById('status').innerText)), 6000);
    if (L) {
      const empty = await pp.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 4 && !e.innerText.trim() && !['IMG', 'INPUT', 'I', 'SCRIPT'].includes(e.tagName) && !e.querySelector('img,input')).map((e) => e.id || e.className));
      check(empty.length === 0, `nothing empty in the popup (${empty.join(', ') || 'none'})`);
      const t = await pp.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      check(/Halo\+ Max/i.test(t) && /Next up .+ · tomorrow · \d+ pts/i.test(t) && /Last synced/.test(t) && /Sync now/.test(t) && /Show Halo\+ on Halo pages/.test(t) && /Open Halo\+/.test(t), `the popup: "${t.slice(0, 200)}"`);
    }
    await pp.screenshot({ path: `${OUT}/${BROWSER}-6-popup-${scheme}.png`, fullPage: true });
    if (L) {
      status = { ok: true, appliedAt: iso(-2), via: 'extension', lastDropAt: iso(-0.2), takenAt: iso(-0.19) };
      await store({ lastSyncAt: new Date().toISOString() });
      const said = await until(() => pp.evaluate(() => { const t = document.getElementById('status').innerText; return /didn't go in/.test(t) ? t : null; }), 6000);
      check(!!said, `a sync that came in but did not go in is said plainly: "${(said ?? '').replace(/\s+/g, ' ')}"`);
      await pp.screenshot({ path: `${OUT}/${BROWSER}-6b-popup-not-applied-light.png`, fullPage: true });
    }
    await pp.close();
  }
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  proc.kill();
}
const okAll = checks.every(Boolean);
console.log(okAll ? 'PASS' : 'FAIL');
process.exit(okAll ? 0 : 1);
