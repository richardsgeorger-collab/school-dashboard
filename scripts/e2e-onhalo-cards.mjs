// Halo's class cards, option B (extension 0.12.5), on Halo's Student Home stand-in with the demo student Maya Torres's
// six classes (made up) and a finished class added to the page: the grade at the top right beside Halo's Topic chip;
// Halo's dates, instructor and class size on one quiet line ("28 students" still opens Halo's roster); a NEXT box in a
// light tint of the class colour with up to three things for the class, exactly as Halo has them (what can be done now,
// soonest first; then greyed with why: "opens Mon", "in class Fri"; participation only in spots nothing else fills (0.12.15); never done work; each opening the
// item on Halo; "Nothing due soon" when there is nothing); Halo's stripe and Go to class untouched; cards in a row one
// height with the buttons lined up; a finished class a card like the others in Halo's grid (0.12.6); every colour dot (the
// week strip, the calendar legend) in the class's own colour, never black or gray; all of it back after Halo redraws.
// Switched off: Halo's cards as they were. Full width and 1024px, plain and Better Halo dark.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-cards.mjs
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/cards');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1800000);
const L = (() => {
  const c = { URL, Intl, Date };
  c.globalThis = c;
  runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), c);
  return c.HaloPlusOnLogic;
})();
const PHX = 'America/Phoenix';
const DAY = 864e5;
const dk = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: PHX, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const clock = (t) => new Intl.DateTimeFormat('en-US', { timeZone: PHX, hour: 'numeric', minute: '2-digit' }).format(new Date(t)).replace(' ', ' ');
const wday = (t) => new Intl.DateTimeFormat('en-US', { timeZone: PHX, weekday: 'short' }).format(new Date(t));
const mday = (t) => new Intl.DateTimeFormat('en-US', { timeZone: PHX, month: 'short', day: 'numeric' }).format(new Date(t));
const days = (t, now) => Math.round((Date.parse(`${dk(t)}T00:00:00Z`) - Date.parse(`${dk(now)}T00:00:00Z`)) / DAY);
const word = (t, now) => (days(t, now) === 0 ? 'today' : days(t, now) === 1 ? 'tomorrow' : days(t, now) < 7 ? wday(t) : mday(t));
const when = (t, now) => (days(t, now) < 7 ? `${word(t, now)} ${clock(t)}` : mday(t));
const DONE = /^(LATE|SUBMITTED|PUBLISHED)$/;

/** What the NEXT box should say for each class, worked out here from the page's Halo data (not from Halo+'s code). */
function expected(fx, idx, st, now) {
  const statusOf = new Map(fx.payload.classes.flatMap((c) => c.assessments.map((a) => [a.id, a.status])));
  const out = {};
  idx.classes.forEach((c, k) => {
    const can = [];
    const cannot = [];
    for (const r of idx.rows) {
      if (r.c !== k || !['assignment', 'quiz', 'discussion', 'lti', 'participation'].includes(r.kind) || !r.href) continue;
      const due = Date.parse(st.grades[r.id]?.dueDate ?? r.cdue);
      const status = st.grades[r.id]?.status ?? statusOf.get(r.id);
      if (!(due >= now && due <= now + 14 * DAY) || DONE.test(status || '') || r.done) continue;
      const it = { title: r.title, href: r.href, due, part: r.kind === 'participation' || /participation/i.test(r.title) };
      if (r.inp === 1) cannot.push({ ...it, w: `in class ${word(due, now)}` });
      else if (r.ns && r.inp === undefined) continue;
      else if (Date.parse(r.start) > now) cannot.push({ ...it, w: `opens ${word(Date.parse(r.start), now)}` });
      else can.push({ ...it, w: when(due, now) });
    }
    const by = (a, b) => a.due - b.due || a.title.localeCompare(b.title);
    const all = [...can.sort(by), ...cannot.sort(by)];
    out[c.slug] = [...all.filter((i) => !i.part), ...all.filter((i) => i.part)].slice(0, 3);
    out[c.slug].held = all.filter((i) => i.part).length - out[c.slug].filter((i) => i.part).length;
  });
  return out;
}
const read = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')].map((c) => {
      const r = c.getBoundingClientRect();
      const go = c.querySelector('[data-testid="go_to_class"], .better-halo-icon-buttons-container');
      const next = c.querySelector('[data-haloplus="card-next"]');
      const det = c.querySelector('[data-haloplus="card-details"]');
      const g = c.querySelector('[data-haloplus="card-grade"]');
      const head = c.querySelector('[class*="CourseCard_headerItem"]');
      const meta = c.querySelector('[class*="CourseCard_metaContainer"]');
      return {
        slug: decodeURIComponent(/\/courses\/([^/?#]+)/.exec(c.querySelector('a[href^="/courses/"]').getAttribute('href'))[1]),
        top: Math.round(r.top),
        h: Math.round(r.height),
        w: Math.round(r.width),
        go: go ? Math.round(go.getBoundingClientRect().top) : null,
        stripe: c.style.borderTopColor,
        stripeDrawn: getComputedStyle(c).borderTopWidth,
        grade: g ? { letter: (g.querySelector('b') || {}).textContent || '', pct: (g.querySelector('span') || {}).textContent || '', beside: !!head && head.parentElement === g.parentElement && g.getBoundingClientRect().right > head.getBoundingClientRect().right } : null,
        details: det ? { text: det.textContent.replace(/\s+/g, ' ').trim(), size: parseFloat(getComputedStyle(det).fontSize) } : null,
        metaShown: !!meta && getComputedStyle(meta).display !== 'none',
        line: !!c.querySelector('[data-haloplus="class"]'),
        next: next ? { rows: [...next.querySelectorAll('.hp-n-row')].map((a) => {
          const t = a.querySelector('.hp-n-t');
          const w = a.querySelector('.hp-n-w');
          const ts = getComputedStyle(t);
          return { t: t.textContent, w: w.textContent.replace(/^\u00a0·\s*/, ''), href: a.getAttribute('href'), wait: a.classList.contains('hp-n-wait'), tip: a.title, gap: Math.round(w.getBoundingClientRect().left - t.getBoundingClientRect().right), italic: ts.fontStyle === 'italic' || getComputedStyle(w).fontStyle === 'italic', weight: Number(ts.fontWeight), color: ts.color, top: Math.round(a.getBoundingClientRect().top) };
        }), none: !!next.querySelector('.hp-n-none'), tint: getComputedStyle(next).backgroundColor, col: next.style.getPropertyValue('--c'), attr: c.getAttribute('color') } : null,
        finished: /post-class/i.test((c.querySelector('[class*="Tag_tag"]') || {}).textContent || ''),
        card: c.hasAttribute('data-hp-card'),
        slim: c.hasAttribute('data-hp-slim') ? 'slim' : null,
      };
    }),
  );
// "rgb(r, g, b)" (0-255) or Chrome's "color(srgb r g b)" (0-1), as 0-255.
const rgb = (s) => {
  const n = (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  return /^color\(srgb/.test(String(s)) ? n.map((v) => Math.round(v * 255)) : n;
};
const colourful = (s) => {
  const [r, g, b] = rgb(s);
  return r + g + b > 60 && Math.max(r, g, b) - Math.min(r, g, b) > 24;
};

for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `cards-${tag}`, bh: run.bh, bhDark: run.bh });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  const st = b.bench.state;
  try {
    const fx = b.fx;
    const now = Date.now();
    const idx = JSON.parse(JSON.stringify(fx.index));
    // The cases: a class's soonest item not open yet ("opens …"), one done in class ("in class …"), a class with all
    // its near work handed in ("Nothing due soon"), and a finished class on the page.
    st.grades = {};
    const rowsOf = (k) => idx.rows.filter((r) => r.c === k && ['assignment', 'quiz', 'discussion'].includes(r.kind) && r.href && Date.parse(r.cdue) > now && Date.parse(r.cdue) < now + 14 * DAY);
    const r0 = rowsOf(0);
    if (r0[0]) r0[0].start = new Date(now + 2 * DAY).toISOString();
    if (r0[1]) Object.assign(r0[1], { ns: 1, inp: 1 });
    for (const r of rowsOf(4)) st.grades[r.id] = { status: 'SUBMITTED' };
    st.extraCards = [{ slugId: 'ENG-105-O500-20260601', classCode: 'ENG-105-O500', name: 'English Composition I', id: 'demo-eng', stage: 'Post-Class', color: '#7b87c6' }];
    const snap = JSON.parse(JSON.stringify(fx.snap));
    snap.classes.push({ id: 'demo-course-ENG-105', code: 'ENG-105', cc: 'ENG-105-O500', slug: 'ENG-105-O500-20260601', name: 'English Composition I', g: 93.4, gl: 'A', ga: new Date().toISOString(), col: '#7b87c6' });
    const want = expected(fx, idx, st, now);
    const seed = (extra = {}) => b.seed({ lastAttemptAt: new Date().toISOString(), haloIndex: idx, haloSnap: snap, ...extra });
    for (const width of [1366, 1024]) {
      await seed({ haloFeat: { off: ['homecards'], at: new Date().toISOString() } });
      let p = await b.page('https://halo.gcu.edu/', { width, height: 1500 });
      await sleep(3500);
      const off = await read(p);
      check(off.every((c) => !c.next && !c.grade && c.metaShown) && off.filter((c) => c.line).length >= 6, `${tag} ${width}: switched off: Halo's cards as they were, with the Halo+ line`);
      await p.mouse.move(3, 3);
      await p.screenshot({ path: `${OUT}/${tag}-${width}-1-before.png` });
      await p.close();
      await seed();
      p = await b.page('https://halo.gcu.edu/', { width, height: 1500 });
      await until(async () => (await read(p)).filter((c) => c.next).length >= 6, 15000, 200);
      await sleep(800);
      const cs = await read(p);
      const main = cs.filter((c) => !c.finished);
      // The grade, beside Halo's Topic chip.
      const gWrong = main.filter((c) => {
        const s = snap.classes.find((x) => x.slug === c.slug);
        return !c.grade || c.grade.letter !== s.gl || c.grade.pct !== `${s.g.toFixed(1)}%` || !c.grade.beside;
      });
      check(gWrong.length === 0, `${tag} ${width}: each class's grade at the top right, beside Halo's Topic chip${gWrong.length ? ` (wrong: ${gWrong.map((c) => c.slug.slice(0, 7)).join(', ')})` : ''}`);
      // The details: one quiet line, Halo's words.
      check(main.every((c) => c.details && /Sep 8 - Dec 20, 2026/.test(c.details.text) && /Instructor/.test(c.details.text) && /28 students/.test(c.details.text) && c.details.size <= 13 && !c.metaShown && !c.line), `${tag} ${width}: dates, instructor and class size on one quiet line (Halo's words), the Halo+ line stepped aside`);
      // NEXT, exactly as worked out from Halo's data.
      const nWrong = [];
      for (const c of main) {
        const w = want[c.slug] || [];
        const got = c.next ? c.next.rows : null;
        const ok = got && got.length === w.length && got.every((r, i) => r.t === w[i].title && r.w === w[i].w && r.href === w[i].href && r.wait === /^(opens|in class) /.test(w[i].w) && r.tip.startsWith(w[i].title)) && (w.length ? !c.next.none : c.next.none);
        if (!ok) nWrong.push(`${c.slug.slice(0, 7)}: got ${JSON.stringify(got && got.map((r) => `${r.t} · ${r.w}`))} want ${JSON.stringify(w.map((x) => `${x.title} · ${x.w}`))}`);
      }
      check(nWrong.length === 0, `${tag} ${width}: NEXT: up to three, can-do first, then greyed with why, each opening it on Halo, "Nothing due soon" when nothing${nWrong.length ? ` (${nWrong.slice(0, 2).join(' | ')})` : ''}`);
      const waits = main.flatMap((c) => (c.next ? c.next.rows.filter((r) => r.wait) : []));
      check(waits.some((r) => /^opens /.test(r.w)) && waits.some((r) => /^in class /.test(r.w)) && main.some((c) => c.next && c.next.none), `${tag} ${width}: the cases are all there: "${waits.map((r) => r.w).join('", "')}", and a "Nothing due soon"`);
      check(main.every((c) => c.stripeDrawn === off.find((o) => o.slug === c.slug).stripeDrawn && c.stripe === off.find((o) => o.slug === c.slug).stripe), `${tag} ${width}: Halo's stripe untouched`);
      // One height a row; Go to class lined up.
      const rows = {};
      for (const c of main) (rows[c.top] ??= []).push(c);
      const uneven = Object.values(rows).filter((r) => r.length > 1 && (new Set(r.map((c) => c.h)).size > 1 || new Set(r.map((c) => c.go)).size > 1));
      check(Object.keys(rows).length >= 2 && uneven.length === 0, `${tag} ${width}: cards in a row one height, Go to class lined up (${Object.values(rows).map((r) => r.length).join('+')} a row)`);
      // The finished class: a card like the others, in its place in Halo's grid (0.12.6), its grade at the top right.
      const fin = cs.find((c) => c.finished);
      const rowTops = [...new Set(main.map((c) => c.top))];
      check(fin && fin.card && fin.slim === null && Math.abs(fin.w - main[0].w) <= 1 && (rowTops.includes(fin.top) || fin.top > Math.max(...rowTops)) && fin.grade && fin.grade.letter === 'A' && fin.grade.pct === '93.4%', `${tag} ${width}: the finished class is a card like the others in Halo's grid, with its grade (${fin ? `${fin.w}px wide, ${fin.grade ? fin.grade.letter + ' ' + fin.grade.pct : 'no grade'}` : 'none'})`);
      const perRow = width === 1366 ? 3 : 2;
      const allTops = cs.map((c) => c.top);
      const gaps = [...new Set(allTops)].sort((a, b) => a - b).slice(0, -1).filter((t) => allTops.filter((x) => x === t).length !== perRow);
      check(gaps.length === 0, `${tag} ${width}: Halo's grid has no gaps (${[...new Set(allTops)].map((t) => allTops.filter((x) => x === t).length).join('+')} a row)`);
      // The NEXT box: the class colour's tint (not gray), the time right after the title, no italics, the first a
      // little stronger, what cannot be done yet in plain gray.
      const gray = (c) => {
        const [r, g, b] = rgb(c);
        return Math.max(r, g, b) - Math.min(r, g, b) < 6;
      };
      const tintsGray = main.filter((c) => c.next && gray(c.next.tint));
      check(tintsGray.length === 0, `${tag} ${width}: every NEXT box in a tint of its class colour, none plain gray${tintsGray.length ? ` (${tintsGray.map((c) => `${c.slug.slice(0, 7)} ${c.next.tint} --c=${c.next.col} color=${c.next.attr}`).join(', ')})` : ''}`);
      const rowsAll = main.flatMap((c) => (c.next ? c.next.rows : []));
      check(rowsAll.length > 6 && rowsAll.every((r) => r.gap >= 0 && r.gap <= 12 && !r.italic), `${tag} ${width}: each item reads "title · when": the time right after the title, no italics`);
      const firsts = main.filter((c) => c.next && c.next.rows.length > 1);
      check(firsts.length > 0 && firsts.every((c) => (c.next.rows[0].wait || c.next.rows[0].weight >= 600) && c.next.rows.slice(1).every((r) => r.weight < 600)) && firsts.every((c) => c.next.rows.slice(1).every((r, i) => r.top - c.next.rows[i].top >= 22)), `${tag} ${width}: the first item a little stronger, room between the items`);
      const can = rowsAll.find((r) => !r.wait);
      check(rowsAll.filter((r) => r.wait).every((r) => r.color !== can.color), `${tag} ${width}: what cannot be done yet in plain gray, not the link colour`);
      const partIn = main.filter((c) => c.next && c.next.rows.some((r) => /participation/i.test(r.t)));
      const held = Object.values(want).reduce((n, w) => n + (w.held || 0), 0);
      check(partIn.every((c) => c.next.rows.filter((r) => !/participation/i.test(r.t)).length < 3 && c.next.rows.findIndex((r) => /participation/i.test(r.t)) >= c.next.rows.filter((r) => !/participation/i.test(r.t)).length), `${tag} ${width}: participation only after everything else, only where a class has fewer than three other things (${partIn.length} cards show it, ${held} held back)`);
      // Every class colour dot in its class's own colour.
      const dots = await p.evaluate(() => ({ strip: [...document.querySelectorAll('[data-haloplus="week-strip"] .hp-sd-dots i')].map((i) => getComputedStyle(i).borderTopColor), legend: [...document.querySelectorAll('[data-haloplus="home-calendar"] .hp-legend .hp-dot')].map((d) => getComputedStyle(d).backgroundColor) }));
      const bad = [...dots.strip, ...dots.legend].filter((c) => !colourful(c));
      check(dots.strip.length > 0 && dots.legend.length >= 6 && bad.length === 0, `${tag} ${width}: every colour dot (week strip ${dots.strip.length}, legend ${dots.legend.length}) in a class colour, none black or gray${bad.length ? ` (${bad.slice(0, 3).join(' ')})` : ''}`);
      const legendWant = idx.classes.map((c) => L.boldColor(main.find((m) => m.slug === c.slug)?.stripe.startsWith('#') ? main.find((m) => m.slug === c.slug).stripe : c.hex, run.bh));
      check(dots.legend.slice(0, 6).every((c, i) => rgb(c).join() === rgb(legendWant[i]).join()), `${tag} ${width}: the legend in each card's own colour`);
      // The roster still opens from "28 students".
      if (width === 1366) {
        await p.evaluate(() => {
          window.__roster = 0;
          document.querySelectorAll('[class*="CourseCard_studentsList"] button').forEach((x) => x.addEventListener('click', () => (window.__roster += 1)));
        });
        await p.locator('[data-haloplus="card-details"] [data-roster]').first().click();
        check((await p.evaluate(() => window.__roster)) === 1, `${tag}: "28 students" opens Halo's own roster`);
      }
      await p.mouse.move(3, 3);
      await p.screenshot({ path: `${OUT}/${tag}-${width}-2-after.png` });
      if (width === 1366) {
        // Halo redraws Student Home: no frame shows Halo's old card details, and the boxes come back.
        await p.evaluate(() => {
          window.__f = [];
          const t0 = performance.now();
          const tick = () => {
            const m = document.querySelector('#Home--main [class*="CourseCard_metaContainer"]');
            window.__f.push({ r: window.__hpRedraws, meta: !!m && getComputedStyle(m).display !== 'none' });
            if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await p.locator('#guide_anchor_header_myClasses').click();
        await sleep(1500);
        const fr = await p.evaluate(() => window.__f);
        const after = fr.filter((f) => f.r > fr[0].r);
        await until(async () => (await read(p)).filter((c) => c.next).length >= 6, 8000, 200);
        check(after.length > 15 && after.every((f) => !f.meta), `${tag}: Halo redraws Student Home: no frame shows Halo's old card details (${after.filter((f) => f.meta).length} of ${after.length}), and the NEXT boxes come back`);
      }
      await p.close();
    }
    st.extraCards = [];
  } catch (e) {
    check(false, `${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
