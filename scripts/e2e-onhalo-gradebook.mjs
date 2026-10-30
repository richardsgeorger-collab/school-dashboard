// What-if on Halo's Gradebook (extension 0.12.14, George 2026-10-29), on Halo's Gradebook stand-in (docs/halo-gradebook.md)
// with the made-up demo student Maya Torres: a small What-if toggle with the Halo+ mark beside Halo's score cards, off
// at first; on: a score box in every row (table at 1366px and wider, cards below), the What-if card starting at Halo's
// own letter and percent (exact: Halo's rows add up to its total), moving live as a score is typed, Halo's total beside
// it; the next big item in plain words ("On <item> (tomorrow), you need …% for an A…") whose letter fills it in;
// "What do I need?" under the total; a total the rows don't reach makes it "Estimate"; Halo redrawing the rows (a
// resize across 1366px) gets the boxes back; off puts Halo's page back exactly as Halo drew it; nothing is sent to Halo;
// the feature's own switch off: nothing at all. Chrome and Edge, without and with Better Halo, light and dark.
//   [BROWSER=chrome|edge] [BH_DIR=<Better Halo unpacked>] node scripts/e2e-onhalo-gradebook.mjs
import { gradebookPage } from './lib/haloPages.mjs';
import { BROWSER, bhPath, checker, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/on-halo/gradebook');
const { check, passed } = checker(BROWSER);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 1200000);
const DAY = 864e5;
/** Halo's page with everything Halo+ added taken out: what Halo drew. */
const haloOnly = (p) => p.evaluate(() => { const m = document.querySelector('#hp-gb-root').cloneNode(true); m.querySelectorAll('[data-haloplus]').forEach((n) => n.remove()); return m.innerHTML; });
// The card's words, the letter picker read as the letter picked.
const card = (p) => p.evaluate(() => { if (!document.querySelector('[data-haloplus="wi-card"]')) return null; const c = document.querySelector('[data-haloplus="wi-toggle"]'); const k = c.cloneNode(true); const sel = k.querySelector('select'); if (sel) sel.replaceWith(c.querySelector('select').value); return k.textContent.replace(/\s+/g, ' ').trim(); });

for (const run of [{ bh: false, dark: false }, { bh: false, dark: true }, ...(bhPath ? [{ bh: true, dark: true }] : [])]) {
  const tag = `${run.bh ? 'bh' : 'plain'}-${run.dark ? 'dark' : 'light'}`;
  const b = await openBench({ label: `gradebook-${tag}`, bh: run.bh, bhDark: run.dark, pages: { '^/courses/[^/]+/student/gradebook/?$': gradebookPage } });
  try {
    const fx = b.fx;
    const now = Date.now();
    // A class with a big item still to come: it is due tomorrow (the exam-eve case).
    const cls = fx.payload.classes.find((c) => c.assessments.some((a) => a.status !== 'PUBLISHED' && a.points >= 40 && ['QUIZ', 'ASSIGNMENT'].includes(a.type))) ?? fx.payload.classes[0];
    const big = cls.assessments.filter((a) => a.status !== 'PUBLISHED' && a.points >= 40).sort((x, y) => y.points - x.points)[0];
    const tomorrow = new Date(Math.floor((now + DAY) / 60000) * 60000);
    tomorrow.setUTCHours(6, 59, 0, 0);
    if (tomorrow.getTime() < now + 12 * 3600e3) tomorrow.setTime(tomorrow.getTime() + DAY);
    b.bench.state.grades = { [big.id]: { status: 'ACTIVE', dueDate: tomorrow.toISOString() } };
    for (const a of cls.assessments) if (a.id !== big.id && a.status !== 'PUBLISHED' && Date.parse(a.dueDate) < tomorrow.getTime() + DAY) b.bench.state.grades[a.id] = { status: 'ACTIVE', dueDate: new Date(tomorrow.getTime() + 3 * DAY).toISOString() };
    console.log(`class ${cls.courseCode}, big item "${big.title}" (${big.points} pts) due tomorrow`);
    await b.seed({ lastAttemptAt: new Date().toISOString(), haloWiOn: false });
    const url = `https://halo.gcu.edu/courses/${cls.slugId}/student/gradebook`;
    let p = await b.page(url, { width: 1440, height: 900, scheme: run.dark ? 'dark' : 'light' });
    await until(async () => (await p.locator('[data-haloplus="wi-toggle"]').count()) === 1, 10000, 200);
    const before = await haloOnly(p);
    const rowsN = await p.locator('[data-testid^="student_Assessment_Status_Button="]').count();
    check((await p.locator('[data-haloplus="wi-toggle"] > button[aria-pressed="false"]').count()) === 1 && (await p.locator('[data-haloplus="wi-toggle"] svg').count()) >= 1 && (await p.locator('[data-haloplus="wi-box"]').count()) === 0, `${tag}: a small What-if toggle with the Halo+ mark, off at first, nothing else (${rowsN} rows)`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-0-off.png`, clip: { x: 0, y: 0, width: 1440, height: 560 } });
    const calls0 = b.bench.calls.gateway.length;

    // On.
    await p.locator('[data-haloplus="wi-toggle"] > button').click();
    await until(async () => (await p.locator('[data-haloplus="wi-box"]').count()) === rowsN, 6000, 100);
    check((await p.locator('[data-haloplus="wi-box"]').count()) === rowsN, `${tag}: on: a score box in every row (${rowsN})`);
    const halo = await p.evaluate(() => { const cs = [...document.querySelectorAll('[class*="GradingScoreCard_scoreCard"]')].filter((c) => !c.closest('[data-haloplus]')); return { letter: cs[0].querySelector('[data-testid="student_scored_points"]').firstChild.nodeValue, pct: cs[2].querySelector('[data-testid="student_scored_points"]').firstChild.nodeValue }; });
    let c = await card(p);
    const pctNum = Number(halo.pct.replace('%', ''));
    check(c && c.startsWith('What-if') && !/Estimate/.test(c) && c.includes(`${halo.letter}${(Math.round(pctNum * 10) / 10).toFixed(1)}%`), `${tag}: the What-if card starts at Halo's own ${halo.letter} ${halo.pct}, exact: "${c}"`);
    const line = (await p.locator('[data-haloplus="wi-next"]').innerText()).replace(/\s+/g, ' ').trim();
    check(new RegExp(`^On ${big.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(tomorrow\\), you need \\d+(\\.\\d)?% for an? [A-D][+-]?`).test(line), `${tag}: the next big item in plain words: "${line}"`);
    check(/For an? [A-D][+-]?, you need about \d+% on what’s left|locked in|isn’t reachable/.test(c), `${tag}: "What do I need?" under the total`);
    // Typing a score moves it live.
    const bigBox = p.locator('[data-haloplus="wi-box"] input').nth(await p.evaluate((id) => [...document.querySelectorAll('[data-testid^="student_Assessment_Status_Button="]')].filter((x) => !x.closest('[data-haloplus]')).findIndex((x) => x.getAttribute('data-testid').endsWith(`=${id}`)), big.id));
    await bigBox.fill(String(Math.round(big.points * 0.5)));
    await sleep(200);
    c = await card(p);
    check(/Halo: /.test(c) && !c.includes(`${halo.letter}${(Math.round(pctNum * 10) / 10).toFixed(1)}%`), `${tag}: 50% on it: the card moves live, Halo's beside it: "${c}"`);
    // A letter in the line fills it in.
    const first = p.locator('[data-haloplus="wi-next"] button').first();
    const want = await first.innerText();
    const pctWant = Number(await first.getAttribute('data-pct'));
    await first.click();
    await sleep(250);
    const filled = Number(await bigBox.inputValue());
    c = await card(p);
    check(Math.abs(filled - (big.points * pctWant) / 100) < 0.01 && c.includes(`What-if`) && new RegExp(`^What-if ?${want.replace('+', '\\+')}\\d`).test(c.replace(/^What-if\s*/, 'What-if ')), `${tag}: tapping "${want}" fills in ${pctWant}% (${filled} pts) and the card shows ${want}: "${c}"`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-1-on.png`, fullPage: true });
    check(b.bench.calls.gateway.length === calls0, `${tag}: nothing sent to Halo while trying scores (${b.bench.calls.gateway.length - calls0} calls)`);

    // Halo redraws the rows (narrower than 1366px: cards): the boxes come back, the what-ifs too.
    await p.setViewportSize({ width: 1024, height: 900 });
    await until(async () => (await p.locator('[class*="studentFeedbackCard_"] [data-haloplus="wi-box"]').count()) === rowsN, 6000, 100);
    check((await p.locator('[class*="studentFeedbackCard_"] [data-haloplus="wi-box"]').count()) === rowsN, `${tag}: Halo's narrow layout (cards): a box in every card`);
    await p.screenshot({ path: `${OUT}/${BROWSER}-${tag}-2-cards.png`, fullPage: true });
    await p.setViewportSize({ width: 1440, height: 900 });
    await until(async () => (await p.locator('tr [data-haloplus="wi-box"]').count()) === rowsN, 6000, 100);

    // Off: Halo's page exactly as Halo drew it (as it is now: Halo redrew it on the resize, and Better Halo redecorates
    // a redraw its own way; without Better Halo it is also the very first page).
    await sleep(600);
    const justBefore = await haloOnly(p);
    await p.locator('[data-haloplus="wi-toggle"] > button').click();
    await sleep(300);
    const afterOff = await haloOnly(p);
    if (!run.bh) check(afterOff === before, `${tag}: off: the very same page Halo first drew`);
    check(afterOff === justBefore && (await p.locator('[data-haloplus^="wi-"]:not([data-haloplus="wi-toggle"]):not([data-haloplus="wi-style"])').count()) === 0, `${tag}: off: Halo's page exactly as Halo drew it`);
    await p.close();

    // A total the rows don't reach: "Estimate", never a confident number.
    if (!run.dark) {
      const pub = cls.assessments.filter((a) => a.status === 'PUBLISHED' && typeof a.score === 'number');
      b.bench.state.finalGrade = { [cls.slugId]: { points: pub.reduce((x, a) => x + a.score, 0) - 3, max: pub.reduce((x, a) => x + a.points, 0), letter: 'B' } };
      await b.store({ haloWiOn: true });
      p = await b.page(url, { width: 1440, height: 900 });
      await until(async () => !!(await card(p)), 8000, 150);
      c = await card(p);
      check(/Estimate/.test(c), `${tag}: Halo's total the rows don't reach: "Estimate" (${c})`);
      await p.close();
      delete b.bench.state.finalGrade;
      // The feature's own switch off: nothing at all.
      await b.store({ haloFeat: { off: ['whatif'], at: new Date().toISOString() } });
      p = await b.page(url, { width: 1440, height: 900 });
      await sleep(2500);
      check((await p.locator('[data-haloplus^="wi-"]').count()) === 0, `${tag}: its own switch off: nothing on the Gradebook`);
      await p.close();
    }
  } catch (e) {
    check(false, `${tag}: ${String(e.stack ?? e).slice(0, 400)}`);
  } finally {
    await b.close();
  }
}
clearTimeout(hard);
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
