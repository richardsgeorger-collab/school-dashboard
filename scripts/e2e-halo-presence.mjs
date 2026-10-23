// Halo+ on Halo (George, 2026-10-22, extension 0.8.0), in real Chrome and Edge with this repo's extension. Halo's pages
// are stand-ins built from Halo's own markup (the home list's class cards, a unit page, a quiz), served at halo.gcu.edu;
// the data is the demo student's (Maya Torres, made up), as Halo+ would hand it to the extension. Checks: the daily card
// (first visit), the pill in all three states with today's list on hover and no pulse under reduced motion, the line
// under every class card, the assignment box only where announcements added something, the toolbar badge, Free (pill
// only), data over a day old ("as of" + Sync now), "Nice. Next" after a submission with the confetti still there, the
// re-open rules (only on a change, never after two closes without a click), the switch, Halo's own top bar and buttons
// never covered, and the hand-off from Halo+ (its page writes the snapshot, the extension carries it). Screens light and
// dark to docs/screens/halo-presence/.
//   KEYS_ENV=... [BROWSER=chrome|edge] [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-halo-presence.mjs
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const BROWSER = process.env.BROWSER ?? 'chrome';
const EXE = BROWSER === 'edge' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : chromium.executablePath();
const OUT = 'docs/screens/halo-presence';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
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

// ---- Halo, as its own markup builds it (read from build Jk7eKpHtXMWHqa6Y8LtAT) ---------------------------------------
const shell = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Halo</title><style>
body{margin:0;font:14px/1.45 "Open Sans",Arial,sans-serif;background:#f4f4f7;color:#212121}
header{position:fixed;top:0;left:0;right:0;height:64px;background:#4b2e83;color:#fff;display:flex;align-items:center;gap:18px;padding:0 24px;z-index:10}
header b{font-size:20px;letter-spacing:.02em} header nav{display:flex;gap:16px;margin-left:24px} header nav a{color:#fff;text-decoration:none;opacity:.9}
header .me{margin-left:auto;display:flex;gap:10px} header .me button{background:#ffffff22;border:0;color:#fff;border-radius:50%;width:36px;height:36px}
main{padding:88px 32px 40px;max-width:1100px}
h2{font-size:22px;margin:0 0 12px;color:#4b2e83}
ul.classes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.m-4{margin:16px}.p-3{padding:12px}.border{border:1px solid #c0c0c0}.rounded-md{border-radius:6px}.paper{background:#fff;border-left:5px solid #7a5ad0}
.grid{display:grid}.gap-y-2{row-gap:8px}.flex{display:flex}.justify-between{justify-content:space-between}.items-center{align-items:center}
.text-xs{font-size:12px}.text-gray61{color:#616161}.font-semibold{font-weight:600}.text-lg{font-size:18px}.text-gray21{color:#212121}.mr-3{margin-right:12px}
.assess{background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px 18px;margin:12px 0}.assess h3{margin:0;font-size:16px}.assess p{margin:6px 0 0;color:#616161}
.assess .row{display:flex;align-items:center;gap:12px}.btn{background:#4b2e83;color:#fff;border:0;border-radius:6px;padding:8px 14px}
.help{position:fixed;right:20px;bottom:18px;background:#4b2e83;color:#fff;border:0;border-radius:24px;padding:10px 16px;font-weight:600}
</style></head><body><div id="__next"><header><b>HALO</b><nav><a href="/">Home</a><a href="#">Calendar</a><a href="#">Inbox</a></nav><div class="me"><button aria-label="Alerts">🔔</button><button aria-label="Profile">M</button></div></header><main>${body}</main></div></body></html>`;
const homeHtml = (help) =>
  shell(
    `<h2>My Classes</h2><ul class="classes">${fx.courses
      .map(
        (c) => `<li class="m-4 hover:cursor-pointer"><div class="paper p-3 border rounded-md" onclick="location.href='/courses/${c.slug}'"><div class="grid gap-y-2"><div class="flex justify-between items-center mr-2"><div class="flex items-center"><p class="text-xs text-gray61 mr-3">${c.cc}</p><p class="font-semibold">Topic 3</p></div></div><div class="flex justify-between items-center"><p class="text-lg text-gray21" style="margin:0">${c.name}</p></div><div class="flex"><span class="text-xs text-gray61">Sep 8 - Dec 20</span></div></div></div></li>`,
      )
      .join('')}</ul>${help ? '<button class="help">Help</button>' : ''}`,
  );
const unitHtml = (c) =>
  shell(`<h2>${c.code} · Topic 3</h2>${c.items.map((i) => `<section class="assess"><div class="row"><h3>${i.title}</h3><span class="text-xs text-gray61">${i.type}</span></div><p>Read the instructions and submit by the due date.</p><button class="btn">View</button></section>`).join('')}`);
const quizHtml = (title) => shell(`<h2>${title}</h2><p>Timed quiz. Start when you are ready.</p><button class="btn">Start Quiz</button>`);

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const look = BROWSER === 'edge' ? ['--use-mock-keychain', '--window-position=-3000,-3000', '--window-size=1366,900'] : ['--headless=new'];
  const proc = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), `haloplus-presence-${BROWSER}-`))}`, '--enable-unsafe-extension-debugging', ...look, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`), 30000, 500);
  return { browser, ctx: browser.contexts()[0], proc };
}

const layerText = (p, sel) => p.evaluate((s) => document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector(s)?.innerText ?? null, sel);
const layerAttr = (p, sel, a) => p.evaluate(([s, at]) => document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector(s)?.getAttribute(at) ?? null, [sel, a]);
const layerClick = (p, sel) => p.evaluate((s) => document.querySelector('[data-haloplus="layer"]')?.shadowRoot?.querySelector(s)?.click(), sel);

/**
 * A time zone where it is mid-morning right now, so "due in 5 hours" is still today whenever the test runs (Etc/GMT+N
 * is UTC-N).
 */
const MORNING_TZ = (() => {
  const n = Math.max(-12, Math.min(12, new Date(NOW).getUTCHours() - 10));
  return n === 0 ? 'Etc/GMT' : `Etc/GMT${n > 0 ? '+' : '-'}${Math.abs(n)}`;
})();
/** The demo snapshot, reshaped for one pill state. */
function shaped(kind) {
  const s = JSON.parse(JSON.stringify(fx.snap));
  s.tz = MORNING_TZ;
  s.syncedAt = iso(-1);
  const tz = s.tz;
  const today = day(NOW, tz);
  for (const i of s.items) if (day(Date.parse(i.due), tz) <= today) i.done = 1;
  const open = s.items.filter((i) => !i.done);
  if (kind === 'gold') {
    open[0].due = iso(5);
    open[1].due = iso(6);
  }
  if (kind === 'red') {
    open[0].due = iso(2);
    open[1].due = iso(6);
  }
  if (kind === 'card') {
    open[0].due = iso(5);
    s.top = open[0].id;
  }
  return s;
}

let ok = true;
const who = await kit.persona('plus');
const { browser, ctx, proc } = await launch();
try {
  let helpButton = false;
  await ctx.route('https://halo.gcu.edu/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    let html = homeHtml(helpButton);
    const unit = /^\/courses\/([^/]+)\/course-units\//.exec(u.pathname);
    const quiz = /^\/quiz\/([^/]+)/.exec(u.pathname);
    if (unit) html = unitHtml(fx.courses.find((c) => c.slug === decodeURIComponent(unit[1])) ?? fx.courses[0]);
    else if (quiz) html = quizHtml(fx.courses.flatMap((c) => c.items).find((i) => i.haloId === decodeURIComponent(quiz[1]))?.title ?? 'Quiz');
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
  const cdp = await browser.newBrowserCDPSession();
  const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const worker = await until(async () => ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`)) ?? null, 15000);
  const store = (o) => worker.evaluate((x) => chrome.storage.local.set(x), o);
  const badge = () => worker.evaluate(async () => ({ text: await chrome.action.getBadgeText({}), color: await chrome.action.getBadgeBackgroundColor({}) }));
  // Plus, synced a moment ago (so no scheduled sync starts in the middle), the demo snapshot.
  await store({ tier: 'max', lastSyncAt: new Date().toISOString(), haloSnap: shaped('card'), haloLive: null, haloUi: null, haloUiOn: null });
  // Keep the extension's own Halo+ tab from opening on install.
  await sleep(1500);
  for (const pg of ctx.pages()) if (pg.url().startsWith('https://haloplus.app')) await pg.close().catch(() => undefined);

  for (const scheme of ['light', 'dark']) {
    await store({ haloUi: null, haloSnap: shaped('card') });
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1366, height: 860 });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    const card = await until(() => layerText(p, '.card'), 10000);
    await sleep(500);
    if (scheme === 'light') {
      check(!!card && /due today|Nothing due today/.test(card) && /Do now/i.test(card) && /Open in Halo\+/.test(card), `the first visit of the day opens the card: "${(card ?? '').replace(/\s+/g, ' ').slice(0, 110)}"`);
      check(/hidden in announcements/.test(card ?? ''), 'it says what announcements hid');
      const href = await layerAttr(p, '.card .go', 'href');
      check(/^https:\/\/haloplus\.app\/#\/class\?c=[^&]+&i=[^&]+&from=halo&via=card$/.test(href ?? ''), `Open in Halo+ opens that item, marked as from Halo (${href})`);
      const top = await p.evaluate(() => parseFloat(document.querySelector('[data-haloplus="layer"]').shadowRoot.querySelector('.card').style.top));
      check(top >= 64, `the card sits below Halo's top bar (top ${top}px, bar 64px)`);
      const lines = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="class"]')].map((h) => h.shadowRoot.querySelector('.l')?.textContent.replace(/\s+/g, ' ').trim() ?? ''));
      check(lines.length === fx.courses.length && lines.every((l) => /H\+/.test(l) && /due this week|Nothing due this week/.test(l)), `a line under every class card (${lines.length} of ${fx.courses.length}): "${lines[0]}"`);
      check(lines.some((l) => /extra requirement/.test(l)), 'a class with announcement extras says so in gold');
    }
    await p.screenshot({ path: `${OUT}/${BROWSER}-1-card-${scheme}.png` });
    await p.locator('[data-haloplus="class"]').first().screenshot({ path: `${OUT}/${BROWSER}-5-class-card-${scheme}.png` }).catch(() => undefined);
    await p.evaluate(() => document.querySelector('ul.classes li')?.scrollIntoView());
    await p.screenshot({ path: `${OUT}/${BROWSER}-5-class-lines-${scheme}.png`, clip: { x: 0, y: 60, width: 1366, height: 560 } });
    // Close: the pill. Each state.
    await layerClick(p, '.card .x');
    for (const kind of ['gold', 'green', 'red']) {
      await store({ haloSnap: shaped(kind) });
      // A reshaped day can count as "something new" and open the card again: close it to see the pill.
      await sleep(1200);
      if (await layerText(p, '.card')) await layerClick(p, '.card .x');
      const t = await until(async () => { const tone = await layerAttr(p, '.pill', 'data-tone'); return tone === kind ? await layerText(p, '.pill') : null; }, 8000);
      if (scheme === 'light') {
        const want = { gold: /^\d+ due today$/, green: /^✓ All done today$/, red: /^Due in 2h$/ }[kind];
        check(!!t && want.test(t.trim()), `the ${kind} pill: "${(t ?? '').trim()}"`);
      }
      // The card does not open again on its own for a reshaped day here (closed once without a click; changes are the
      // shaped ones, so it may): close it if it did, so the pill shows.
      if (await layerText(p, '.card')) await layerClick(p, '.card .x');
      await until(() => layerText(p, '.pill'), 4000);
      await p.screenshot({ path: `${OUT}/${BROWSER}-2-pill-${kind}-${scheme}.png`, clip: { x: 966, y: 560, width: 400, height: 300 } });
    }
    if (scheme === 'light') {
      check((await layerAttr(p, '.pill', 'data-pulse')) !== null, 'the red pill pulses');
      await p.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const anim = await p.evaluate(() => getComputedStyle(document.querySelector('[data-haloplus="layer"]').shadowRoot.querySelector('.pill')).animationName);
      check(anim === 'none', `with reduced motion it does not pulse (${anim})`);
      await p.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
    }
    // Hover: today's list.
    await store({ haloSnap: shaped('gold') });
    if (await until(() => layerText(p, '.card'), 1500)) await layerClick(p, '.card .x');
    await p.evaluate(() => document.querySelector('[data-haloplus="layer"]').shadowRoot.querySelector('.pill').dispatchEvent(new MouseEvent('mouseenter')));
    const tip = await until(() => layerText(p, '.tip'), 3000);
    if (scheme === 'light') check(!!tip && /Today/i.test(tip) && tip.split('\n').length >= 3, `hover shows today's list: "${(tip ?? '').replace(/\s+/g, ' ').slice(0, 90)}"`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-3-pill-hover-${scheme}.png`, clip: { x: 866, y: 460, width: 500, height: 400 } });
    // Click: the full card again.
    await layerClick(p, '.pill');
    if (scheme === 'light') check(!!(await until(() => layerText(p, '.card'), 3000)), 'clicking the pill reopens the full card');
    await layerClick(p, '.card .x');
    await p.close();
  }

  // ---- re-open rules ----------------------------------------------------------------------------------------------
  {
    await store({ haloUi: null, haloSnap: shaped('gold') });
    const p = await ctx.newPage();
    await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await until(() => layerText(p, '.card'), 8000);
    await layerClick(p, '.card .x'); // close 1, no click
    await sleep(800);
    check(!(await layerText(p, '.card')), 'closed: it stays closed while nothing changes');
    const s = shaped('gold');
    s.items.push({ id: 'new-1', h: 'h-new-1', c: s.classes[0].id, t: 'Genetics Homework', due: iso(30), pts: 20, ty: 'homework', done: 0, x: 0 });
    await store({ haloSnap: s });
    const again = await until(() => layerText(p, '.card'), 6000);
    check(!!again && /New: 1 new assignment/.test(again), `something new opens it again: "${(again ?? '').split('\n').find((l) => /New:/.test(l)) ?? ''}"`);
    await layerClick(p, '.card .x'); // close 2, no click
    const s2 = JSON.parse(JSON.stringify(s));
    s2.items.push({ id: 'new-2', h: 'h-new-2', c: s.classes[1].id, t: 'Lab 6 Prelab', due: iso(40), pts: 5, ty: 'homework', done: 0, x: 0 });
    await store({ haloSnap: s2 });
    await sleep(2500);
    check(!(await layerText(p, '.card')), 'after two closes without a click, nothing reopens it on its own today');
    check(!!(await layerText(p, '.pill')), 'the pill still shows');
    await p.close();
  }

  // ---- the assignment box -------------------------------------------------------------------------------------------
  for (const scheme of ['light', 'dark']) {
    const withX = fx.snap.items.find((i) => i.x > 0 && i.h);
    const course = fx.courses.find((c) => c.id === withX.c);
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1366, height: 860 });
    await p.emulateMedia({ colorScheme: scheme });
    await store({ haloSnap: fx.snap, haloUi: { day: day(NOW, fx.snap.tz), first: true, reopens: 0, closes: 0, flagged: [], seen: null } });
    await p.goto(`https://halo.gcu.edu/courses/${course.slug}/course-units/u3`, { waitUntil: 'load' });
    const box = await until(() => p.evaluate(() => { const b = [...document.querySelectorAll('[data-haloplus="box"]')].map((x) => x.shadowRoot.querySelector('.b')?.textContent.replace(/\s+/g, ' ').trim() ?? ''); return b.length ? b : null; }), 8000);
    if (scheme === 'light') {
      const others = course.items.length;
      const extras = fx.snap.items.filter((i) => i.c === course.id && (i.x > 0 || i.m)).length;
      check(!!box && box.length === extras && /Halo\+ caught \d+ extra requirements? for this/.test(box[0]) && /Open in Halo\+/.test(box[0]), `the box on "${withX.ht ?? withX.t}" only: ${box?.length} box(es) for ${others} assignments: "${(box?.[0] ?? '').slice(0, 110)}"`);
    }
    await p.locator('[data-haloplus="box"]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await p.screenshot({ path: `${OUT}/${BROWSER}-6-assignment-box-${scheme}.png` });
    await p.close();
  }
  {
    const moved = fx.snap.items.find((i) => i.m && i.h);
    const p = await ctx.newPage();
    await p.goto(`https://halo.gcu.edu/quiz/${moved.h}`, { waitUntil: 'load' });
    const box = await until(() => p.evaluate(() => document.querySelector('[data-haloplus="box"]')?.shadowRoot.querySelector('.b')?.textContent.replace(/\s+/g, ' ').trim()), 6000);
    check(!!box && /date change|Due date moved to/.test(box), `a quiz an announcement moved says so: "${(box ?? '').slice(0, 120)}"`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-6-quiz-moved-light.png` });
    const none = fx.snap.items.find((i) => !i.m && !i.x && i.h);
    await p.goto(`https://halo.gcu.edu/quiz/${none.h}`, { waitUntil: 'load' });
    await sleep(1500);
    check((await p.locator('[data-haloplus="box"]').count()) === 0, 'nothing caught: no box at all');
    await p.close();
  }

  // ---- the toolbar badge --------------------------------------------------------------------------------------------
  {
    const seen = {};
    for (const kind of ['gold', 'red', 'green']) {
      await store({ haloSnap: shaped(kind) });
      seen[kind] = await until(async () => { const b = await badge(); return kind === 'green' ? (b.text === '' ? b : null) : b.text && b.color.join(',') === (kind === 'red' ? '229,72,77,255' : '242,184,75,255') ? b : null; }, 6000);
    }
    check(seen.gold?.text === '2' && seen.gold.color.join(',') === '242,184,75,255', `gold badge with today's count (${seen.gold?.text}, ${seen.gold?.color})`);
    check(seen.red?.text && seen.red.color.join(',') === '229,72,77,255', `red when something is due within 3 hours (${seen.red?.text}, ${seen.red?.color})`);
    check(seen.green?.text === '', 'nothing due: no badge');
    if (!seen.gold || !seen.red) throw new Error('the badge never showed');
    // The toolbar is outside the page, so the badge is drawn from what the extension set (getBadgeText/Color).
    const icon = readFileSync(join(EXT, 'icon-128.png')).toString('base64');
    const pg = await ctx.newPage();
    await pg.setViewportSize({ width: 520, height: 140 });
    await pg.setContent(`<body style="margin:0;background:#dfe3ea;font:12px system-ui;display:flex;gap:28px;align-items:center;padding:24px 28px">${['gold', 'red']
      .map((k) => `<div style="display:grid;gap:8px;justify-items:center"><div style="position:relative;width:40px;height:40px;background:#fff;border-radius:10px;display:grid;place-items:center;box-shadow:0 1px 3px #0003"><img src="data:image/png;base64,${icon}" width="22" height="22"><span style="position:absolute;right:-6px;bottom:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:rgb(${seen[k].color.slice(0, 3).join(',')});color:${k === 'red' ? '#fff' : '#141414'};font:700 11px/16px system-ui;text-align:center">${seen[k].text}</span></div><span>${k === 'red' ? 'Due within 3 hours' : 'Due today'}</span></div>`)
      .join('')}<div style="display:grid;gap:8px;justify-items:center"><div style="width:40px;height:40px;background:#fff;border-radius:10px;display:grid;place-items:center;box-shadow:0 1px 3px #0003"><img src="data:image/png;base64,${icon}" width="22" height="22"></div><span>Nothing due</span></div><p style="max-width:150px;color:#555">The toolbar icon as the extension set it (text and color read back from the browser).</p></body>`);
    await pg.screenshot({ path: `${OUT}/${BROWSER}-7-icon-badge.png` });
    await pg.close();
  }

  // ---- Free, old data, the switch, Halo's buttons, Nice. Next --------------------------------------------------------
  {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1366, height: 860 });
    const free = shaped('gold');
    free.plan = 'free';
    free.syncedAt = iso(-24 * 9);
    await store({ tier: 'free', haloUi: null, haloSnap: free });
    await p.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    await sleep(2000);
    const pill = await layerText(p, '.pill');
    check(!(await layerText(p, '.card')) && /^Halo\+ · Synced [A-Z][a-z]{2} \d+$/.test((pill ?? '').trim()), `Free: the pill only, "${(pill ?? '').trim()}", no card`);
    await p.evaluate(() => document.querySelector('[data-haloplus="layer"]').shadowRoot.querySelector('.pill').dispatchEvent(new MouseEvent('mouseenter')));
    const tip = await until(() => layerText(p, '.tip'), 3000);
    check(/Synced [A-Z][a-z]{2} \d+\. Turn on Halo\+ to keep this current\./.test(tip ?? ''), 'its hover: "Synced [date]. Turn on Halo+ to keep this current."');
    check((await p.locator('[data-haloplus="class"]').count()) === 0, 'Free: no class lines either');
    await p.screenshot({ path: `${OUT}/${BROWSER}-8-free-light.png`, clip: { x: 866, y: 460, width: 500, height: 400 } });

    const old = shaped('card');
    old.syncedAt = iso(-30);
    // The open page picks up the change itself (and the day's first card is shown once, whichever Halo tab is first).
    await store({ tier: 'max', haloUi: null, haloSnap: old });
    const card = await until(() => layerText(p, '.card'), 6000);
    check(/as of (yesterday|[A-Z][a-z]{2} \d+,)/.test(card ?? '') && /Sync now/.test(card ?? ''), `over a day old: "as of …" and Sync now: "${(card ?? '').replace(/\s+/g, ' ').slice(0, 120)}"`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-4-card-as-of-light.png` });
    await layerClick(p, '.card .x');

    // Halo's own button in the corner: the pill moves to the other side.
    helpButton = true;
    await p.reload({ waitUntil: 'load' });
    await until(() => layerText(p, '.pill'), 6000);
    check((await layerAttr(p, '.pill', 'data-side')) === 'left', "a Halo button in the bottom right: the pill takes the other corner");
    const helpFree = await p.evaluate(() => { const b = document.querySelector('.help').getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return top && top.classList.contains('help'); });
    check(helpFree, "Halo's own button is still the thing under the mouse");
    helpButton = false;

    // The switch, from the popup: everything goes.
    await store({ haloUiOn: { on: false, at: new Date().toISOString() } });
    await sleep(1500);
    check((await p.locator('[data-haloplus]').count()) === 0, 'switched off: nothing of Halo+ on the page');
    await store({ haloUiOn: { on: true, at: new Date().toISOString() } });

    // Nice. Next, after a submission (with the confetti still there).
    await store({ haloUi: { day: day(NOW, fx.snap.tz), first: true, reopens: 0, closes: 0, flagged: [], seen: null }, haloSnap: shaped('gold') });
    const sub = shaped('gold').items.find((i) => !i.done && i.h);
    await p.goto(`https://halo.gcu.edu/courses/${fx.courses[0].slug}/course-units/u3#assignment-submission/${sub.h}`, { waitUntil: 'load' });
    await sleep(1200);
    await p.evaluate(() => { history.replaceState(null, '', location.pathname); const t = document.createElement('div'); t.className = 'Toastify__toast'; t.textContent = 'Assignment has been submitted.'; document.body.appendChild(t); });
    const confetti = await until(() => p.evaluate(() => !!document.querySelector('[id^="haloplus"], [class*="haloplus"], [data-haloplus-celebrate]') || document.querySelectorAll('canvas').length > 0), 4000);
    const nice = await until(() => layerText(p, '.card'), 8000);
    check(!!nice && /^Halo\+[\s\S]*Nice\. Next:/.test(nice.trim()), `after a submission: "${(nice ?? '').replace(/\s+/g, ' ').slice(0, 80)}"`);
    check(!!confetti, 'the confetti still runs');
    await p.screenshot({ path: `${OUT}/${BROWSER}-9-nice-next-light.png` });
    await p.close();
  }

  // ---- from Halo+: its page writes the snapshot and the extension carries it ----------------------------------------
  {
    await store({ haloSnap: null });
    await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
    const p = await ctx.newPage();
    await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
    const written = await until(() => p.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('school-dashboard:halo-snap')); return s && s.v === 1 ? s : null; } catch { return null; } }), 30000);
    check(!!written && written.classes.length > 0, `Halo+ writes the snapshot (${written?.classes.length} classes, ${written?.items.length} items)`);
    const carried = await until(() => worker.evaluate(async () => (await chrome.storage.local.get('haloSnap')).haloSnap), 15000);
    check(!!carried && carried.v === 1 && carried.classes.length === written?.classes.length, 'the extension carries it');
    await p.close();
  }
} catch (e) {
  ok = false;
  console.log('ERROR', e.message);
} finally {
  clearTimeout(hard);
  await browser.close().catch(() => undefined);
  proc.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
const pass = ok && checks.every(Boolean);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
