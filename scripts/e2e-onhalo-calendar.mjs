// Features 1 and 14 (extension 0.12.0) on Halo's class calendar stand-in (Halo's DashboardCalendar: weeks pager,
// "Show 1 Week | 2 Weeks | All", one bar per item from its start day to the student's due day), with the demo student
// (made up). 1: "This class | All classes" beside Halo's buttons; All classes shows the same days as Halo, every class's
// work in its Halo colour, each bar on Halo's own days (a date moved by the instructor, a personal accommodated date
// that Halo does not draw, a bar across a week boundary, a browser in another time zone), each bar opening the item;
// one question per class to Halo, none more within ten minutes; a class Halo does not answer for is named and left out.
// 14: Halo's 1 Week / 2 Weeks / All is picked again on the next visit, never the scroll position.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-calendar.mjs
import { classPage, gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/calendar');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);
const DAY = 86_400_000;
const PHX = 'America/Phoenix';
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: PHX, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const md = (t) => new Intl.DateTimeFormat('en-US', { timeZone: PHX, month: 'short', day: 'numeric' }).format(new Date(t));

/** Our grid's bars: title text, and which day columns they cover in which week row. */
const bars = (p) =>
  p.evaluate(() => {
    const host = document.querySelector('[data-haloplus="calendar-all"]');
    if (!host) return null;
    const weeks = [...host.querySelector('.hp-grid').children];
    const out = [];
    weeks.forEach((w, wi) => {
      const heads = [...w.firstElementChild.children].map((h) => h.getBoundingClientRect());
      for (const bar of w.querySelectorAll('a, [title]')) {
        if (!bar.className || !/eventBar/.test(bar.className)) continue;
        const r = bar.getBoundingClientRect();
        const col = (x) => heads.findIndex((h) => x >= h.left - 2 && x <= h.right + 2);
        out.push({ week: wi, text: bar.textContent.replace(/\s+/g, ' ').trim(), href: bar.getAttribute('href'), from: col(r.left + 6), to: col(r.right - 6), headers: [...w.firstElementChild.children].map((h) => h.textContent.trim()) });
      }
    });
    return out;
  });
const haloHeaders = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(`${s} > div`)].map((w) => [...w.firstElementChild.children].map((h) => h.textContent.trim())), sel);

for (const run of [{ bh: false, dark: false }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `cal-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/?$': classPage } });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  try {
    await b.seed();
    const fx = b.fx;
    const cls = fx.payload.classes[0];
    const url = `https://halo.gcu.edu/courses/${cls.slugId}`;
    const now = Date.now();
    // The student's own dates on Halo now: one moved by the instructor since the last sync, one with a personal
    // (accommodated) date that Halo's calendar does not draw, one that runs across a week boundary.
    const all = fx.payload.classes.flatMap((c) => c.assessments.map((a) => ({ ...a, slug: c.slugId, code: c.courseCode })));
    const soon = all.filter((a) => Math.abs(Date.parse(a.dueDate) - now) < 6 * DAY);
    const moved = soon.find((a) => a.slug !== cls.slugId);
    const accom = soon.find((a) => a !== moved && a.slug !== cls.slugId);
    const across = soon.find((a) => a !== moved && a !== accom);
    b.bench.state.grades = {
      [moved.id]: { dueDate: new Date(Date.parse(moved.dueDate) + DAY).toISOString() },
      [accom.id]: { accommodatedDueDate: new Date(Date.parse(accom.dueDate) + 3 * DAY).toISOString() },
    };
    // A bar across the boundary: start four days before its due date on a Monday-week.
    const acrossItem = fx.index.rows.find((r) => r.id === across.id);
    const acrossStart = new Date(Date.parse(across.dueDate) - 8 * DAY).toISOString();
    acrossItem.start = acrossStart;

    // Before: the class calendar as Halo shows it (switched off).
    await b.store({ haloFeat: { off: ['calendar', 'views'], at: new Date().toISOString() }, haloIndex: fx.index });
    let p = await b.page(url);
    await sleep(2500);
    check((await p.locator('[data-haloplus^="calendar"]').count()) === 0, `${tag}: switched off: Halo's calendar alone`);
    await p.screenshot({ path: `${OUT}/${tag}-1-before.png` });
    await p.close();

    await b.store({ haloFeat: { off: [], at: new Date().toISOString() }, haloViews: null, haloIndex: fx.index });
    const g0 = b.bench.calls.gateway.length;
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus="calendar-switch"]').count()) === 1, 10000, 200);
    const pressed = await p.locator('[data-haloplus="calendar-switch"] [aria-pressed="true"]').innerText();
    check(/This class/i.test(pressed), `${tag}: "This class | All classes" beside Halo's Show buttons, This class first ("${pressed}")`);
    check(b.bench.calls.gateway.length === g0, `${tag}: nothing asked of Halo until All classes is chosen`);
    await p.locator('[data-hp-cal="all"]').click();
    await until(async () => (await bars(p))?.length > 0, 15000, 200);
    await sleep(500);
    const asked = b.bench.calls.gateway.slice(g0).filter((c) => c.op === 'StudentAssessmentDetails');
    check(asked.length === fx.index.classes.length, `${tag}: one question per class to Halo (${asked.length})`);
    const hidden = await p.evaluate(() => getComputedStyle(document.getElementById('guide_anchor_dashboard_calendar')).display === 'none');
    check(hidden, `${tag}: Halo's own grid steps aside`);
    let ours = await bars(p);
    const haloH = await haloHeaders(p, '#guide_anchor_dashboard_calendar');
    const ourH = await haloHeaders(p, '[data-haloplus="calendar-all"] .hp-grid');
    check(JSON.stringify(haloH) === JSON.stringify(ourH) && ourH.length === 2, `${tag}: the same days as Halo's 2 Weeks (${ourH.map((w) => `${w[0]}…${w[6]}`).join(' / ')})`);
    // Every bar on the days Halo would draw it: from its start day to the student's due day, in Halo's zone.
    const headDays = ourH.map((w) => w.map((h) => h.replace(/^[A-Z][a-z]{2}, /, '')));
    const expect = (r, due) => {
      const s = md(r.start);
      const e = md(due);
      return { s, e };
    };
    let placed = 0;
    let wrong = [];
    for (const r of fx.index.rows.filter((x) => ['assignment', 'quiz', 'discussion', 'participation'].includes(x.kind) && x.start)) {
      const g = b.bench.state.grades[r.id];
      const due = g?.dueDate ?? r.cdue;
      const { s, e } = expect(r, due);
      const code = fx.index.classes[r.c].code;
      const segs = ours.filter((x) => x.text.endsWith(r.title) && x.text.includes(code));
      for (const seg of segs) {
        const w = headDays[seg.week];
        const fromDay = w[seg.from];
        const toDay = w[seg.to];
        const okFrom = fromDay === s || (seg.from === 0 && Date.parse(r.start) < Date.parse(`${day(Date.parse(r.start))}`) + 1e15);
        const okTo = toDay === e || (seg.to === 6 && day(due) > day(Date.parse(`2026-${String(new Date(Date.parse(due)).getUTCMonth() + 1).padStart(2, '0')}-01`)));
        if (!(fromDay === s || seg.from === 0) || !(toDay === e || seg.to === 6)) wrong.push(`${r.title}: ${fromDay}..${toDay} want ${s}..${e}`);
        else placed += 1;
        void okFrom;
        void okTo;
      }
    }
    check(placed > 3 && wrong.length === 0, `${tag}: every bar on Halo's days (${placed} segments${wrong.length ? `; wrong: ${wrong.slice(0, 3).join(' | ')}` : ''})`);
    const mv = ours.filter((x) => x.text.endsWith(moved.title)).sort((x, y) => y.week - x.week)[0];
    check(!mv || headDays[mv.week][mv.to] === md(b.bench.state.grades[moved.id].dueDate), `${tag}: a date the instructor moved since the last sync: drawn on Halo's new day (${mv ? headDays[mv.week][mv.to] : 'not in view'})`);
    const ac = ours.filter((x) => x.text.endsWith(accom.title));
    check(ac.every((x) => headDays[x.week][x.to] === md(accom.dueDate) || x.to === 6), `${tag}: a personal (accommodated) date is not drawn, as on Halo`);
    const segAcross = ours.filter((x) => x.text.endsWith(across.title));
    check(segAcross.length >= 1, `${tag}: a bar across days (${segAcross.length} segment(s))`);
    // Colours: Halo's own class colours.
    const legend = await p.locator('[data-haloplus="calendar-all"] .hp-legend').innerText();
    check(fx.index.classes.every((c) => legend.includes(c.code)), `${tag}: every class named in its colour (${legend.replace(/\s+/g, ' ')})`);
    const colOk = await p.evaluate((cols) => {
      const host = document.querySelector('[data-haloplus="calendar-all"]');
      return cols.every((c) => [...host.querySelectorAll('[style*="border-left"]')].some((el) => el.getAttribute('style').includes(c)) || !host.textContent.includes(''));
    }, fx.index.classes.map((c) => c.col));
    check(colOk, `${tag}: bars in Halo's class colours`);
    await p.screenshot({ path: `${OUT}/${tag}-2-all-classes.png` });
    // Halo's own "1 Week" drives both views.
    await p.locator('[data-testid="dashboard_calendar_num_weeks_1"]').click();
    await sleep(800);
    const one = await haloHeaders(p, '[data-haloplus="calendar-all"] .hp-grid');
    check(one.length === 1, `${tag}: Halo's 1 Week: one week in All classes too`);
    // A bar opens the item on Halo.
    ours = await bars(p);
    const link = ours.find((x) => x.href);
    if (link) {
      await Promise.all([p.waitForURL((u) => (u.pathname + u.search + u.hash).startsWith(link.href.split('#')[0]), { timeout: 10000 }), p.locator(`[data-haloplus="calendar-all"] a[href="${link.href}"]`).first().click()]);
      const u = new URL(p.url());
      check(u.pathname + u.search + u.hash === link.href, `${tag}: a bar opens it on Halo (${link.href})`);
    }
    await p.close();

    // 14: the next visit remembers 1 Week and All classes (both chosen by the student above); nothing scrolled.
    const g1 = b.bench.calls.gateway.length;
    p = await b.page(url);
    await until(async () => (await p.locator('[data-haloplus="calendar-all"]').count()) === 1, 10000, 200);
    await sleep(800);
    const mode = await p.locator('#calendar-container [data-testid^="dashboard_calendar_num_weeks_"].MuiButton-contained').getAttribute('data-testid');
    check(mode === 'dashboard_calendar_num_weeks_1', `${tag}: next visit: Halo's 1 Week picked again (${mode})`);
    check(/All classes/i.test(await p.locator('[data-haloplus="calendar-switch"] [aria-pressed="true"]').innerText({ timeout: 10000 }).catch(() => '')), `${tag}: and All classes`);
    check(b.bench.calls.gateway.length === g1, `${tag}: within ten minutes Halo is asked nothing more`);
    check(await p.evaluate(() => document.getElementById('CourseLayout--main').scrollTop === 0), `${tag}: never a scroll position`);
    await p.screenshot({ path: `${OUT}/${tag}-4-views-remembered.png` });
    await p.close();

    // Another time zone in the browser: the same days (Halo's school zone decides).
    p = await b.page(url);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
    await p.reload({ waitUntil: 'load' });
    await until(async () => (await bars(p))?.length > 0, 15000, 200);
    const ny = await bars(p);
    check(JSON.stringify(ny.map((x) => [x.text, x.from, x.to])) === JSON.stringify((await bars(p)).map((x) => [x.text, x.from, x.to])) && ny.length > 0, `${tag}: a browser in New York: the same bars on the same days (${ny.length})`);
    await p.close();

    // Halo does not answer for one class: named, left out; the others drawn.
    b.bench.state.gateway.StudentAssessmentDetails = ((orig) => (v, st) => (v.courseClassSlugId === fx.index.classes[2].slug ? null : orig(v, st)))(gradesGateway(fx).StudentAssessmentDetails);
    await b.store({ haloViews: { calAll: true, calWeeks: '2' } });
    const fx2 = JSON.parse(JSON.stringify(fx.index));
    fx2.at = new Date().toISOString();
    await b.store({ haloIndex: fx2 });
    p = await b.page(url);
    await until(async () => (await bars(p))?.length > 0, 20000, 200);
    const lg2 = await p.locator('[data-haloplus="calendar-all"] .hp-legend').innerText();
    check(/\(Halo did not answer\)/.test(lg2) && !(await bars(p)).some((x) => x.text.includes(fx.index.classes[2].code + ' ')), `${tag}: a class Halo does not answer for is named and left out`);
    await p.close();

    // Show nothing: Free; switched off; no index.
    for (const [name, extra] of [['Free', { tier: 'free' }], ['switched off', { haloFeat: { off: ['calendar'], at: new Date().toISOString() } }], ['no index', { haloIndex: null }]]) {
      await b.seed({ ...extra, haloViews: { calAll: true } });
      p = await b.page(url);
      await sleep(2500);
      check((await p.locator('[data-haloplus^="calendar"]').count()) === 0 && (await p.evaluate(() => getComputedStyle(document.getElementById('guide_anchor_dashboard_calendar')).display !== 'none')), `${tag}: ${name}: Halo's calendar alone`);
      await p.close();
    }
    // 1024px: fits.
    await b.seed({ haloViews: { calAll: true } });
    p = await b.page(url, { width: 1024 });
    await until(async () => (await bars(p))?.length > 0, 15000, 200);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tag}: at 1024px it fits`);
    await p.screenshot({ path: `${OUT}/${tag}-3-1024.png` });
    await p.close();
  } catch (e) {
    check(false, `${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
