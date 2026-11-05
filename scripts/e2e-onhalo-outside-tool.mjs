// An outside tool's homework on Halo's Student Home (extension 0.12.19, George on real Halo: CHM-113 said "Nothing due
// soon" with an ALEKS homework due Sunday). An ALEKS-style homework (Halo's LTI: no Halo dropbox) due in 4 days, in a
// class whose other near work is all handed in, with the made-up demo student Maya Torres on Halo's page stand-ins:
// - the class card's NEXT shows it, opening its topic page on Halo (not "Nothing due soon"), whether or not Halo's
//   grade list carries it;
// - This week lists it, the week strip has its dot, the all-classes calendar its chip;
// - once its due date has passed: gone from NEXT and This week, never "overdue", a quiet chip on the calendar.
//   [BROWSER=chrome|edge] node scripts/e2e-onhalo-outside-tool.mjs   (fails at once if Better Halo cannot load)
import { gradesGateway } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/outside-tool');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1500000);
const DAY = 864e5;
const TITLE = 'ALEKS Homework 7: Stoichiometry';

const cardNext = (p, slug) =>
  p.evaluate((s) => {
    const card = [...document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')].find((c) => decodeURIComponent((c.querySelector('a[href^="/courses/"]')?.getAttribute('href') || '').split('/')[2] || '') === s);
    const n = card && card.querySelector('[data-haloplus="card-next"]');
    if (!n) return null;
    return { text: n.textContent.replace(/\s+/g, ' ').trim(), links: [...n.querySelectorAll('a')].map((a) => ({ t: a.textContent.trim(), href: a.getAttribute('href') })) };
  }, slug);
const weekRows = (p) =>
  p.evaluate(() => {
    const h = document.querySelector('[data-haloplus="week"]');
    const r = h && h.shadowRoot;
    if (!r) return null;
    const hd = r.querySelector('.hd');
    if (hd && hd.getAttribute('aria-expanded') !== 'true') hd.click();
    return null;
  });
const weekAll = (p) =>
  p.evaluate(() => {
    const m = document.querySelector('[data-haloplus="week"]')?.shadowRoot?.querySelector('.more');
    if (m) m.click();
  });
const weekList = (p) =>
  p.evaluate(() => {
    const r = document.querySelector('[data-haloplus="week"]')?.shadowRoot;
    return r ? [...r.querySelectorAll('li.r')].map((li) => ({ t: li.querySelector('a.t')?.textContent || '', late: li.classList.contains('late') })) : null;
  });

for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `outside-${tag}`, bh: run.bh, bhDark: run.bh });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  const st = b.bench.state;
  st.grades = {};
  try {
    const fx = b.fx;
    const now = Date.now();
    // The class: the one whose other near work Maya has all handed in (George's CHM-113 that week).
    const k = 4;
    const cls = fx.index.classes[k];
    const pay = fx.payload.classes.find((c) => c.slugId === cls.slug);
    for (const a of pay.assessments) if (Date.parse(a.dueDate) > now - DAY && Date.parse(a.dueDate) < now + 15 * DAY) st.grades[a.id] = { status: 'SUBMITTED' };
    const unit = pay.assessments.find((a) => a.unitId)?.unitId;
    const topic = `/courses/${encodeURIComponent(cls.slug)}/course-units/${encodeURIComponent(unit)}`;
    const due = new Date(Math.floor((now + 4 * DAY) / 60000) * 60000).toISOString();
    const make = (dueIso, href) => {
      const idx = JSON.parse(JSON.stringify(fx.index));
      idx.rows.push({ c: k, kind: 'lti', id: 'aleks-7', title: TITLE, topic: 'Topic 5', unit, href, due: dueIso, cdue: dueIso, start: new Date(now - 3 * DAY).toISOString(), type: 'LTI', pts: 20, forum: null, group: false, ns: 1, inp: 0, done: false });
      const snap = JSON.parse(JSON.stringify(fx.snap));
      const sc = snap.classes.find((c) => c.slug === cls.slug);
      snap.items.push({ id: 'item-aleks-7', h: 'aleks-7', c: sc.id, t: TITLE, due: dueIso, hd: dueIso, pts: 20, ty: 'homework', done: 0, x: 0, hy: 'LTI', ns: 1 });
      return { haloIndex: idx, haloSnap: snap };
    };

    // Before: the class's near work all handed in: "Nothing due soon".
    await b.seed({ lastAttemptAt: new Date().toISOString() });
    let p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1100 });
    await until(async () => { const t = (await cardNext(p, cls.slug))?.text || ''; return t && !/Getting what is next/.test(t); }, 15000, 200);
    const n0 = await cardNext(p, cls.slug);
    check(n0 && /Nothing due soon/.test(n0.text), `${tag}: without it, ${cls.code}'s card says "Nothing due soon" (George's card): "${n0 && n0.text}"`);
    await p.close();

    for (const [label, href, inHalo] of [
      ['an index from 0.12.19 (its topic page as its address), Halo’s grade list without it', topic, false],
      ['an index from before 0.12.19 (no address), Halo’s grade list with it', null, true],
    ]) {
      if (inHalo) pay.assessments.push({ id: 'aleks-7', title: TITLE, unit: 'Topic 5', unitId: unit, dueDate: due, classDueDate: due, points: 20, type: 'LTI', status: 'ACTIVE' });
      await b.seed({ lastAttemptAt: new Date().toISOString(), ...make(due, href) });
      p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1100 });
      await until(async () => /ALEKS/.test((await cardNext(p, cls.slug))?.text || ''), 15000, 200);
      const n1 = await cardNext(p, cls.slug);
      if (!(n1?.links || []).some((l) => l.t.startsWith(TITLE))) console.log('  card:', JSON.stringify(n1), JSON.stringify(await b.read(['haloIndex']).then((x) => x.haloIndex.rows.filter((r) => r.id === 'aleks-7'))));
      const link = n1 && n1.links.find((l) => l.t.startsWith(TITLE));
      check(link && link.href === topic && !/Nothing due soon/.test(n1.text), `${tag}: ${label}: NEXT shows "${TITLE}", opening its topic on Halo (${link && link.href})`);
      if (inHalo) pay.assessments.pop();
      if (!inHalo) {
        // This week, the strip, the calendar.
        await weekRows(p);
        await sleep(600);
        await weekAll(p);
        await until(async () => (await weekList(p))?.some((r) => r.t === TITLE), 8000, 200);
        const wl = await weekList(p);
        const sameWeek = await p.evaluate((d) => [...document.querySelectorAll('[data-haloplus="week-strip"] .hp-sd')].some((x) => x.getAttribute('data-day') === d), new Intl.DateTimeFormat('en-CA', { timeZone: fx.snap.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(due)));
        if (sameWeek) check(wl && wl.some((r) => r.t === TITLE && !r.late), `${tag}: This week lists it, not as overdue`);
        const dot = await p.evaluate((t) => [...document.querySelectorAll('[data-haloplus="week-strip"] .hp-sd-dots i')].some((i) => (i.getAttribute('title') || '').includes(t)), TITLE);
        if (sameWeek) check(dot, `${tag}: the week strip has its dot`);
        else console.log(`  (due ${due.slice(0, 10)} is after this week: This week and the strip are for this week only)`);
        const chip = await until(() => p.evaluate((t) => { const c = [...document.querySelectorAll('[data-haloplus="home-calendar"] .hp-chip')].find((x) => (x.getAttribute('title') || '').includes(t)); return c ? { quiet: c.classList.contains('hp-quiet'), over: c.classList.contains('hp-over'), href: c.getAttribute('href') } : null; }, TITLE), 8000, 200);
        check(chip && !chip.over && !chip.quiet && chip.href === topic, `${tag}: the calendar has its chip, plain, opening its topic (${JSON.stringify(chip)})`);
        await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-1-due-ahead.png` });
      }
      await p.close();
    }

    // After its due date: quiet.
    const past = new Date(now - 26 * 3600e3).toISOString();
    await b.seed({ lastAttemptAt: new Date().toISOString(), ...make(past, topic) });
    p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 1100 });
    await until(async () => { const t = (await cardNext(p, cls.slug))?.text || ''; return t && !/Getting what is next/.test(t); }, 15000, 200);
    await sleep(800);
    const n2 = await cardNext(p, cls.slug);
    await weekRows(p);
    await sleep(600);
    await weekAll(p);
    await sleep(600);
    const wl2 = (await weekList(p)) || [];
    const chip2 = await p.evaluate((t) => { const c = [...document.querySelectorAll('[data-haloplus="home-calendar"] .hp-chip')].find((x) => (x.getAttribute('title') || '').includes(t)); return c ? { quiet: c.classList.contains('hp-quiet'), over: c.classList.contains('hp-over') } : null; }, TITLE);
    check(n2 && !/ALEKS/.test(n2.text) && !wl2.some((r) => r.t === TITLE), `${tag}: past its due date: gone from NEXT and This week ("${n2 && n2.text}")`);
    check(!chip2 || (chip2.quiet && !chip2.over), `${tag}: never "overdue": ${chip2 ? 'a quiet chip on the calendar' : 'not on this calendar page'}`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-2-past.png` });
    await p.close();
  } catch (e) {
    console.log(`ERROR ${e.stack || e}`);
    check(false, `${tag}: ran to the end`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
