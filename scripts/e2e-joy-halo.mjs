// Confetti on Halo (extension 0.5.0, George 2026-10-02). The unpacked extension from this repo, the real app on a
// throwaway account (served at haloplus.app from the local preview build), and a stand-in Halo page that does what
// Halo's own code does on a submission (read from Halo's bundles, build Jk7eKpHtXMWHqa6Y8LtAT): the submit modal
// opens at #assignment-submission/{id} through the Next router (pushState, no hashchange), the modal closes, then
// react-toastify shows "Assignment has been submitted.". Checks: the app hands the snapshot over; the moment and its
// numbers; a quiet sync that opens and focuses nothing; a failed submission, a plain discussion reply, Free and
// Celebrations off get no moment; a DQ response and a quiz do; reduced motion is a glow. Screens light and dark.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-joy-halo.mjs
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = new URL(process.env.BASE ?? 'http://localhost:4174/school-dashboard/');
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const OUT = 'docs/screens/joy';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The stand-in Halo page. window.halo.* does what Halo's code does; nothing else.
const HALO_PAGE = `<!doctype html><meta charset="utf-8"><title>Halo</title>
<style>body{font:15px system-ui;margin:0;padding:32px;background:#f4f5f7;color:#222}main{max-width:720px;margin:auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 10px #0001}
h1{font-size:22px;margin:0 0 6px}p{color:#555}.btn{background:#5a2d82;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-weight:600}
.Toastify__toast-container{position:fixed;top:16px;right:16px;width:320px}.Toastify__toast{background:#fff;border-left:6px solid #07bc0c;border-radius:6px;padding:14px;box-shadow:0 4px 12px #0002;margin-bottom:8px}</style>
<main><h1>Topic 4 Lab Report</h1><p>CHM-113L · Due Sunday 11:59 PM · Halo (stand-in page for the test)</p><button class="btn">Submit Assignment</button></main>
<div class="Toastify"><div class="Toastify__toast-container Toastify__toast-container--top-right"></div></div>
<script>
window.halo = {
  open(kind, id) { history.pushState(null, '', location.pathname + location.search + '#' + (kind === 'dq' ? 'discussion-submission/' + id + '/fid/F1' : 'assignment-submission/' + id)); },
  close() { history.pushState(null, '', location.pathname + location.search); },
  toast(text, type) { const t = document.createElement('div'); t.className = 'Toastify__toast Toastify__toast--' + (type || 'success'); t.innerHTML = '<div role="alert" class="Toastify__toast-body">' + text + '</div>'; document.querySelector('.Toastify__toast-container').append(t); setTimeout(() => t.remove(), 5000); },
};
</script>`;

const ectx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'haloplus-joy-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 860 } });
try {
  const gateway = { n: 0 };
  // haloplus.app is the local preview build, so the content script runs on the real app.
  await ectx.route('https://haloplus.app/**', async (route) => {
    const u = new URL(route.request().url());
    const path = u.pathname.startsWith(BASE.pathname) ? u.pathname : BASE.pathname.replace(/\/$/, '') + u.pathname;
    const r = await fetch(new URL(path + u.search, BASE));
    route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'text/html' }, body: Buffer.from(await r.arrayBuffer()) });
  });
  await ectx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: HALO_PAGE })));
  await ectx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    gateway.n++;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'test gateway' }] }) });
  });
  await ectx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  let [worker] = ectx.serviceWorkers();
  if (!worker) worker = await ectx.waitForEvent('serviceworker', { timeout: 15000 });
  const store = (keys) => worker.evaluate((k) => chrome.storage.local.get(k), keys);

  // A Plus student, signed in to Halo+ on this computer.
  const s = await kit.persona('plus');
  await ectx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  const dash = await ectx.newPage();
  await dash.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await dash.waitForSelector('.now', { timeout: 30000 });
  let st = {};
  for (let i = 0; i < 20 && !(st.joySnap && st.tier); i++) { await sleep(1000); st = await store(['joySnap', 'tier']); }
  const nItems = Object.keys(st.joySnap?.items ?? {}).length;
  check(st.tier === 'plus' && nItems > 10 && st.joySnap.celebrate === true, `the app hands the extension its snapshot (tier ${st.tier}, ${nItems} Halo assignments, celebrations on)`);
  check(!/title|"name"/.test(JSON.stringify(st.joySnap)), 'the snapshot holds points and class codes only');

  // An open assignment, and what Halo+ should say after it: the class's points done plus this one, over its real total.
  const rows = (await db.from('items').select('data').eq('user_id', s.id)).data.map((r) => r.data);
  const courses = (await db.from('courses').select('data').eq('user_id', s.id)).data.map((r) => r.data);
  const turned = (i) => i.status === 'done' || !!i.halo?.submittedAt || i.score !== null;
  const open = rows.find((i) => i.source === 'halo' && i.points > 0 && !turned(i) && i.haloId);
  const sameClass = rows.filter((i) => i.courseId === open.courseId && i.source === 'halo' && i.points > 0);
  const total = sameClass.reduce((a, i) => a + i.points, 0);
  const done = sameClass.filter(turned).reduce((a, i) => a + i.points, 0);
  const code = courses.find((c) => c.id === open.courseId).code;
  const expected = `+${open.points} pts · ${code} now ${Math.floor(((done + open.points) / total) * 100)}% done`;

  const halo = await ectx.newPage();
  const cardText = () => halo.evaluate(() => document.getElementById('haloplus-joy')?.shadowRoot?.querySelector('.card')?.textContent?.replace('×', '').trim() ?? null);
  const pieces = () => halo.evaluate(() => document.getElementById('haloplus-joy')?.shadowRoot?.querySelectorAll('.c').length ?? 0);
  const glow = () => halo.evaluate(() => !!document.getElementById('haloplus-joy')?.shadowRoot?.querySelector('.glow'));
  const reset = () => halo.evaluate(() => document.getElementById('haloplus-joy')?.remove());
  const submit = async (id, { kind = 'assignment', text = 'Assignment has been submitted.', type = 'success', modal = true } = {}) => {
    await reset();
    if (modal) {
      await halo.evaluate(([k, i]) => window.halo.open(k, i), [kind, id]);
      await sleep(1600);
      await halo.evaluate(() => window.halo.close());
    }
    await sleep(120);
    await halo.evaluate(([t, ty]) => window.halo.toast(t, ty), [text, type]);
    await sleep(500);
  };
  await halo.goto('https://halo.gcu.edu/courses/chm-113l/classroom', { waitUntil: 'load' });
  await sleep(800);

  // The moment, light and dark.
  for (const scheme of ['light', 'dark']) {
    await halo.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
    const tabsBefore = ectx.pages().length;
    const calls = gateway.n;
    await submit(open.haloId);
    const text = await cardText();
    const n = await pieces();
    await sleep(250);
    await halo.screenshot({ path: `${OUT}/p6-halo-confetti-desk-${scheme}.png` });
    check(text === expected && n > 40, `${scheme}: Halo confirms the submission → gold confetti (${n} pieces) and "${text}" (expected "${expected}")`);
    await sleep(9000);
    check(gateway.n > calls, `${scheme}: a sync runs so Halo+ updates (Halo calls ${calls} → ${gateway.n})`);
    check(ectx.pages().length === tabsBefore, `${scheme}: the sync opens no tab and brings nothing forward (${ectx.pages().length} tabs)`);
    await worker.evaluate(() => chrome.storage.local.set({ running: false }));
    await sleep(2500);
  }
  await halo.emulateMedia({ colorScheme: 'light' });

  // No moment for a failed submission, or for an ordinary discussion reply (same toast, no submit modal).
  await submit(open.haloId, { text: 'Failed to submit Assignment.', type: 'error' });
  check((await cardText()) === null, 'a failed submission ("Failed to submit Assignment.") gets nothing');
  await sleep(8200);
  await submit(null, { kind: 'dq', text: 'Discussion post has been submitted', modal: false });
  check((await cardText()) === null, 'a plain discussion reply gets nothing');
  // A discussion question response (its submit modal) does.
  const dq = rows.find((i) => i.source === 'halo' && i.points > 0 && !turned(i) && i.haloId && i.haloId !== open.haloId);
  await sleep(8200);
  await submit(dq.haloId, { kind: 'dq', text: 'Discussion post has been submitted' });
  check(/^\+\d+ pts · .+ now \d+% done$/.test((await cardText()) ?? ''), `a DQ response gets the moment ("${await cardText()}")`);
  // A quiz, on its own page.
  await sleep(8200);
  await halo.goto(`https://halo.gcu.edu/quiz/${encodeURIComponent(dq.haloId)}?slugId=chm-113l`, { waitUntil: 'load' });
  await sleep(1200);
  await submit(null, { text: 'Quiz successfully submitted<br />See Gradebook for more details', modal: false });
  check(/^\+\d+ pts · .+ now \d+% done$/.test((await cardText()) ?? ''), `a quiz gets the moment ("${await cardText()}")`);
  // Something Halo+ does not know (not synced yet): still a moment, honestly worded.
  await sleep(8200);
  await halo.goto('https://halo.gcu.edu/courses/chm-113l/classroom', { waitUntil: 'load' });
  await sleep(800);
  await submit('not-synced-yet');
  check((await cardText()) === 'Turned in. Halo+ is syncing it now.', `an assignment Halo+ has not synced yet: "${await cardText()}"`);

  // Reduced motion: a soft glow, no falling pieces.
  await sleep(8200);
  await halo.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await submit(open.haloId);
  check((await glow()) && (await pieces()) === 0 && (await cardText()) === expected, 'reduced motion: a glow instead of confetti, same card');
  await halo.screenshot({ path: `${OUT}/p6-halo-reduced-motion.png` });
  await halo.emulateMedia({ reducedMotion: 'no-preference' });

  // Celebrations off (You → Display, in the app): no confetti, no card; the sync still runs.
  await dash.bringToFront();
  await dash.goto('https://haloplus.app/#/you?s=display', { waitUntil: 'load' });
  await dash.waitForSelector('text=Celebrations', { timeout: 20000 });
  await dash.locator('label:has-text("Celebrations") input[type=checkbox]').uncheck();
  for (let i = 0; i < 15; i++) { await sleep(1000); st = await store(['joySnap']); if (st.joySnap?.celebrate === false) break; }
  check(st.joySnap?.celebrate === false, 'turning Celebrations off reaches the extension');
  await halo.bringToFront();
  await sleep(8200);
  const callsOff = gateway.n;
  await submit(open.haloId);
  check((await cardText()) === null && (await pieces()) === 0, 'Celebrations off: no confetti and no card on Halo');
  await sleep(9000);
  check(gateway.n > callsOff, `Celebrations off: the sync still runs (Halo calls ${callsOff} → ${gateway.n})`);
  await worker.evaluate(() => chrome.storage.local.set({ running: false }));
  await dash.bringToFront();
  await dash.locator('label:has-text("Celebrations") input[type=checkbox]').check();
  await halo.bringToFront();

  // Free: nothing (no sync to update).
  await worker.evaluate(() => chrome.storage.local.set({ tier: 'free' }));
  await sleep(8200);
  const callsFree = gateway.n;
  await submit(open.haloId);
  await sleep(6000);
  check((await cardText()) === null && gateway.n === callsFree, 'Free: no moment and no sync');
  // Max gets it too.
  await worker.evaluate(() => chrome.storage.local.set({ tier: 'max' }));
  await sleep(3000);
  await submit(open.haloId);
  check((await cardText()) !== null, 'Max: the moment shows');

  // The extension asks for nothing new.
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  check(manifest.version === '0.5.0' && JSON.stringify(manifest.permissions) === JSON.stringify(['alarms', 'storage', 'unlimitedStorage', 'scripting', 'tabs']), `manifest ${manifest.version}, permissions unchanged`);
} finally {
  await ectx.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
