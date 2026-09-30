// The red warning on Classes and the DQ that used to be duplicated (2026-09-30), on the real backend with a throwaway
// account, desk and phone, light and dark. The account holds Halo's "Topic 3 DQ 1" and a copy an announcement made
// ("DQ 3.1 initial post", another date, ticked), plus lab parts due within three days (a waiver before the lab).
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-urgent-dq.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/urgent-dq';
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const DAY = 86_400_000;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const made = [];
const due = (n, hhmm = '23:59') => `${new Date(Date.now() - 7 * 3_600_000 + n * DAY).toISOString().slice(0, 10)}T${hhmm}:00-07:00`;
const src = { kind: 'announcement', id: 'post-w3', title: 'Week 3', quote: 'Bring your signed waiver to lab.', at: new Date(Date.now() - DAY).toISOString() };
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');

const seed = async () => {
  const email = `e2e-urgent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const now = new Date().toISOString();
  const ids = { eng: randomUUID(), lab: randomUUID(), chm: randomUUID() };
  const course = (id, code, name, color, halo, slug, meetings, online) => ({ id, code, name, color, credits: 3, instructors: [{ name: 'Dr. Example', email: '' }], meetings, meetingsFrom: meetings.length ? 'section' : null, online, haloClassId: halo, haloSlugId: slug, termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: now });
  const courses = [course(ids.chm, 'CHM-113', 'General Chemistry I-Lecture', '#D95D39', 'hc-chm', 'CHM-113-WF700A-20260908', [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }], false), course(ids.lab, 'CHM-113L', 'General Chemistry I-Lab', '#2F6FDB', 'hc-lab', 'CHM-113L-M600A-20260908', [{ day: 1, start: '18:00', end: '20:50' }], false), course(ids.eng, 'ENG-105', 'English Composition I', '#1F9E89', 'hc-eng', 'ENG-105-ONL4-20260914', [], true)];
  const item = (o) => ({ id: randomUUID(), labelOverridden: false, opensAt: null, estimatedMinutes: 60, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'halo', award: null, updatedAt: now, ...o, label: o.label ?? o.title });
  const req = (o) => ({ id: randomUUID(), dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: now, ...o });
  const dqHalo = item({ courseId: ids.eng, title: 'Topic 3 DQ 1', type: 'discussion', points: 10, dueAt: due(2), haloId: 'halo-dq31' });
  const dqCopy = item({ courseId: ids.eng, title: 'DQ 3.1 initial post', type: 'discussion', points: 10, dueAt: due(3), status: 'done', completedAt: now, origin: { ...src, quote: 'Post your DQ 3.1 initial response by Thursday.' }, requirements: [req({ text: 'Cite the Topic 3 reading', done: true, doneAt: now })] });
  const labItem = item({ courseId: ids.lab, title: 'Stoichiometry Lab', type: 'lab', points: 30, dueAt: due(2, '18:00'), haloId: 'halo-stoich', requirements: [req({ text: "Sign the Lab Safety Waiver before Thursday's lab", dueAt: due(2, '18:00') }), req({ text: 'Bring goggles and a calculator', dueAt: due(2, '18:00') }), req({ text: 'Read the lab guide', gradedOn: false })] });
  const hw = item({ courseId: ids.chm, title: 'Topic 5 Homework', type: 'homework', points: 20, dueAt: due(5), haloId: 'halo-hw5', requirements: [req({ text: 'Show your work on problems 3 to 7', done: true, doneAt: now })] });
  await admin.from('courses').insert(courses.map((x) => ({ id: x.id, user_id: data.user.id, data: x, updated_at: now })));
  await admin.from('items').insert([dqHalo, dqCopy, labItem, hw].map((x) => ({ id: x.id, user_id: data.user.id, data: x, updated_at: now })));
  const settings = { timezone: 'America/Phoenix', lastPull: { at: now, source: 'bookmarklet' }, onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' } };
  await admin.from('settings').upsert({ user_id: data.user.id, updated_at: now, data: settings });
  return { u: { id: data.user.id, session: s.session }, settings, ids, dqHalo, dqCopy, labItem };
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const acct = await seed();
  for (const [name, device] of [['desk', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    for (const scheme of ['light', 'dark']) {
      const dir = `${OUT}/${name}-${scheme}`;
      mkdirSync(dir, { recursive: true });
      const main = name === 'desk' && scheme === 'light';
      const say = (ok, line) => (main ? check(ok, line) : ok || console.log(`note ${name}-${scheme}: ${line}`));
      const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
      await ctx.addInitScript(({ s, key, settings }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: acct.u.session, key: `sb-${ref}-auth-token`, settings: acct.settings });
      const page = await ctx.newPage();
      await page.goto(`${BASE}#/classes`, { waitUntil: 'load' });
      await page.waitForTimeout(5000);
      await page.click('.upgrade button:has-text("Skip")', { timeout: 1000 }).catch(() => undefined);
      await page.screenshot({ path: `${dir}/1-classes.png`, fullPage: name === 'phone' });
      const warn = await page.$$eval('.class-urgent', (els) => els.map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), card: e.closest('.class-card-wrap')?.querySelector('.class-card-head')?.innerText.trim().split(/\s/)[0] })));
      say(warn.length === 1 && warn[0].card === 'CHM-113L' && /^Don't forget: Sign the Lab Safety Waiver before Thursday's lab \+1 more$/.test(warn[0].text), `one warning, on the lab's card: ${JSON.stringify(warn)}`);
      const look = await page.$eval('.class-urgent', (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { size: parseFloat(s.fontSize), h: Math.round(r.height), clip: e.querySelector('.class-urgent-line').scrollWidth > e.querySelector('.class-urgent-line').clientWidth + 1 ? 'ellipsis' : 'fits' }; }).catch(() => null);
      say(!!look && look.size <= 12 && look.h <= 30, `small and one line: ${JSON.stringify(look)}`);
      // Tapping it opens the lab with the requirement.
      await page.click('.class-urgent');
      await page.waitForTimeout(900);
      const sheet = await text(page, '.modal');
      await page.screenshot({ path: `${dir}/2-warning-opens-item.png` });
      say(/Stoichiometry/.test(sheet) && /Lab Safety Waiver/.test(sheet), 'tapping it opens the lab with the waiver line');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      // The DQ: one row, Halo's date, the copy's instruction and ticks now requirements on it.
      await page.goto(`${BASE}#/class?c=${acct.ids.eng}`, { waitUntil: 'load' });
      await page.waitForTimeout(3500);
      const rows = await page.$$eval('.item-row, .row, li', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /DQ/.test(t) && t.length < 300));
      const dqRows = [...new Set(rows.filter((t) => /Topic 3 DQ 1|DQ 3\.1/.test(t)))];
      await page.screenshot({ path: `${dir}/3-dq-class.png`, fullPage: name === 'phone' });
      await page.click('text=Topic 3 DQ 1', { timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(900);
      const dqSheet = await text(page, '.modal');
      await page.screenshot({ path: `${dir}/4-dq-item.png` });
      say(/DQ 3\.1 initial post/.test(dqSheet) && /Cite the Topic 3 reading/.test(dqSheet), `the DQ carries the folded copy's lines: "${dqSheet.slice(0, 160)}"`);
      say(dqRows.length >= 1 && !dqRows.some((t) => /DQ 3\.1 initial post/.test(t) && !/Topic 3 DQ 1/.test(t)), `the class shows the DQ once: ${JSON.stringify(dqRows.slice(0, 3))}`);
      await ctx.close();
    }
  }
  const cloud = (await admin.from('items').select('data, deleted_at').eq('user_id', acct.u.id)).data ?? [];
  const copyRow = cloud.find((r) => r.data.id === acct.dqCopy.id);
  const haloRow = cloud.find((r) => r.data.id === acct.dqHalo.id);
  check(!!copyRow?.deleted_at && !haloRow?.deleted_at && haloRow.data.dueAt === acct.dqHalo.dueAt, 'in the account: the copy is removed, Halo\'s DQ kept with its own date');
  check((haloRow?.data.requirements ?? []).filter((r) => r.done).length === 2, `the ticks came with it: ${JSON.stringify((haloRow?.data.requirements ?? []).map((r) => [r.text, r.done]))}`);
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'announcements', 'read_ledger', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
