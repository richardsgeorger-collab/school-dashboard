// Halo+ for Safari (Loop 308), end to end on the Halo stand-in (lib/safariBench.mjs) with the demo student (made up),
// nothing sent anywhere real. The test build (SAFARI_TEST=1) is installed, turned on and allowed the way a student
// would (Settings → Apps → Safari → Extensions → Halo+), and every check reads the page Safari drew, through the test
// build's probe.
//   PLATFORM=ios  (iPhone Simulator, the default) | ipad (iPad Simulator) | mac (Safari on this Mac: needs the signed
//   build, see scripts/lib/safariApp.mjs, and Halo+ (test) turned on in Safari's Settings → Extensions once)
//   node scripts/e2e-safari.mjs
// Checks: Student Home (search, This week, the week strip in the width, grades and NEXT on the cards, no pill over the
// cards on a phone, nothing wider than the screen); search; a topic (countdowns, the personal date, the rubric under
// its row); the submit check-off (the moment, this device's mark, the account's mark); the pill on a class page; the
// visit sync reaching the account; the daily count saying which browser. Pictures in docs/screens/safari/<platform>/.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SUBMIT_REST, classPage, gradesGateway, onHaloFixture, topicGateway, topicPage } from './lib/haloPages.mjs';
import { checker, out, sleep } from './lib/onHaloRun.mjs';
import { safariBench } from './lib/safariBench.mjs';
import { buildApp, simDevice, simFreshSafari, simInstall, simOpen, simShot } from './lib/safariApp.mjs';
import { simDriver } from './lib/simDriver.mjs';

const PLATFORM = process.env.PLATFORM ?? 'ios';
const OUT = out(`docs/screens/safari/${PLATFORM}`);
const { check, passed } = checker(`safari-${PLATFORM}`);
const hard = setTimeout(() => (console.log('HARD TIMEOUT'), process.exit(3)), 3600000);
const phone = PLATFORM === 'ios';
const DAY = 864e5;
// The extension's own rules (logic.js), for what a countdown should say.
const ctx = { URL, Intl, Date };
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), ctx);
const L = ctx.HaloPlusOnLogic;
const H = 3600e3;

// ---- the device -------------------------------------------------------------------------------------------------------
let open;
let shot;
if (PLATFORM === 'mac') {
  const app = buildApp({ platform: 'mac', test: true });
  execFileSync('open', ['-g', app]);
  open = (url) => execFileSync('open', ['-a', 'Safari', url]);
  shot = (name) => execFileSync('screencapture', ['-x', '-o', '-l', execFileSync('osascript', ['-e', 'tell application "Safari" to id of front window'], { encoding: 'utf8' }).trim(), `${OUT}/${name}.png`], { stdio: 'ignore' });
} else {
  const sim = PLATFORM === 'ipad' ? simDevice('HaloPlus iPad', 'iPad Air 11-inch (M4)') : simDevice('HaloPlus iPhone', 'iPhone 17 Pro');
  console.log(`simulator ${sim}`);
  simInstall(sim, buildApp({ platform: 'ios', test: true }));
  // Turned on and allowed, as a student would in Settings.
  const path = ['Apps', 'Safari', 'Extensions', 'Halo+'];
  // Already on and allowed (a kept Simulator): one look, no taps.
  const now0 = simDriver(sim, { fresh: true, taps: path });
  const ready = now0.list.some((l) => /^switch: Allow Extension = 1/.test(l)) && now0.list.some((l) => /^button: 127\.0\.0\.1, Allow/.test(l)) && now0.list.some((l) => /^button: haloplus\.app, Allow/.test(l));
  let r = ready ? now0 : simDriver(sim, { fresh: true, taps: [...path, 'switch:Allow Extension=on', '127.0.0.1', 'Allow'] });
  check(r.ok, `Settings → Apps → Safari → Extensions → Halo+: turned on, Halo's site allowed${r.ok ? '' : ` (${r.why.slice(0, 200)})`}`);
  if (!ready) {
    simDriver(sim, { fresh: true, taps: [...path, 'haloplus.app', 'Allow'] });
    r = simDriver(sim, { fresh: true, taps: path });
  }
  console.log(`  ${r.list.filter((l) => /^button: .*(Ask|Allow|Deny)$|^switch/.test(l.replace(/ = .*$/, ''))).join(' | ')}`);
  simFreshSafari(sim);
  open = (url) => simOpen(sim, url);
  shot = (name) => simShot(sim, `${OUT}/${name}.png`);
}

const fx = onHaloFixture();
const b = await safariBench(fx, { pages: { '^/courses/[^/]+/course-units/[^/]+$': topicPage, '^/courses/[^/]+$': classPage }, rest: [SUBMIT_REST] });
Object.assign(b.state.gateway, topicGateway(fx), gradesGateway(fx));
const reports = (path) => b.reports.filter((r) => r.path.endsWith(path));

try {
  // ---- first visit: the extension's storage set as a sync would leave it (Max, an account) -------------------------
  const t = Date.now();
  open(b.halo(`/?first=${t}`));
  const took = await b.until(`first=${t}`, () => true, null, 40000);
  check(!!took, `Halo+ runs on Halo's page in Safari (${b.latest(`first=${t}`)?.ua?.match(/(iPhone|iPad|Macintosh)[^)]*\)/)?.[0] ?? 'no page seen'})`);
  if (!took) throw new Error('the extension never reported a page: is it turned on and allowed?');
  const firstTab = b.tabOf(`first=${t}`);
  const cleared = await b.cmd({ clear: true }, firstTab);
  const seed = { tier: 'max', lastSyncAt: fx.now, lastAttemptAt: new Date().toISOString(), syncKey: 'a'.repeat(48), haloSnap: fx.snap, haloIndex: fx.index, deviceId: 'ext-safari-test-device' };
  const seeded = await b.cmd({ set: seed }, firstTab);
  if (!cleared.ok || !seeded.ok) throw new Error(`could not set the extension up (${cleared.why || ''} ${seeded.why || ''})`);

  // ---- Student Home ---------------------------------------------------------------------------------------------------
  open(b.halo(`/?home=${t}`));
  const home = await b.until(
    `home=${t}`,
    () => {
      const next = [...document.querySelectorAll('[data-haloplus="card-next"]')];
      return next.length >= 6 && next.every((n) => !n.querySelector('.hp-sk')) ? true : null;
    },
    null,
    30000,
  );
  await sleep(1500);
  shot('1-home');
  const H1 = await b.read(`home=${t}`, () => {
    const r = (e) => (e && e.getAttribute('data-hp-r') ? e.getAttribute('data-hp-r').split(',').map(Number) : null);
    const vw = window.__vw;
    const week = document.querySelector('[data-haloplus="week"]');
    const days = [...document.querySelectorAll('[data-haloplus="week-strip"] .hp-sd')].map((d) => r(d));
    const bar = document.querySelector('[data-haloplus="search-bar"]');
    const kbd = bar && bar.shadowRoot ? bar.shadowRoot.querySelector('.kbd') : null;
    const layer = document.querySelector('[data-haloplus="layer"]');
    const pill = layer && layer.shadowRoot ? layer.shadowRoot.querySelector('.pill') : null;
    return {
      vw,
      week: !!week && r(week)[2] === 1,
      days,
      grades: [...document.querySelectorAll('[data-haloplus="card-grade"]')].map((g) => g.textContent.replace(/\s+/g, ' ').trim()),
      next: [...document.querySelectorAll('[data-haloplus="card-next"]')].map((n) => n.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)),
      bar: !!bar && r(bar)[2] === 1,
      kbd: kbd ? r(kbd)[2] === 1 : null,
      pill: pill ? r(pill)[2] === 1 : false,
    };
  });
  const snapHome = b.latest(`home=${t}`);
  const vw = snapHome.w;
  check(!!home, `Student Home: every class card's NEXT box filled from Halo's answers`);
  check(H1.week, 'Student Home: "This week" is there');
  check(H1.days.length === 7 && H1.days.every((d) => d && d[2] === 1 && d[3] >= 0 && d[3] + d[0] <= vw + 1) && new Set(H1.days.map((d) => d[4])).size === 1, `Student Home: the week strip's seven days on one line, inside the ${vw}px screen (${H1.days.map((d) => (d ? `${d[3]}+${d[0]}` : '-')).join(' ')})`);
  check(H1.grades.length >= 6 && H1.grades.every((g) => /^[A-F][+-]? ?\d+\.\d%$/.test(g)), `Student Home: a grade on every class card (${H1.grades.slice(0, 3).join(', ')}…)`);
  check(H1.bar, 'Student Home: the search box');
  // A touch screen with no keyboard (iPhone, iPad on its own) shows no ⌘K key; a Mac does.
  check(PLATFORM === 'mac' ? H1.kbd === true : H1.kbd === false, PLATFORM === 'mac' ? 'Mac: the ⌘K key shown' : `${PLATFORM === 'ipad' ? 'iPad' : 'iPhone'}: no ⌘K key shown (no keyboard)`);
  if (phone) check(!H1.pill, 'iPhone: no corner pill over the class cards on Student Home');
  check(snapHome.sw <= vw + 1, `Student Home: nothing wider than the screen (page ${snapHome.sw}px, screen ${vw}px)`);

  // ---- search -----------------------------------------------------------------------------------------------------------
  const q = fx.index.rows.find((r) => r.kind === 'assignment' && r.title.length > 8);
  const word = q.title.split(/\s+/).find((w) => w.length >= 5) || q.title.slice(0, 6);
  const typed = await b.cmd({ type: { selector: '[data-haloplus="search-bar"] >>> input', text: word } }, b.tabOf(`home=${t}`));
  const found = await b.until(
    `home=${t}`,
    (w) => {
      const roots = [...document.querySelectorAll('[data-haloplus^="search"]')].map((h) => h.shadowRoot).filter(Boolean);
      const rows = roots.flatMap((r) => [...r.querySelectorAll('[role="option"]')]).map((o) => o.textContent.replace(/\s+/g, ' ').trim());
      return rows.length && rows.some((t) => t.toLowerCase().includes(w.toLowerCase())) ? rows : null;
    },
    word,
    10000,
  );
  shot('2-search');
  check(typed.ok && !!found, `search: "${word}" lists what matches (${found ? `${found.length}: ${found[0].slice(0, 50)}` : 'nothing'})`);

  // ---- a topic: countdowns, the personal date, the rubric ----------------------------------------------------------------
  const units = [];
  for (const c of fx.payload.classes) {
    const by = {};
    for (const a of c.assessments) (by[a.unitId] ??= []).push(a);
    for (const [unitId, list] of Object.entries(by)) units.push({ cls: c, unitId, items: list });
  }
  const pick = units.sort((x, y) => y.items.length - x.items.length)[0];
  const now = Date.now();
  const at = (ms) => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
  const plan = [
    { dueDate: at(now + 5 * H), status: 'ACTIVE' },
    { dueDate: at(now + 30 * H), status: 'ACTIVE' },
    { dueDate: at(now - 20 * H), accommodatedDueDate: at(now + 50 * H), status: 'ACTIVE' },
  ];
  b.state.grades = {};
  pick.items.forEach((a, k) => (b.state.grades[a.id] = plan[k % plan.length]));
  const topicUrl = `/courses/${pick.cls.slugId}/course-units/${pick.unitId}`;
  open(b.halo(`${topicUrl}?t=${t}`));
  const topic = await b.until(`${topicUrl}?t=${t}`, () => (document.querySelector('[data-haloplus="topic"]') && document.querySelectorAll('[data-haloplus="duein"]').length >= 2 ? [...document.querySelectorAll('[data-haloplus="duein"]')].map((d) => d.textContent.trim()) : null), null, 20000);
  await sleep(800);
  shot('3-topic');
  const want = [...new Set(plan.map((g) => L.dueIn(g.accommodatedDueDate ?? g.dueDate, Date.now(), fx.snap.tz)))];
  check(!!topic && want.every((w) => topic.some((x) => x.includes(w))), `topic: the countdowns, as Halo+'s rules say (want ${want.join(', ')}; got ${topic ? [...new Set(topic)].join(' | ') : 'none'})`);
  const personal = pick.items.find((a, k) => plan[k % plan.length].accommodatedDueDate);
  check(!!topic && topic.some((x) => /in 2 days/.test(x)), `topic: "${personal.title}", due personally in 50 hours, reads "in 2 days"`);
  const rub = pick.items.findIndex((a) => a.rubricId || a.rubric);
  if (rub >= 0) {
    const r = await b.cmd({ click: `[data-testid="assessment_card"]:nth-of-type(${rub + 1}) a[data-testid="print_rubric_link"]` }, `${topicUrl}?t=${t}`);
    const opened = await b.until(`${topicUrl}?t=${t}`, () => !!document.querySelector('[data-testid="hp-rubric-total"]'), null, 8000);
    shot('4-rubric');
    check(r.ok && opened, 'topic: View Rubric opens the rubric under its row');
  }

  // ---- the check-off on submit -------------------------------------------------------------------------------------------
  const row = fx.index.rows.filter((r) => r.kind === 'assignment' && r.href && r.unit && Date.parse(r.cdue) > now + 3 * H && Date.parse(r.cdue) < now + 5 * DAY).sort((x, y) => Date.parse(x.cdue) - Date.parse(y.cdue))[0];
  const cls = fx.index.classes[row.c];
  b.state.grades = {};
  const subUrl = `/courses/${cls.slug}/course-units/${row.unit}`;
  open(b.halo(`${subUrl}?s=${t}`));
  await b.until(`${subUrl}?s=${t}`, () => !!document.querySelector('[data-haloplus="topic"]'), null, 20000);
  // This tab, wherever Halo's submission view takes it.
  const subTab = b.tabOf(`${subUrl}?s=${t}`);
  const d0 = reports('sync-drop').length;
  await b.cmd({ click: `[data-open="${row.id}"]` }, subTab);
  await sleep(700);
  await b.cmd({ click: '#guide_anchor_submitAssignment_submit' }, subTab);
  await b.until(subTab, () => !!document.querySelector('.hp-review .hp-submit'), null, 8000);
  await b.cmd({ click: '.hp-review .hp-submit' }, subTab);
  // Halo's submission view is a page of its own (its address changes): followed by the class.
  const moment = await b.until(
    subTab,
    () => {
      const r = document.getElementById('haloplus-joy')?.shadowRoot;
      const s = r && r.querySelector('.t strong');
      return s ? { title: s.textContent, confetti: !!r.querySelector('canvas.cf') } : null;
    },
    null,
    8000,
  );
  shot('5-checkoff');
  check(!!moment && moment.title === `${row.title} done`, `check-off: the moment on submit ("${moment ? moment.title : 'none'}"${moment && moment.confetti ? ', confetti' : ''})`);
  const marks = await b.cmd({ get: 'haloMarks' }, subTab);
  check(marks.ok && Object.values(marks.value.haloMarks || {}).some((m) => m.h === row.id && m.src === 'halo'), "check-off: this device's mark at once");
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && !reports('sync-drop').slice(d0).some((r) => r.body && r.body.mark && r.body.mark.done === true)) await sleep(200);
  check(reports('sync-drop').slice(d0).some((r) => r.body && r.body.mark && r.body.mark.done === true), "check-off: and the account's (sync-drop), from Safari's background");

  // ---- the pill on a class page ------------------------------------------------------------------------------------------
  open(b.halo(`/courses/${cls.slug}?c=${t}`));
  const pill = await b.until(
    `?c=${t}`,
    () => {
      const l = document.querySelector('[data-haloplus="layer"]');
      const p = l && l.shadowRoot && l.shadowRoot.querySelector('.pill');
      return p && p.getAttribute('data-hp-r') ? p.getAttribute('data-hp-r').split(',').map(Number) : null;
    },
    null,
    15000,
  );
  shot('6-class-pill');
  const cp = b.latest(`?c=${t}`);
  check(!!pill && pill[2] === 1 && pill[3] >= 0 && pill[3] + pill[0] <= cp.w + 1 && pill[4] + pill[1] <= cp.h, `a class page: the pill in the corner, inside the screen (${pill ? `${pill[0]}×${pill[1]} at ${pill[3]},${pill[4]}; screen ${cp.w}×${cp.h}` : 'none'})`);

  // ---- the visit sync, and the day's count -------------------------------------------------------------------------------
  // Halo's class list, the one answer a sync cannot do without (as in e2e-firstsync.mjs): two classes, three items.
  const day = (n) => new Date(Date.now() + n * DAY).toISOString();
  const A = (id, title, due, points, type) => ({ id, sequence: 1, title, description: '', startDate: day(-3), dueDate: day(due), points, type, tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false });
  // (The stand-in puts a handler's answer under `data`, as Halo does: the operation's name is the first key.)
  b.state.gateway.getCourseClassesForUser = () => ({ getCourseClassesForUser: {
    courseClasses: [
      { id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [A('as1', 'Topic 5 Homework', 3, 20, 'ASSIGNMENT'), A('as2', 'Quiz 2', 9, 50, 'QUIZ')] }] },
      { id: 'hc-eng', classCode: 'ENG-105-ONL4', slugId: 'ENG-105-ONL4-20260914', startDate: '2026-09-14', endDate: '2026-12-20', name: 'English Composition I', stage: 'CURRENT', modality: 'ONLINE', credits: 3, courseCode: 'ENG-105', units: [{ id: 'u2', title: 'Topic 4', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [A('as3', 'Rhetorical Analysis Final Draft', 6, 150, 'ASSIGNMENT')] }] },
    ],
  } });
  await b.cmd({ set: { lastAttemptAt: null, pingDay: null } }, b.tabOf(`?c=${t}`));
  const s0 = reports('sync-drop').length;
  open(b.halo(`/?sync=${t}`));
  const end = Date.now() + 90000;
  while (Date.now() < end && !reports('sync-drop').slice(s0).some((r) => r.body && (r.body.payload || r.body.raw || r.body.gz))) await sleep(500);
  const drop = reports('sync-drop').slice(s0).find((r) => r.body && (r.body.payload || r.body.raw || r.body.gz));
  console.log(`  sync runs: ${JSON.stringify(reports('report').filter((r) => r.body.kind === 'sync-run' && r.body.phase === 'end').map((r) => ({ outcome: r.body.outcome, cause: r.body.cause, s: r.body.seconds, tab: r.body.tab })))}`);
  check(!!drop, `the visit sync: Halo read in the student's own tab and sent to the account (${drop ? `${drop.body.raw ?? JSON.stringify(drop.body).length} bytes` : 'nothing sent'})`);
  const ping = reports('report').find((r) => r.body && r.body.kind === 'ext-ping');
  const wantPf = PLATFORM === 'mac' ? 'safari-mac' : 'safari-ios';
  check(!!ping && ping.body.platform === wantPf, `the day's count says which browser: ${ping ? ping.body.platform : 'no ping'}`);
} catch (e) {
  console.log(`ERROR ${e.stack || e}`);
  check(false, 'ran to the end');
} finally {
  await b.close();
  clearTimeout(hard);
}
console.log(passed() ? 'PASS' : 'FAIL');
process.exit(passed() ? 0 : 1);
