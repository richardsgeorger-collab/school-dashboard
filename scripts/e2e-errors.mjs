// Error monitoring, end to end on the real backend (2026-09-30). Throwaway accounts only. Forces each kind of failure
// through the real app build: an app crash, a failed AI call, a sync with missing classes, a stuck checkout (and the
// extension's failed sync in e2e-extension ONLY=broken), then checks, as a throwaway admin, that each is an issue on
// the Admin page's Errors with a sample, that an alert was tried for each (email via Resend when RESEND_API_KEY is set,
// push to admin devices), that nothing personal was stored, and that one device cannot flood the table.
// Removes its accounts and the issues it created.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-errors.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/errors';
mkdirSync(OUT, { recursive: true });
const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const REPORT = `${env.VITE_SUPABASE_URL}/functions/v1/report`;
const made = [];
const devices = new Set();
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const user = async (tag, patch = {}) => {
  const email = `e2e-err-${tag}-${Date.now()}@example.invalid`;
  const { data } = await db.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  if (Object.keys(patch).length) await db.from('profiles').update(patch).eq('user_id', data.user.id);
  const { data: link } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, email, c, session: s.session };
};
const settings = (extra = {}) => ({ timezone: 'America/Phoenix', onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, maxOnboarding: { startedAt: 'x', step: 'done', doneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' }, updatedAt: new Date().toISOString(), ...extra });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (u, data = { courses: [], items: [], settings: settings() }, hash = '#/now') => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(({ s, key, data }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify(data)); localStorage.setItem('school-dashboard:accounts-seen', JSON.stringify([s.user.id])); }, { s: u.session, key: `sb-${ref}-auth-token`, data });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const dev = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:device-id') ?? 'null'));
  return { ctx, page, dev: () => page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:device-id') ?? 'null')).then((d) => { if (d) devices.add(d); return d; }), first: dev };
};
const eventsFor = async (title) => (await db.from('error_events').select('*').ilike('title', `%${title}%`).gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString())).data ?? [];
const waitFor = async (title, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { const e = await eventsFor(title); if (e.length) return e; await new Promise((r) => setTimeout(r, 1000)); } return []; };
const tag = `e2e${Date.now().toString(36)}`;

try {
  const student = await user('student');
  const free = await user('free', { trial_started_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), trial_ends_at: new Date(Date.now() - 13 * 86_400_000).toISOString() });
  const boss = await user('admin');
  await db.from('profiles').update({ is_admin: true }).eq('user_id', boss.id);

  // 1. The app crashes.
  {
    const { ctx, page, dev } = await open(student);
    await page.evaluate((t) => setTimeout(() => { throw new Error(`Forced crash ${t} for jane@example.com`); }, 0), tag);
    const ev = await waitFor(`Forced crash ${tag}`);
    await dev();
    check(ev.length === 1 && ev[0].kind === 'crash' && !!ev[0].stack && ev[0].app_version && ev[0].browser && ev[0].anon_id && !/jane@/.test(ev[0].message + ev[0].title), `app crash recorded: "${ev[0]?.title}", app ${ev[0]?.app_version}, ${ev[0]?.browser}, plan ${ev[0]?.plan}, anon ${ev[0]?.anon_id?.slice(0, 6)}…, email scrubbed`);
    await ctx.close();
  }

  // 2. An AI call fails on the server.
  {
    const { ctx, page, dev } = await open(student, undefined, '#/ask');
    await ctx.route('**/functions/v1/ai', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 'upstream', message: `Forced AI failure ${tag}` } }) }));
    await page.fill('input[aria-label="Your question"]', 'What is due this week?');
    await page.click('form button[type=submit]');
    const ev = await waitFor('AI failed (500)');
    await dev();
    check(ev.some((e) => e.kind === 'function' && e.status === 500 && e.place === 'ai'), `failed AI call recorded: "${ev[0]?.title}" (status ${ev[0]?.status}, ${JSON.stringify(ev[0]?.details)})`);
    await ctx.close();
  }

  // 3. A sync comes back with fewer classes than the last one.
  {
    const now = new Date().toISOString();
    const courses = ['A', 'B', 'C'].map((k, i) => ({ id: `c-${k}`, code: `TST-10${i}`, name: `Test ${k}`, color: '#888888', credits: 3, instructors: [], meetings: [], online: true, haloClassId: `h-${k}`, updatedAt: now }));
    const items = courses.map((c, i) => ({ id: `i-${i}`, courseId: c.id, title: `Work ${i}`, label: `Work ${i}`, type: 'homework', points: 10, dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), estimatedMinutes: 30, status: 'todo', source: 'halo', haloId: `ha-${i}`, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, notes: '', updatedAt: now }));
    const { ctx, page, dev } = await open(student, { courses, items, settings: settings({ lastPull: { at: now, build: null, counts: { classes: 3, assessments: 3 } } }) });
    const build = await page.evaluate(async () => ((await (await fetch('halo-sync.js')).text()).match(/build (\S+)\./) ?? [])[1] ?? null);
    const payload = { kind: 'halo-export', version: 1, build, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'], classes: courses.slice(0, 2).map((c, i) => ({ id: c.haloClassId, slugId: `${c.code}-X`, classCode: `${c.code}-X`, courseCode: c.code, name: c.name, instructors: [], stage: 'CURRENT', modality: 'ONLINE', credits: 3, assessments: [{ id: `ha-${i}`, title: `Work ${i}`, dueDate: items[i].dueAt, points: 10, type: 'ASSIGNMENT', status: null, score: null, description: '' }], announcements: [], resources: [], discussions: [], messages: [] })) };
    await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
    const ev = await waitFor('fewer classes than the last one');
    await dev();
    const mine = ev.filter((e) => devices.has(e.device_id));
    check(mine.some((e) => e.kind === 'silent' && e.details?.before === 3 && e.details?.after === 2), `sync with missing classes recorded: "${mine[0]?.title}" ${JSON.stringify(mine[0]?.details)}`);
    await ctx.close();
  }

  // 4. Checkout came back successful, and 5 minutes later the plan is still Free.
  {
    const { ctx, page, dev } = await open(free, undefined, '#/now');
    await page.evaluate(() => localStorage.setItem('school-dashboard:checkout-watch', JSON.stringify({ tier: 'plus', startedAt: new Date(Date.now() - 9 * 60_000).toISOString(), returnedAt: new Date(Date.now() - 6 * 60_000).toISOString() })));
    await page.reload({ waitUntil: 'load' });
    const ev = await waitFor('Checkout finished but the plan did not change');
    await dev();
    const mine = ev.filter((e) => devices.has(e.device_id));
    check(mine.some((e) => e.kind === 'silent' && e.details?.bought === 'plus' && e.plan === 'free'), `stuck checkout recorded: "${mine[0]?.title}" ${JSON.stringify(mine[0]?.details)}`);
    await ctx.close();
  }

  // 5. One device cannot flood the table.
  {
    const dev = `flood-${tag}`;
    devices.add(dev);
    let dropped = 0;
    for (let i = 0; i < 34; i++) {
      const r = await (await fetch(REPORT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'crash', title: `Flood ${tag}`, device_id: dev, app_version: 'e2e' }) })).json();
      if (r.dropped) dropped++;
    }
    const { count } = await db.from('error_events').select('id', { count: 'exact', head: true }).eq('device_id', dev);
    check(count === 30 && dropped === 4, `a device sending 34 in a row: ${count} stored, ${dropped} dropped`);
  }

  // 6. The Admin page, as an admin: every one of them grouped, with a sample, and the alerts that went out.
  {
    const titles = [`Forced crash ${tag}`, 'AI failed (500)', 'fewer classes than the last one', 'Checkout finished but the plan did not change', `Flood ${tag}`];
    const { ctx, page } = await open(boss, undefined, '#/admin');
    await page.waitForSelector('.admin-errors', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const rows = await page.$$eval('.err-title', (els) => els.map((e) => e.textContent));
    for (const t of titles) check(rows.some((r) => r.toLowerCase().includes(t.toLowerCase())), `on the Admin page: "${rows.find((r) => r.toLowerCase().includes(t.toLowerCase())) ?? t}"`);
    const i = rows.findIndex((r) => r.includes(`Forced crash ${tag}`));
    await page.locator('.err-row').nth(i).click();
    await page.waitForTimeout(2500);
    const detail = await page.$eval('.err-detail', (e) => e.innerText).catch(() => '');
    check(/Stack/.test(detail) && /app /.test(detail), 'opening one shows the sample with its stack and context');
    await page.locator('.admin-errors').screenshot({ path: `${OUT}/admin-errors.png` });
    // Alerts: one per new issue, and never more than one an hour for the same one.
    const { data: issues } = await db.from('error_issues').select('fingerprint, title, count').or(titles.map((t) => `title.ilike.%${t.replace(/[(),]/g, '_')}%`).join(','));
    const fps = (issues ?? []).map((x) => x.fingerprint);
    const { data: alerts } = await db.from('error_alerts').select('fingerprint, reason, channel, ok, detail, subject').in('fingerprint', fps);
    for (const x of issues ?? []) {
      const a = (alerts ?? []).filter((y) => y.fingerprint === x.fingerprint);
      const email = a.find((y) => y.channel === 'email');
      check(!!email, `alert for "${x.title}" (${x.count}×): "${email?.subject}" → email ${email?.ok ? 'sent' : `not sent (${email?.detail})`}${a.find((y) => y.channel === 'push') ? `, push ${a.find((y) => y.channel === 'push').detail}` : ''}`);
    }
    const flood = (issues ?? []).find((x) => x.title.includes('Flood'));
    check((alerts ?? []).filter((y) => y.fingerprint === flood?.fingerprint && y.channel === 'email').length === 1, 'the flood (30 in a minute) sent one alert, not thirty');
    // Resolve, and it stays resolved on the same build; the same problem on another build reopens it.
    await db.rpc('admin_resolve_error', { fp: flood.fingerprint, resolved: true }).then(() => undefined);
    const bossRpc = boss.c;
    await bossRpc.rpc('admin_resolve_error', { fp: flood.fingerprint, resolved: true });
    await fetch(REPORT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'crash', title: `Flood ${tag}`, device_id: `other-${tag}`, app_version: 'e2e-next' }) });
    devices.add(`other-${tag}`);
    const { data: again } = await db.from('error_issues').select('resolved_at, reopened_at').eq('fingerprint', flood.fingerprint).single();
    check(!again.resolved_at && !!again.reopened_at, 'resolved, then the same problem on a new deploy: reopened');
    // Nothing personal stored anywhere in these events.
    const { data: evs } = await db.from('error_events').select('title, message, stack, details').in('fingerprint', fps);
    const blob = JSON.stringify(evs);
    check(!/@example\.(com|invalid)|eyJ|sk_live/.test(blob), `no emails or tokens in ${evs.length} stored events`);
    await ctx.close();
    globalThis.cleanupFps = fps;
  }
} finally {
  await browser.close();
  const fps = globalThis.cleanupFps ?? [];
  if (fps.length) {
    await db.from('error_events').delete().in('fingerprint', fps);
    await db.from('error_alerts').delete().in('fingerprint', fps);
    await db.from('error_issues').delete().in('fingerprint', fps);
  }
  for (const d of devices) await db.from('error_events').delete().eq('device_id', d);
  for (const id of made) await db.auth.admin.deleteUser(id);
  console.log(`removed ${made.length} throwaways and ${fps.length} test issues`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
