// No-account mode (Loop 305, George 2026-11-01), as a brand-new student, in a fresh Chrome profile, with and without
// Better Halo. The real backend decides the group at install (the test-only switch, no_account_test_installs, so a test
// never changes what a real student gets); Halo is the stand-in with the made-up demo student (Maya Torres's classes).
// Checks, no account:
// - the install is put in no-account mode; the welcome tab says "You're set: open Halo" (the account second);
// - the popup says Halo+ is on, Open Halo (no "One step left");
// - on Halo: Halo read with no account (kept on this computer), the NEXT boxes on the class cards, This week with its
//   boxes, ⌘K search, no "Set up Halo+" pill;
// - ticking a box: "Saved on this computer. Make a free account…"; nothing else, no pop-up;
// - the one quiet line after the third day of use, in the pill, once (not again on the next page);
// Then the student signs up (a throwaway) on the welcome tab: the kept read lands in the account, the check-off moves
// into it, and a switch changed on this computer moves into the account's settings. And a "current way" install keeps
// today's flow. Everything this run made is removed after; the switch goes back off.
//   KEYS_ENV=... [BH_DIR=…/bh/unpacked] [LOCAL_SITE=dist-site] node scripts/e2e-no-account.mjs
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { classPage, gradesGateway, onHaloFixture, standIn, topicGateway, topicPage } from './lib/haloPages.mjs';
import { launch, sleep, until } from './lib/haloStandIn.mjs';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const BH = process.env.BH_DIR && existsSync(join(process.env.BH_DIR, 'manifest.json')) ? resolve(process.env.BH_DIR) : null;
const EXT = resolve('extension');
const OUT = 'docs/screens/no-account';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => {
  checks.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const site = (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
  let file = join(LOCAL_SITE, path || 'index.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(LOCAL_SITE, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
};
const setSwitch = (on) => db.from('app_settings').upsert({ key: 'no_account_test_installs', value: on ? 'on' : null, updated_at: new Date().toISOString() });
const fx = onHaloFixture();
/** Halo's own answer to getCourseClassesForUser, from the fixture's export (units and their assessments). */
const classesAnswer = () => ({
  getCourseClassesForUser: {
    courseClasses: fx.payload.classes.map((c) => {
      const units = new Map();
      for (const a of c.assessments) {
        const u = units.get(a.unitId) ?? { id: a.unitId, title: a.unit, sequence: a.unitSequence, startDate: c.startDate, endDate: c.endDate, assessments: [] };
        u.assessments.push({ id: a.id, sequence: a.sequence, title: a.title, description: a.description, startDate: a.startDate, dueDate: a.dueDate, points: a.points, type: a.type, tags: a.tags, requiresLopesWrite: false, isGroupEnabled: false, inPerson: !!a.inPerson });
        units.set(a.unitId, u);
      }
      return { id: c.id, classCode: c.classCode, slugId: c.slugId, startDate: c.startDate, endDate: c.endDate, name: c.name, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: c.courseCode, units: [...units.values()], instructors: [] };
    }),
  },
});
const devices = [];
const made = [];
const hard = setTimeout(() => {
  console.log('HARD TIMEOUT');
  process.exit(3);
}, 1500000);

async function run(tag, bh) {
  const { browser, ctx, proc, load } = await launch('chrome', `noacct-${tag}`, ['--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36']);
  try {
    const bench = await standIn(ctx, fx, { bh, pages: { '^/courses/[^/]+/?$': classPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage } });
    Object.assign(bench.state.gateway, gradesGateway(fx), topicGateway(fx), { getCourseClassesForUser: classesAnswer });
    bench.state.grades = Object.fromEntries(fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
    await ctx.route('https://haloplus.app/**', site);
    // 1. Install from the Web Store (no Halo+ tab): the group, the welcome tab.
    if (bh) await load(resolve(BH));
    const { id, worker } = await load(EXT);
    const store = (o) => worker.evaluate((x) => chrome.storage.local.set(x), o);
    const read = (k) => worker.evaluate((x) => chrome.storage.local.get(x), k);
    const dev = await until(async () => (await read('deviceId')).deviceId ?? null, 15000, 300);
    devices.push(dev);
    const noAcct = await until(async () => (await read('noAcct')).noAcct ?? null, 15000, 300);
    const row = (await db.from('ext_installs').select('grp, source, test').eq('device_id', dev).maybeSingle()).data;
    check(!!noAcct && row?.grp === 'no-account' && row?.source === 'store' && row?.test === true, `${tag}: the new install is in no-account mode (${JSON.stringify(row)})`);
    const welcome = await until(async () => ctx.pages().find((p) => p.url().startsWith('https://haloplus.app/')) ?? null, 20000, 300);
    await welcome.setViewportSize({ width: 1280, height: 860 });
    await welcome.reload({ waitUntil: 'load' });
    await welcome.waitForFunction(() => /You're set: open Halo/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => undefined);
    const wt = (await welcome.locator('body').innerText()).replace(/\s+/g, ' ');
    check(/mode=open/.test(welcome.url()) && /You're set: open Halo\./.test(wt) && /Make a free account/.test(wt) && !/One step left/.test(wt), `${tag}: the welcome tab: "${wt.slice(0, 140)}"`);
    await welcome.screenshot({ path: `${OUT}/${tag}-1-welcome.png` });
    // 2. The popup.
    const pop = await ctx.newPage();
    await pop.setViewportSize({ width: 360, height: 420 });
    await pop.goto(`chrome-extension://${id}/popup.html`);
    await sleep(1000);
    const pt = (await pop.locator('body').innerText()).replace(/\s+/g, ' ');
    check(/Halo\+ is on/.test(pt) && /Open Halo/.test(pt) && /Free account: get Halo\+ on your phone too/.test(pt) && !/One step left/.test(pt), `${tag}: the popup: "${pt.slice(0, 120)}"`);
    await pop.screenshot({ path: `${OUT}/${tag}-2-popup.png` });
    await pop.close();
    // 3. Halo: read with no account, then everything on Halo's pages.
    const halo = await ctx.newPage();
    await halo.setViewportSize({ width: 1366, height: 900 });
    await halo.goto('https://halo.gcu.edu/', { waitUntil: 'load' });
    const kept = await until(async () => {
      const s = await read(['haloIndex', 'haloLive', 'waiting', 'lastError']);
      return s.haloIndex && s.haloLive && s.waiting ? s : null;
    }, 60000, 1000);
    check(!!kept && !kept.lastError, `${tag}: Halo read with no account, kept on this computer (${kept ? `${kept.haloLive.classes.length} classes` : 'nothing'}; no error)`);
    await halo.reload({ waitUntil: 'load' });
    const next = await until(async () => ((await halo.locator('[data-haloplus="card-next"]').count()) >= 3 ? true : null), 30000, 500);
    const week = await until(async () => ((await halo.locator('[data-haloplus="week"]').count()) === 1 ? true : null), 20000, 500);
    await sleep(1500);
    // This week starts folded for everyone: open it, as a student does.
    await halo.evaluate(() => document.querySelector('[data-haloplus="week"]').shadowRoot.querySelector('[aria-expanded]')?.click());
    await sleep(1200);
    const boxes = await halo.evaluate(() => {
      const h = document.querySelector('[data-haloplus="week"]');
      return h && h.shadowRoot ? h.shadowRoot.querySelectorAll('input[type="checkbox"]').length : 0;
    });
    const setupPill = await halo.evaluate(() => [...document.querySelectorAll('[data-haloplus]')].some((h) => h.shadowRoot && h.shadowRoot.querySelector('.pill-setup')));
    check(!!next && !!week && boxes > 0 && !setupPill, `${tag}: on Halo with no account: NEXT boxes, This week with ${boxes} boxes to tick, no "Set up Halo+"`);
    await halo.screenshot({ path: `${OUT}/${tag}-3-halo-home.png` });
    const mod = (await halo.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
    await halo.keyboard.press(`${mod}+k`);
    const search = await until(async () => ((await halo.locator('[data-haloplus="search-palette"]').count()) === 1 ? true : null), 8000, 200);
    await halo.keyboard.type('topic');
    await sleep(700);
    check(!!search, `${tag}: ⌘K search works with no account`);
    await halo.screenshot({ path: `${OUT}/${tag}-4-search.png` });
    await halo.keyboard.press('Escape');
    // 4. Tick one off: the quiet note.
    const ticked = await halo.evaluate(() => {
      const h = document.querySelector('[data-haloplus="week"]');
      const b = h.shadowRoot.querySelector('input[type="checkbox"]');
      const id = b.dataset.id;
      b.click();
      return id;
    });
    await sleep(1500);
    const note = await halo.evaluate(() => document.querySelector('[data-haloplus="week"]').shadowRoot.querySelector('.local')?.textContent ?? '');
    const marks = (await read('haloMarks')).haloMarks || {};
    const popups = await halo.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].length);
    check(/^Saved on this computer\. Make a free account to keep it everywhere\.$/.test(note) && marks[ticked]?.pre === true && popups === 0, `${tag}: a check-off: "${note}", kept here for the account, no pop-up`);
    await halo.locator('[data-haloplus="week"]').scrollIntoViewIfNeeded();
    await halo.screenshot({ path: `${OUT}/${tag}-5-checked.png` });
    // 5. The one quiet line after the third day of use.
    const d = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA');
    await store({ haloUseDays: [d(2), d(1), d(0)], haloPhoneLine: null, haloUi: null });
    const cls = fx.payload.classes[0];
    await halo.goto(`https://halo.gcu.edu/courses/${cls.slugId}`, { waitUntil: 'load' });
    const line = await until(async () => {
      const t = await halo.evaluate(() => [...document.querySelectorAll('[data-haloplus]')].map((h) => (h.shadowRoot && h.shadowRoot.querySelector('.pill .long')?.textContent) || '').join(''));
      return /Get this on your phone: free account/.test(t) ? t : null;
    }, 15000, 300);
    check(!!line, `${tag}: after the third day, once, in the pill: "${line}"`);
    await halo.screenshot({ path: `${OUT}/${tag}-6-phone-line.png` });
    await sleep(8000);
    await halo.goto(`https://halo.gcu.edu/courses/${fx.payload.classes[1].slugId}`, { waitUntil: 'load' });
    await sleep(4000);
    const again = await halo.evaluate(() => [...document.querySelectorAll('[data-haloplus]')].some((h) => /Get this on your phone/.test((h.shadowRoot && h.shadowRoot.querySelector('.pill .long')?.textContent) || '')));
    check(!again, `${tag}: not again on the next page`);
    // A switch changed on this computer, before the account.
    const featAt = new Date().toISOString();
    await store({ haloFeat: { off: ['confetti'], at: featAt } });
    // 6. Sign up on the welcome tab (the throwaway stands in for the form's new account).
    const who = await kit.persona('new');
    made.push(who.id);
    await welcome.goto('https://haloplus.app/#/welcome?src=store&mode=open&signup=1', { waitUntil: 'load' });
    await welcome.evaluate(({ ses, key }) => localStorage.setItem(key, JSON.stringify(ses)), { ses: who.session, key: `sb-${ref}-auth-token` });
    await welcome.reload({ waitUntil: 'load' });
    const linked = await until(async () => (await db.from('ext_installs').select('user_id').eq('device_id', dev).maybeSingle()).data?.user_id ?? null, 30000, 1000);
    check(linked === who.id, `${tag}: signed up: the install links to the account`);
    // The app applies it (Halo+ open on the welcome tab), then the check-off follows.
    await welcome.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
    const classes = await until(async () => {
      const { count } = await db.from('courses').select('id', { count: 'exact', head: true }).eq('user_id', who.id);
      return count >= fx.payload.classes.length ? count : null;
    }, 90000, 2000);
    check(!!classes, `${tag}: the read kept on this computer went into the account (${classes} classes)`);
    const done = await until(async () => {
      const r = (await db.from('items').select('id, data->>status').eq('user_id', who.id).eq('id', ticked).maybeSingle()).data;
      return r && r.status === 'done' ? r : null;
    }, 120000, 3000);
    check(!!done, `${tag}: the check-off made with no account is done in the account (${ticked})`);
    const prefs = await until(async () => {
      const s = (await db.from('settings').select('data').eq('user_id', who.id).maybeSingle()).data?.data;
      return s && Array.isArray(s.haloFeaturesOff) && s.haloFeaturesOff.includes('confetti') ? s.haloFeaturesOff : null;
    }, 60000, 2000);
    check(!!prefs, `${tag}: a switch changed on this computer moved into the account (${JSON.stringify(prefs)})`);
    await welcome.screenshot({ path: `${OUT}/${tag}-7-signed-up-now.png` });
  } finally {
    await browser.close().catch(() => undefined);
    proc.kill();
  }
}

/** The current way, for the other group: today's welcome tab and the "Set up Halo+" pill. */
async function current() {
  const { browser, ctx, proc, load } = await launch('chrome', 'noacct-current', ['--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36']);
  try {
    await ctx.route('https://haloplus.app/**', site);
    const { worker } = await load(EXT);
    const dev = await until(async () => (await worker.evaluate(() => chrome.storage.local.get('deviceId'))).deviceId ?? null, 15000, 300);
    devices.push(dev);
    const row = await until(async () => (await db.from('ext_installs').select('grp').eq('device_id', dev).maybeSingle()).data ?? null, 15000, 500);
    const s = await worker.evaluate(() => chrome.storage.local.get('noAcct'));
    const welcome = await until(async () => ctx.pages().find((p) => p.url().startsWith('https://haloplus.app/')) ?? null, 20000, 300);
    check(row?.grp === 'current' && !s.noAcct && !/mode=open/.test(welcome?.url() ?? ''), `current way: the group is "current", today's welcome tab (${welcome?.url()})`);
  } finally {
    await browser.close().catch(() => undefined);
    proc.kill();
  }
}

try {
  await setSwitch(true);
  await run('plain', false);
  if (BH) await run('bh', true);
  else console.log('(no BH_DIR: Better Halo run skipped)');
  await setSwitch(false);
  await current();
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  clearTimeout(hard);
  await setSwitch(false);
  if (devices.length) {
    await db.from('ext_pings').delete().in('device_id', devices);
    await db.from('ext_installs').delete().in('device_id', devices);
  }
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
