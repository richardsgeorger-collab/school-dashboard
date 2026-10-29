// Features 1 and 14 (extension 0.12.1) on Halo's stand-in pages, with the demo student Maya Torres (made up) and her
// six classes. The calendar is calm (George, 2026-10-28): each item only on its due day, as a chip in its class's colour
// with the class code (never cut), a short title (the full one on hover) and Halo's time; graded work first, then by
// time; at most five a day and "+N more"; participation folded into one line a day, never urgent; done work faded with
// a check; work with no submission in Halo that has passed goes quiet; each chip opens the item on Halo. The dates are
// Halo's: the student's own due dates as Halo answers them (a date moved since the last sync), Halo's school zone (a
// browser in New York shows the same days), an item due at midnight on the day Halo shows. Where:
// - Student Home: a "Calendar" tab after Halo's Current Classes / Past Classes, in Halo's own tab style; it hides Halo's
//   class list while open and Halo's own tabs bring it back; this week and the next, arrows and This week, 1 Week /
//   2 Weeks; the last tab and the weeks choice are kept for the next visit (feature 14).
// - A class calendar: "This class | All classes" beside Halo's Show buttons, on the same days Halo shows; the choice is
//   kept, and Halo's 1 Week / 2 Weeks / All with it.
// Show nothing: Free, switched off, no index; a class Halo does not answer for is named and left out.
// Screens at full width and 1024px, plain and Better Halo dark.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-calendar.mjs
import { classPage, gradesGateway } from './lib/haloPages.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const L = (() => {
  const c = { URL, Intl, Date };
  c.globalThis = c;
  runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), c);
  return c.HaloPlusOnLogic;
})();

const OUT = out('docs/screens/on-halo/calendar');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1800000);
const DAY = 86_400_000;
const PHX = 'America/Phoenix';
const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: PHX, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const time = (t) => new Intl.DateTimeFormat('en-US', { timeZone: PHX, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(t)).replace(' ', ' ');
/** A Phoenix wall time on the day `d` days from today, as an instant. */
const phx = (d, h, m) => {
  const k = dayKey(Date.now() + d * DAY);
  return new Date(Date.parse(`${k}T00:00:00Z`) + (h + 7) * 3_600_000 + m * 60_000).toISOString();
};

/** Every chip in a calendar host: its day, its parts, and whether it shows. */
const chips = (p, host) =>
  p.evaluate((h) => {
    const root = document.querySelector(h);
    if (!root) return null;
    return [...root.querySelectorAll('.hp-chip')].map((c) => {
      const code = c.querySelector('.hp-code');
      const cr = code.getBoundingClientRect();
      const tr = c.querySelector('.hp-time').getBoundingClientRect();
      return {
        clash: c.getBoundingClientRect().height > 0 && tr.top < cr.bottom - 2 && tr.left < cr.right - 1,
        id: c.getAttribute('data-id'),
        day: c.closest('.hp-day').getAttribute('data-day'),
        code: code.textContent.replace('✓', '').trim(),
        codeCut: code.scrollWidth > code.clientWidth + 1,
        ttl: c.querySelector('.hp-ttl').textContent.trim(),
        time: c.querySelector('.hp-time').textContent.trim(),
        tip: c.getAttribute('title'),
        href: c.getAttribute('href'),
        done: c.classList.contains('hp-done'),
        check: !!c.querySelector('.hp-check'),
        quiet: c.classList.contains('hp-quiet'),
        over: c.classList.contains('hp-over'),
        part: !!c.closest('.hp-plist'),
        shown: c.getBoundingClientRect().height > 0,
        opacity: Number(getComputedStyle(c).opacity),
        col: c.style.getPropertyValue('--c'),
      };
    });
  }, host);
const dayKeys = (p, host) => p.evaluate((h) => [...document.querySelectorAll(`${h} .hp-day`)].map((d) => d.getAttribute('data-day')), host);
const fits = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && (!document.getElementById('CourseLayout--main') || document.getElementById('CourseLayout--main').scrollWidth <= document.getElementById('CourseLayout--main').clientWidth + 1));

/** What Halo says for each item: its day and time (the student's own date when Halo moved it), its class. */
function expected(fx, grades) {
  const out = new Map();
  for (const r of fx.index.rows) {
    if (!['assignment', 'quiz', 'discussion', 'participation', 'lti'].includes(r.kind)) continue;
    const due = grades[r.id]?.dueDate ?? r.cdue;
    if (!due) continue;
    out.set(r.id, { slug: fx.index.classes[r.c].slug, day: dayKey(due), time: time(due), code: fx.index.classes[r.c].code, title: r.title, part: r.kind === 'participation', href: r.href, graded: r.kind !== 'participation' && (r.pts || 0) > 0, t: Date.parse(due), col: fx.index.classes[r.c].col });
  }
  return out;
}
/** Every check on the chips in view against what Halo says. */
function chipChecks(tag, where, got, want, days) {
  const inView = [...want.entries()].filter(([, w]) => days.includes(w.day));
  const wrong = [];
  for (const [id, w] of inView) {
    const c = got.filter((x) => x.id === id);
    if (c.length !== 1) wrong.push(`${w.title}: ${c.length} chips`);
    else if (c[0].day !== w.day || c[0].time !== w.time || c[0].code !== w.code || c[0].part !== w.part) wrong.push(`${w.title}: ${c[0].day} ${c[0].time} ${c[0].code} want ${w.day} ${w.time} ${w.code}`);
  }
  check(inView.length > 5 && wrong.length === 0, `${tag}: ${where}: every item once, on its due day, with Halo's time (${inView.length} items${wrong.length ? `; ${wrong.slice(0, 3).join(' | ')}` : ''})`);
  check(got.every((c) => !c.codeCut && !c.clash), `${tag}: ${where}: the class code is never cut or covered`);
  check(got.every((c) => c.tip && c.tip.includes(want.get(c.id)?.title ?? '\u0000')), `${tag}: ${where}: the full title on hover`);
  check(got.filter((c) => c.part).every((c) => !c.over) && got.every((c) => !c.part || !c.shown), `${tag}: ${where}: participation folded, never urgent`);
  const order = [];
  for (const d of days) {
    const list = got.filter((c) => c.day === d && !c.part).map((c) => want.get(c.id));
    for (let i = 1; i < list.length; i++) if (Number(list[i - 1].graded) < Number(list[i].graded) || (list[i - 1].graded === list[i].graded && list[i - 1].t > list[i].t)) order.push(d);
  }
  check(order.length === 0, `${tag}: ${where}: graded work first, then by time${order.length ? ` (out of order: ${order.join(', ')})` : ''}`);
  check(got.filter((c) => !c.part).every((c) => c.href === want.get(c.id).href || (c.href === null && !want.get(c.id).href)), `${tag}: ${where}: each chip opens the item on Halo`);
  check(got.every((c) => c.col === want.get(c.id).col), `${tag}: ${where}: each chip in its class's legend colour`);
}

for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `cal-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/?$': classPage } });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  try {
    // Halo+'s class cards (0.12.5) ask Halo the same question; off here, so the calendar's own questions can be counted.
    await b.seed({ haloFeat: { off: ['homecards'], at: new Date().toISOString() } });
    const fx = b.fx;
    const cls = fx.payload.classes[0];
    const url = `https://halo.gcu.edu/courses/${cls.slugId}`;
    const now = Date.now();
    const st = b.bench.state;
    // Halo's dates now: one moved since the last sync, one due at midnight, one handed in, one with no submission in
    // Halo that has passed, and six graded items on one day (more than five).
    const rows = fx.index.rows.filter((r) => ['assignment', 'quiz', 'discussion'].includes(r.kind) && r.cdue && (r.pts || 0) > 0);
    const near = rows.filter((r) => Math.abs(Date.parse(r.cdue) - now) < 5 * DAY);
    const moved = near[0];
    const midnight = near[1];
    const handed = near[2];
    const crowd = rows.filter((r) => ![moved, midnight, handed].includes(r)).slice(0, 7);
    st.grades = {
      [moved.id]: { dueDate: new Date(Date.parse(moved.cdue) + DAY).toISOString() },
      [midnight.id]: { dueDate: phx(3, 0, 0) },
      [handed.id]: { status: 'SUBMITTED' },
    };
    crowd.forEach((r, i) => (st.grades[r.id] = { dueDate: phx(2, 8 + i, 0) }));
    const quietRow = fx.index.rows.find((r) => r.kind === 'assignment' && ![moved, midnight, handed, ...crowd].includes(r) && Date.parse(r.cdue) < now && Date.parse(r.cdue) > now - 3 * DAY);
    if (quietRow) quietRow.ns = 1;
    const index = JSON.parse(JSON.stringify(fx.index));
    const want = expected(fx, st.grades);

    // ======== Student Home: "Calendar · All classes" below the class cards ========
    await b.store({ haloFeat: { off: ['calendar', 'views', 'homecards'], at: new Date().toISOString() }, haloIndex: index, lastAttemptAt: new Date().toISOString() });
    let p = await b.page('https://halo.gcu.edu/');
    await sleep(2500);
    check((await p.locator('[data-haloplus="home-calendar"]').count()) === 0, `${tag}: Home, switched off: Halo's Student Home alone`);
    await p.close();

    await b.store({ haloFeat: { off: ['homecards'], at: new Date().toISOString() }, haloViews: null, haloCalFold: null, haloIndex: index });
    const g0 = b.bench.calls.gateway.length;
    p = await b.page('https://halo.gcu.edu/');
    await until(async () => (await p.locator('[data-haloplus="home-calendar"] .hp-chip').count()) > 0, 15000, 200);
    await sleep(500);
    const place = await p.evaluate(() => {
      const sec = document.querySelector('[data-haloplus="home-calendar"]');
      const list = [...document.querySelectorAll('#Home--main > section')].pop();
      const cards = [...document.querySelectorAll('[class*="CourseCard_cardContainer"]')];
      const lastCard = cards[cards.length - 1].getBoundingClientRect();
      // Right after the class list, or after the compact Student Home's "Past classes" link there (0.12.4).
      const nx = list.nextElementSibling;
      return { after: nx === sec || (nx && nx.getAttribute('data-haloplus') === 'past-link' && nx.nextElementSibling === sec), below: sec.getBoundingClientRect().top >= lastCard.bottom, head: sec.querySelector('.hp-sec-title').textContent.replace(/\s+/g, ' ').trim(), open: sec.querySelector('.hp-sec-head').getAttribute('aria-expanded'), mark: !!sec.querySelector('.hp-sec-head .hp-mark') };
    });
    check(place.after && place.below && place.head === 'Calendar · All classes' && place.open === 'true' && place.mark, `${tag}: "Calendar · All classes" below the class cards, open (${JSON.stringify(place)})`);
    const asked = b.bench.calls.gateway.slice(g0).filter((c) => c.op === 'StudentAssessmentDetails');
    check(asked.length === fx.index.classes.length, `${tag}: one question per class to Halo (${asked.length})`);
    const hk = await dayKeys(p, '[data-haloplus="home-calendar"]');
    const today = dayKey(Date.now());
    const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = dayKey(Date.parse(`${today}T12:00:00Z`) - ((wd + 6) % 7) * DAY);
    check(hk.length === 7 && hk[0] === monday && hk.includes(today), `${tag}: this week, from Monday, one week to start (${hk[0]}…${hk[6]})`);
    // Each class in the colour of its own card's stripe (the bold version on a light page), chips and legend alike.
    const stripes = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[class*="CourseCard_cardContainer"]')].map((c) => {
      // Halo's own colour on the card (its color attribute, a class colour variable), as Halo writes it (0.12.6).
      const v = /^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/.exec((c.getAttribute('color') || '').trim());
      // (Better Halo's dark mode redefines Halo's class colour variables in its own hsl colours: Halo's fallback then.)
      const got = v ? getComputedStyle(document.documentElement).getPropertyValue(v[1]).trim() : '';
      let col = v ? (/^(#|rgb)/.test(got) ? got : (v[2] || '').trim()) : null;
      if (!col) {
        const cs = getComputedStyle(c);
        col = parseFloat(cs.borderTopWidth) >= 2 ? cs.borderTopColor : c.style.borderTopColor.trim();
      }
      return [decodeURIComponent(/\/courses\/([^/?#]+)/.exec(c.querySelector('a[href^="/courses/"]').getAttribute('href'))[1]), col];
    })));
    const colorWant = Object.fromEntries(Object.entries(stripes).map(([slug, c]) => [slug, L.boldColor(c, run.dark)]));
    for (const w of want.values()) w.col = colorWant[w.slug];
    const legendCols = await p.evaluate(() => [...document.querySelectorAll('[data-haloplus="home-calendar"] .hp-dot')].map((d) => d.style.background));
    check(Object.keys(stripes).length === fx.index.classes.length && fx.index.classes.every((c, i) => legendCols[i] === colorWant[c.slug]), `${tag}: the legend in each card's own colour${run.dark ? '' : ' (bold version)'} (${legendCols.join(' ')}${fx.index.classes.every((c, i) => legendCols[i] === colorWant[c.slug]) ? '' : ` want ${fx.index.classes.map((c) => colorWant[c.slug]).join(' ')} from ${JSON.stringify(stripes)}`})`);
    let got = await chips(p, '[data-haloplus="home-calendar"]');
    chipChecks(tag, 'Home', got, want, hk);
    const contrast = await p.evaluate(() => {
      const lum = (c) => {
        const n = c.match(/\d*\.?\d+/g).map(Number);
        const k = /^color\(srgb/.test(c) ? 1 : 255;
        const [r, g, b] = n.slice(0, 3).map((v) => {
          const x = v / k;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return Math.min(...[...document.querySelectorAll('[data-haloplus="home-calendar"] .hp-chip:not(.hp-done):not(.hp-quiet)')].filter((c) => c.getBoundingClientRect().height).map((c) => {
        const a = lum(getComputedStyle(c).color);
        const bg = lum(getComputedStyle(c).backgroundColor);
        return (Math.max(a, bg) + 0.05) / (Math.min(a, bg) + 0.05);
      }));
    });
    check(contrast >= 4.5, `${tag}: chip text easy to read on its tint (lowest contrast ${contrast.toFixed(1)}:1)`);
    const cm = got.find((c) => c.id === moved.id);
    check(!cm || cm.day === dayKey(st.grades[moved.id].dueDate), `${tag}: a date Halo moved since the last sync is on Halo's new day (${cm ? cm.day : 'not in view'})`);
    // 0.12.3: the week strip right under "This week": a box a day, a dot per thing due in its class's colour.
    const strip = await p.evaluate(() => {
      const s = document.querySelector('[data-haloplus="week-strip"]');
      if (!s) return null;
      const w = document.querySelector('[data-haloplus="week"]');
      const boxes = [...s.querySelectorAll('.hp-sd')];
      return {
        under: w.nextElementSibling === s,
        height: Math.round(s.getBoundingClientRect().height),
        days: boxes.map((b) => b.getAttribute('data-day')),
        today: boxes.filter((b) => b.classList.contains('hp-sd-today')).map((b) => b.getAttribute('data-day')),
        dots: Object.fromEntries(boxes.map((b) => [b.getAttribute('data-day'), [...b.querySelectorAll('.hp-sd-dots i')].map((i) => ({ c: i.style.getPropertyValue('--c'), done: i.classList.contains('hp-dd') }))])),
        more: Object.fromEntries(boxes.map((b) => [b.getAttribute('data-day'), (b.querySelector('.hp-sd-dots b') || {}).textContent || ''])),
      };
    });
    const dueOn = (k) => got.filter((c) => c.day === k && !c.part && !c.quiet);
    const dotsOk = strip && strip.days.every((k) => {
      const items = dueOn(k);
      const dots = strip.dots[k];
      return dots.length === Math.min(5, items.length) && dots.every((d, i) => d.c === items[i].col && d.done === items[i].done) && (items.length > 5 ? strip.more[k] === `+${items.length - 5}` : !strip.more[k]);
    });
    check(strip && strip.under && strip.height <= 40 && JSON.stringify(strip.days) === JSON.stringify(hk) && JSON.stringify(strip.today) === JSON.stringify([today]), `${tag}: a week strip right under This week, one line (${strip && strip.height}px), Monday to Sunday, today marked`);
    check(dotsOk, `${tag}: each day's dots: one per thing due, in its class's colour, hollow once done`);
    // A day opens the calendar on it.
    await p.locator('[data-haloplus="home-calendar"] .hp-sec-head').click();
    await sleep(300);
    const pick = hk[4];
    // The day's mark is brief: watched as it happens.
    await p.evaluate((k) => {
      window.__hpFlashed = false;
      const mo = new MutationObserver(() => {
        const c = document.querySelector(`[data-haloplus="home-calendar"] .hp-day[data-day="${k}"]`);
        if (c && c.classList.contains('hp-flash')) window.__hpFlashed = true;
      });
      mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    }, pick);
    await p.locator(`[data-haloplus="week-strip"] [data-day="${pick}"]`).click();
    await sleep(1600);
    const opened = await p.evaluate((k) => {
      const sec = document.querySelector('[data-haloplus="home-calendar"]');
      const cell = sec.querySelector(`.hp-day[data-day="${k}"]`);
      const r = sec.getBoundingClientRect();
      const c = cell && cell.getBoundingClientRect();
      return { open: !sec.querySelector('.hp-sec-body').hidden, cell: !!cell, flash: window.__hpFlashed === true, top: Math.round(r.top), seen: !!c && c.top >= 0 && c.top < window.innerHeight - 40 };
    }, pick);
    check(opened.open && opened.cell && opened.flash && opened.seen, `${tag}: a day in the strip opens the calendar on that day and scrolls to it (${JSON.stringify(opened)})`);
    await p.evaluate(() => (document.getElementById('CourseLayout--main').scrollTop = 0));
    // Two weeks, to see the busy day and the midnight item.
    await p.locator('[data-haloplus="home-calendar"] [data-hp-weeks="2"]').click();
    await sleep(500);
    const hk2 = await dayKeys(p, '[data-haloplus="home-calendar"]');
    check(hk2.length === 14 && hk2[0] === monday, `${tag}: 2 Weeks: this week and the next`);
    got = await chips(p, '[data-haloplus="home-calendar"]');
    const cmid = got.find((c) => c.id === midnight.id);
    check(cmid && cmid.day === dayKey(phx(3, 0, 0)) && cmid.time === '12:00 AM', `${tag}: due at midnight: on the day Halo shows, "12:00 AM" (${cmid ? `${cmid.day} ${cmid.time}` : 'missing'})`);
    const ch = got.find((c) => c.id === handed.id);
    check(!ch || (ch.done && ch.check && ch.opacity < 1), `${tag}: handed in: faded, with a check`);
    if (quietRow) {
      const cq = got.find((c) => c.id === quietRow.id);
      check(!cq || (cq.quiet && !cq.over && cq.opacity < 1), `${tag}: no submission in Halo and past: quiet, not overdue`);
    }
    const crowdDay = dayKey(phx(2, 12, 0));
    const inCrowd = got.filter((c) => c.day === crowdDay && !c.part);
    check(inCrowd.filter((c) => c.shown).length === 5 && inCrowd.length > 5, `${tag}: a busy day shows five (${inCrowd.length} due)`);
    const more = p.locator(`[data-haloplus="home-calendar"] .hp-day[data-day="${crowdDay}"] .hp-more`);
    check((await more.innerText()).trim() === `+${inCrowd.length - 5} more`, `${tag}: and "+${inCrowd.length - 5} more"`);
    await p.setViewportSize({ width: 1366, height: 1100 });
    await p.locator('[data-haloplus="home-calendar"]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await p.mouse.move(5, 5);
    await sleep(700);
    await p.screenshot({ path: `${OUT}/${tag}-home-1-calendar.png` });
    await more.click();
    got = await chips(p, '[data-haloplus="home-calendar"]');
    check(got.filter((c) => c.day === crowdDay && !c.part && c.shown).length === inCrowd.length, `${tag}: "+N more" opens the rest in place`);
    const ptog = p.locator('[data-haloplus="home-calendar"] .hp-ptog').first();
    if (await ptog.count()) {
      const label = (await ptog.innerText()).trim();
      await ptog.click();
      const opened = await p.evaluate(() => [...document.querySelector('[data-haloplus="home-calendar"] .hp-plist').querySelectorAll('.hp-chip')].every((c) => c.getBoundingClientRect().height > 0));
      check(/^\d+ participation$/.test(label) && opened, `${tag}: "${label}" opens to its items`);
      await ptog.click();
    }
    await p.locator('[data-haloplus="home-calendar"] [data-hp-move="1"]').click();
    await sleep(400);
    let k2 = await dayKeys(p, '[data-haloplus="home-calendar"]');
    check(k2[0] === hk2[7], `${tag}: the next-week arrow moves a week (${k2[0]})`);
    await p.locator('[data-haloplus="home-calendar"] [data-hp-move="0"]').click();
    await sleep(400);
    k2 = await dayKeys(p, '[data-haloplus="home-calendar"]');
    check(k2[0] === hk2[0], `${tag}: This week comes back`);
    // 1024px.
    await p.setViewportSize({ width: 1024, height: 900 });
    await sleep(900);
    got = await chips(p, '[data-haloplus="home-calendar"]');
    check((await fits(p)) && got.every((c) => !c.codeCut && !c.clash), `${tag}: at 1024px it fits and no class code is cut or covered`);
    check((await p.evaluate(() => document.querySelector('[data-haloplus="home-calendar"] .hp-dh').innerText.trim())).length <= 4, `${tag}: at 1024px, Halo's compact day headers`);
    await p.locator('[data-haloplus="home-calendar"]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await p.mouse.move(5, 5);
    await sleep(300);
    await p.screenshot({ path: `${OUT}/${tag}-home-2-1024.png` });
    // The "This week" bar's Calendar link scrolls to it (and opens it when folded).
    await p.setViewportSize({ width: 1366, height: 900 });
    await p.evaluate(() => (document.getElementById('CourseLayout--main').scrollTop = 0));
    await p.locator('[data-haloplus="home-calendar"] .hp-sec-head').click();
    await sleep(300);
    check(await p.evaluate(() => document.querySelector('[data-haloplus="home-calendar"] .hp-sec-body').hidden), `${tag}: the header folds it`);
    await p.evaluate(() => (document.getElementById('CourseLayout--main').scrollTop = 0));
    const link = await p.evaluate(() => {
      const w = document.querySelector('[data-haloplus="week"]');
      const a = w && w.shadowRoot.querySelector('[data-cal]');
      if (!a) return null;
      const t = a.getBoundingClientRect();
      return { text: a.textContent.trim(), x: t.left + t.width / 2, y: t.top + t.height / 2 };
    });
    check(link && link.text === 'Calendar', `${tag}: a quiet "Calendar" link in the This week bar`);
    if (link) await p.mouse.click(link.x, link.y);
    await sleep(1500);
    const went = await p.evaluate(() => {
      const sec = document.querySelector('[data-haloplus="home-calendar"]');
      const r = sec.getBoundingClientRect();
      return { top: Math.round(r.top), open: !sec.querySelector('.hp-sec-body').hidden };
    });
    check(went.open && went.top >= -2 && went.top < 200, `${tag}: it scrolls to the calendar and opens it (${JSON.stringify(went)})`);
    await p.close();
    // The fold and the weeks are kept for the next visit.
    p = await b.page('https://halo.gcu.edu/');
    await until(async () => (await p.locator('[data-haloplus="home-calendar"] .hp-chip').count()) > 0, 10000, 200);
    check((await dayKeys(p, '[data-haloplus="home-calendar"]')).length === 14, `${tag}: next visit: 2 Weeks again`);
    await p.locator('[data-haloplus="home-calendar"] .hp-sec-head').click();
    await sleep(500);
    await p.close();
    p = await b.page('https://halo.gcu.edu/');
    await sleep(2500);
    check(await p.evaluate(() => { const s = document.querySelector('[data-haloplus="home-calendar"]'); return !!s && s.querySelector('.hp-sec-body').hidden && s.querySelector('.hp-sec-head').getAttribute('aria-expanded') === 'false'; }), `${tag}: folded, it stays folded on the next visit`);
    await p.locator('[data-haloplus="home-calendar"] .hp-sec-head').click();
    await sleep(500);
    // Halo's Past Classes: no calendar under them; Current Classes: back.
    // Halo's tabs (hidden by the compact Student Home, still Halo's): clicked as Halo would be.
    await p.evaluate(() => document.querySelectorAll('#Home--main [role="tablist"] [role="tab"]')[1].click());
    await sleep(600);
    const pastHidden = await p.evaluate(() => { const s = document.querySelector('[data-haloplus="home-calendar"]'); return !s || s.hidden; });
    await p.evaluate(() => document.querySelectorAll('#Home--main [role="tablist"] [role="tab"]')[0].click());
    await sleep(800);
    const backShown = await p.evaluate(() => { const s = document.querySelector('[data-haloplus="home-calendar"]'); const nx = [...document.querySelectorAll('#Home--main > section')].pop().nextElementSibling; return !!s && !s.hidden && (nx === s || (nx && nx.getAttribute('data-haloplus') === 'past-link' && nx.nextElementSibling === s)); });
    check(pastHidden && backShown, `${tag}: under Past Classes no calendar; back under Current Classes, after the cards`);
    await p.close();
    // Another time zone in the browser: the same days.
    p = await b.page('https://halo.gcu.edu/');
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
    await p.reload({ waitUntil: 'load' });
    await until(async () => (await p.locator('[data-haloplus="home-calendar"] .hp-chip').count()) > 0, 15000, 200);
    const ny = await chips(p, '[data-haloplus="home-calendar"]');
    check(ny.length > 5 && ny.every((c) => !want.get(c.id) || (c.day === want.get(c.id).day && c.time === want.get(c.id).time)), `${tag}: a browser in New York: the same days and Halo's times (${ny.length} chips)`);
    await p.close();

    // ======== A class calendar: This class | All classes ========
    await b.store({ haloFeat: { off: ['calendar', 'views', 'homecards'], at: new Date().toISOString() }, haloViews: null });
    p = await b.page(url);
    await sleep(2500);
    check((await p.locator('[data-haloplus^="calendar"]').count()) === 0, `${tag}: class calendar, switched off: Halo's calendar alone`);
    await p.screenshot({ path: `${OUT}/${tag}-1-before.png` });
    await p.close();
    await b.store({ haloFeat: { off: ['homecards'], at: new Date().toISOString() }, haloViews: null });
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus="calendar-switch"]').count()) === 1, 10000, 200);
    check(/This class/i.test(await p.locator('[data-haloplus="calendar-switch"] [aria-pressed="true"]').innerText()), `${tag}: "This class | All classes" beside Halo's Show buttons, This class first`);
    await p.locator('[data-hp-cal="all"]').click();
    await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 15000, 200);
    await sleep(500);
    check(await p.evaluate(() => getComputedStyle(document.getElementById('guide_anchor_dashboard_calendar')).display === 'none'), `${tag}: Halo's own grid steps aside`);
    const heads = await p.evaluate(() => ({ halo: [...document.querySelectorAll('#guide_anchor_dashboard_calendar > div')].map((w) => [...w.firstElementChild.children].map((h) => h.textContent.trim())), ours: [...document.querySelectorAll('[data-haloplus="calendar-all"] .hp-week')].map((w) => [...w.querySelectorAll('.hp-dh')].map((h) => h.textContent.trim())) }));
    check(JSON.stringify(heads.halo) === JSON.stringify(heads.ours) && heads.ours.length === 2, `${tag}: the same days as Halo's 2 Weeks (${heads.ours.map((w) => `${w[0]}…${w[6]}`).join(' / ')})`);
    const ck = await dayKeys(p, '[data-haloplus="calendar-all"]');
    got = await chips(p, '[data-haloplus="calendar-all"]');
    chipChecks(tag, 'class calendar', got, want, ck);
    const legend = await p.locator('[data-haloplus="calendar-all"] .hp-legend').innerText();
    check(fx.index.classes.every((c) => legend.includes(c.code)), `${tag}: every class named in the legend (${legend.replace(/\s+/g, ' ')})`);
    await p.setViewportSize({ width: 1366, height: 1100 });
    await p.mouse.move(5, 5);
    await sleep(700);
    await p.screenshot({ path: `${OUT}/${tag}-2-all-classes.png` });
    // Halo's own "1 Week" drives both.
    await p.locator('[data-testid="dashboard_calendar_num_weeks_1"]').click();
    await sleep(800);
    check((await dayKeys(p, '[data-haloplus="calendar-all"]')).length === 7, `${tag}: Halo's 1 Week: one week in All classes too`);
    await p.setViewportSize({ width: 1024, height: 900 });
    await sleep(900);
    got = await chips(p, '[data-haloplus="calendar-all"]');
    check((await fits(p)) && got.every((c) => !c.codeCut && !c.clash), `${tag}: at 1024px it fits and no class code is cut or covered`);
    await p.mouse.move(5, 5);
    await p.screenshot({ path: `${OUT}/${tag}-3-1024.png` });
    await p.close();
    // 14: kept, with Halo's 1 Week; nothing asked again within ten minutes.
    const g1 = b.bench.calls.gateway.length;
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 10000, 200);
    await sleep(800);
    const mode = await p.locator('#calendar-container [data-testid^="dashboard_calendar_num_weeks_"].MuiButton-contained').getAttribute('data-testid');
    check(mode === 'dashboard_calendar_num_weeks_1', `${tag}: next visit: All classes and Halo's 1 Week again`);
    check(b.bench.calls.gateway.length === g1, `${tag}: within ten minutes Halo is asked nothing more`);
    await p.screenshot({ path: `${OUT}/${tag}-4-views-remembered.png` });
    await p.close();

    // A class Halo does not answer for: named, left out.
    st.gateway.StudentAssessmentDetails = ((orig) => (v, s) => (v.courseClassSlugId === fx.index.classes[2].slug ? null : orig(v, s)))(gradesGateway(fx).StudentAssessmentDetails);
    const fx2 = JSON.parse(JSON.stringify(index));
    fx2.at = new Date().toISOString();
    await b.store({ haloIndex: fx2, haloCalLive: null });
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus="calendar-all"] .hp-chip').count()) > 0, 20000, 200);
    const lg2 = await p.locator('[data-haloplus="calendar-all"] .hp-legend').innerText();
    got = await chips(p, '[data-haloplus="calendar-all"]');
    check(/\(Halo did not answer\)/.test(lg2) && !got.some((c) => c.code === fx.index.classes[2].code), `${tag}: a class Halo does not answer for is named and left out`);
    await p.close();
    st.gateway.StudentAssessmentDetails = gradesGateway(fx).StudentAssessmentDetails;

    // Show nothing: no Halo+ account on this computer yet (Free has it since 0.12.12); switched off; no index.
    for (const [name, extra] of [['no account yet', { tier: null, haloSnap: null, haloLive: null, syncKey: null, lastSyncAt: null }], ['switched off', { haloFeat: { off: ['calendar', 'homecards'], at: new Date().toISOString() } }], ['no index', { haloIndex: null }]]) {
      await b.seed({ ...extra, haloViews: { calAll: true }, lastAttemptAt: new Date().toISOString() });
      p = await b.page(url);
      await sleep(2500);
      const cal = (await p.locator('[data-haloplus^="calendar"]').count()) === 0 && (await p.evaluate(() => getComputedStyle(document.getElementById('guide_anchor_dashboard_calendar')).display !== 'none'));
      await p.close();
      p = await b.page('https://halo.gcu.edu/');
      await sleep(2500);
      const home = (await p.locator('[data-haloplus="home-calendar"]').count()) === 0;
      check(cal && home && (await p.evaluate(() => getComputedStyle(document.querySelector('#Home--main > section')).display !== 'none')), `${tag}: ${name}: Halo's calendar and Student Home alone`);
      await p.close();
    }
  } catch (e) {
    check(false, `${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
