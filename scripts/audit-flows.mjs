// The audit's targeted flows (2026-09-30): what the crawler cannot do by clicking. Signed-out pages with empty,
// wrong and very long input; the sync review and the peek, a sync that breaks mid-way; offline and a slow network;
// double clicks on the buttons that write. Screenshots and what each screen said go to docs/screens/audit/flows/,
// every console error and app error report is a finding. Same safety as audit-crawl.mjs.
//   KEYS_ENV=... [ONLY=signedout,review,offline,slow,double,input] node scripts/audit-flows.mjs
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const ONLY = process.env.ONLY?.split(',');
const OUT = 'docs/screens/audit/flows';
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/findings.jsonl`, '');
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
let n = 0;
const note = async (page, flow, what, detail = '', bug = false) => {
  n++;
  const shot = `${OUT}/${String(n).padStart(3, '0')}-${flow}.png`;
  if (page) await page.screenshot({ path: shot }).catch(() => undefined);
  appendFileSync(`${OUT}/findings.jsonl`, `${JSON.stringify({ flow, what, detail, bug, shot })}\n`);
  console.log(`${bug ? 'FIND' : 'see '} [${flow}] ${what}${detail ? ` :: ${String(detail).slice(0, 220)}` : ''}`);
};
const aiStub = { response: { content: [{ type: 'text', text: 'Stub answer.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, model: 'claude-haiku-4-5' }, meter: { tier: 'max', monthCostUsd: 0, ceilingUsd: 4, ceilingUsed: 0, messagesToday: 0, messagesCap: 30, lecturesThisWeek: 0, lecturesCap: 10 } };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const kit = personaKit(env);
const open = async (p, hash = '#/now', device = { viewport: { width: 1280, height: 850 } }) => {
  const ctx = await browser.newContext({ ...device, reducedMotion: 'reduce' });
  if (p) await ctx.addInitScript(({ s, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, { s: p.session, key: `sb-${ref}-auth-token` });
  const errors = [];
  await ctx.route('**/functions/v1/report', async (r) => { try { const b = JSON.parse(r.request().postData() || '{}'); errors.push(`reported ${b.kind}: ${b.title}`); } catch { /* */ } return r.fulfill({ status: 200, body: '{}', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route('**/functions/v1/ai', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(aiStub) }));
  await ctx.route(/\/functions\/v1\/stripe-(checkout|portal)/, (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"url":"https://checkout.stripe.com/audit-stop"}' }));
  await ctx.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe (stopped)</h1>' }));
  await ctx.route(/\/auth\/v1\/(recover|otp|magiclink)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon|status of 40[0134]|net::ERR_|DevTools/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('.tour-tip button:has-text("Skip")', { timeout: 400 }).catch(() => undefined);
  return { ctx, page, errors, flush: async (flow, what) => { if (errors.length) await note(page, flow, `errors during ${what}`, errors.splice(0).join(' | '), true); } };
};
const text = (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const run = (name) => !ONLY || ONLY.includes(name);

try {
  // ---- Signed out: landing, log in, sign up, forgot password ----
  if (run('signedout')) {
    const { ctx, page, flush } = await open(null, '#/home');
    await note(page, 'signedout', 'landing');
    await flush('signedout', 'landing');
    await page.goto(`${BASE}#/login`); await page.waitForTimeout(1500);
    await note(page, 'signedout', 'log in', await text(page, 'form.signin'));
    const submit = page.locator('form.signin button[type=submit]');
    await note(page, 'signedout', 'log in, empty: submit disabled?', String(await submit.isDisabled()));
    await page.fill('form.signin input[type=email]', 'not-an-email');
    await page.fill('form.signin input[name=password]', 'x');
    await submit.click(); await page.waitForTimeout(2500);
    await note(page, 'signedout', 'log in with a bad email', await text(page, 'form.signin'));
    await page.fill('form.signin input[type=email]', `nobody-${Date.now()}@example.invalid`);
    await page.fill('form.signin input[name=password]', 'wrong-password-123');
    await submit.click(); await page.waitForTimeout(3000);
    await note(page, 'signedout', 'log in, wrong password', await text(page, 'form.signin'));
    await page.fill('form.signin input[type=email]', `${'a'.repeat(300)}@example.invalid`);
    await page.fill('form.signin input[name=password]', 'p'.repeat(500));
    await submit.click(); await page.waitForTimeout(3000);
    await note(page, 'signedout', 'log in, 300-char email and 500-char password', await text(page, 'form.signin'));
    // Sign up.
    await page.click('button:has-text("Sign up"), button:has-text("Create an account"), button:has-text("create one")').catch(() => undefined);
    await page.waitForTimeout(800);
    await page.fill('form.signin input[type=email]', `e2e-audit-signup-${Date.now()}@example.invalid`);
    await page.fill('form.signin input[name=password]', 'short');
    await page.locator('form.signin button[type=submit]').click(); await page.waitForTimeout(2500);
    await note(page, 'signedout', 'sign up with a 5-character password', await text(page, 'form.signin'));
    // Forgot password.
    await page.goto(`${BASE}#/login`); await page.waitForTimeout(1200);
    await page.click('button:has-text("Forgot")').catch(() => undefined);
    await page.waitForTimeout(800);
    await note(page, 'signedout', 'forgot password', await text(page, 'form.signin'));
    await page.fill('form.signin input[type=email]', 'bad@@example');
    await page.locator('form.signin button[type=submit]').click().catch(() => undefined); await page.waitForTimeout(2000);
    await note(page, 'signedout', 'forgot password, a malformed email', await text(page, 'form.signin'));
    await page.fill('form.signin input[type=email]', `someone-${Date.now()}@example.invalid`);
    await page.locator('form.signin button[type=submit]').click().catch(() => undefined); await page.waitForTimeout(2500);
    await note(page, 'signedout', 'forgot password, a good email (email blocked by the audit)', await text(page, 'form.signin'));
    // Every signed-out route a stranger might land on.
    for (const r of ['#/now', '#/you', '#/study', '#/admin', '#/start', '#/nonsense-route']) {
      await page.goto(`${BASE}${r}`); await page.waitForTimeout(1800);
      await note(page, 'signedout', `signed out, opening ${r}`, (await text(page, 'body')).slice(0, 160));
    }
    await flush('signedout', 'signed-out pages');
    await ctx.close();
  }

  // ---- The sync review, the peek, and a sync that breaks mid-way ----
  if (run('review')) {
    const synced = await kit.persona('synced');
    const { ctx, page, flush } = await open(synced);
    const build = await page.evaluate(async () => ((await (await fetch('halo-sync.js')).text()).match(/build (\S+)\./) ?? [])[1] ?? null);
    const cls = (id, code, as) => ({ id, slugId: `${code}-X`, classCode: `${code}-X`, courseCode: code, name: code, instructors: ['Dr. X'], stage: 'CURRENT', modality: 'ONLINE', credits: 3, assessments: as, announcements: [], resources: [], discussions: [], messages: [] });
    const day = (d) => new Date(Date.now() + d * 86_400_000).toISOString();
    const send = (p) => page.evaluate((x) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: x, source: window })), p);
    const payload = { kind: 'halo-export', version: 1, build, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'], classes: [cls('aud-BIO-181', 'BIO-181', [{ id: 'aud-new-1', title: 'Topic 5 Homework: Evolution', dueDate: day(10), points: 20, type: 'ASSIGNMENT', status: null, score: null, description: '' }])] };
    await send(payload);
    await page.waitForTimeout(2500);
    await note(page, 'review', 'the sync review opened', await text(page, '.modal'));
    // Every button in it, twice where it writes.
    const buttons = await page.$$eval('.modal button', (b) => b.map((x) => x.innerText.trim()).filter(Boolean));
    await note(page, 'review', 'buttons in the review', buttons.join(' | '));
    const apply = page.locator('.modal button:has-text("Apply")').first();
    if (await apply.count()) {
      await apply.dblclick().catch(() => undefined);
      await page.waitForTimeout(2500);
      const count = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1') ?? '{}').items?.filter((i) => /Evolution/.test(i.title)).length ?? 0);
      await note(page, 'review', 'double-clicking Apply', `copies of the new assignment: ${count}`, count > 1);
    }
    await flush('review', 'the review');
    // A sync that breaks: classes with missing fields, and one with garbage in it.
    await send({ ...payload, exportedAt: new Date().toISOString(), classes: [{ id: 'aud-MAT-250' }, null, { ...cls('aud-PSY-102', 'PSY-102', [{ id: 'z', title: null, dueDate: 'not a date', points: 'ten' }]) }] });
    await page.waitForTimeout(2500);
    await note(page, 'review', 'a malformed sync', (await text(page, '.modal, .halo-banner, .app-failed')).slice(0, 300), !!(await page.$('.app-failed')));
    await flush('review', 'a malformed sync');
    await page.keyboard.press('Escape');
    // An empty sync (Halo showed nothing).
    await send({ ...payload, exportedAt: new Date().toISOString(), classes: [] });
    await page.waitForTimeout(2500);
    await note(page, 'review', 'an empty sync', (await text(page, '.modal, .halo-banner, .done-toast')).slice(0, 300));
    await flush('review', 'an empty sync');
    await ctx.close();
    // The peek, on Free after the trial.
    const ended = await kit.persona('ended');
    const e = await open(ended);
    await e.page.click('.trial-ended button:has-text("Stay on Free")', { timeout: 3000 }).catch(() => undefined);
    await e.page.waitForTimeout(800);
    await e.page.evaluate((x) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: x, source: window })), { ...payload, exportedAt: new Date().toISOString() });
    await e.page.waitForTimeout(2500);
    await note(e.page, 'review', 'the peek on Free', await text(e.page, '.modal'));
    for (const label of ['Bring it all in', 'Get Max', 'Invite a friend']) {
      const b = e.page.locator(`.modal button:has-text("${label}")`).first();
      if (!(await b.count())) { await note(e.page, 'review', `peek: no "${label}" button`, '', true); continue; }
      await b.click().catch(() => undefined);
      await e.page.waitForTimeout(1500);
      await note(e.page, 'review', `peek: "${label}"`, `${e.page.url().slice(0, 80)} ${(await text(e.page, '.modal')).slice(0, 120)}`);
      if (!e.page.url().startsWith(BASE.replace(/\/[^/]*\/$/, ''))) await e.page.goBack().catch(() => undefined);
    }
    await e.flush('review', 'the peek');
    await e.ctx.close();
  }

  // ---- Offline and a slow network ----
  if (run('offline')) {
    const p = await kit.persona('synced');
    const { ctx, page, flush } = await open(p);
    await page.waitForTimeout(7000);
    await ctx.setOffline(true);
    await page.locator('.hero button:has-text("✓"), .hero [aria-label*="done" i], .hero .btn:has(svg)').first().click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    await note(page, 'offline', 'marking the top item done while offline', (await text(page, '.done-toast, .now-head')).slice(0, 160));
    // In the app, as a student would (a full page load offline is the browser's own error page).
    await page.evaluate(() => { location.hash = '#/ask'; }); await page.waitForTimeout(2500);
    await note(page, 'offline', 'opening Ask offline', (await text(page, 'main, body')).slice(0, 200), !(await text(page, 'body')));
    await page.fill('input[aria-label="Your question"]', 'What is due?').catch(() => undefined);
    await page.click('form button[type=submit]').catch(() => undefined);
    await page.waitForTimeout(3000);
    await note(page, 'offline', 'asking a question offline', (await text(page, 'main')).slice(-300));
    await page.evaluate(() => { location.hash = '#/now'; }); await page.waitForTimeout(1500);
    await page.click('[aria-label="Sync Halo"]').catch(() => undefined); await page.waitForTimeout(1000);
    await note(page, 'offline', 'opening Sync offline', (await text(page, '.modal')).slice(0, 200));
    await ctx.setOffline(false);
    await page.waitForTimeout(4000);
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:pending') ?? '[]').length);
    await note(page, 'offline', 'back online: changes waiting to go up', String(pending), pending > 0);
    await flush('offline', 'offline');
    await ctx.close();
  }
  if (run('slow')) {
    const p = await kit.persona('synced');
    const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await ctx0.addInitScript(({ s, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, { s: p.session, key: `sb-${ref}-auth-token` });
    await ctx0.route(/supabase\.co\/(rest|auth)\//, async (r) => { await new Promise((x) => setTimeout(x, 6000)); return r.continue(); });
    const page = await ctx0.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}#/now`);
    for (const t of [1500, 4000, 9000, 16000]) {
      await page.waitForTimeout(t === 1500 ? 1500 : t - [1500, 4000, 9000][[4000, 9000, 16000].indexOf(t)]);
      await note(page, 'slow', `6-second server, ${t / 1000}s after opening`, (await text(page, 'body')).slice(0, 180));
    }
    await page.click('.trial-chip, a[href="#/you"]').catch(() => undefined);
    await page.waitForTimeout(3000);
    await note(page, 'slow', 'clicking while it loads', (await text(page, 'main, body')).slice(0, 180), errs.length > 0);
    await ctx0.close();
  }

  // ---- Bad input and double clicks on the things that write ----
  if (run('input')) {
    const p = await kit.persona('synced');
    const { ctx, page, flush } = await open(p);
    await page.click('[aria-label^="Add someth"]').catch(() => undefined); await page.waitForTimeout(800);
    await note(page, 'input', 'the Add sheet', (await text(page, '.modal')).slice(0, 200));
    const field = page.locator('.modal input[type=text], .modal textarea, .modal input:not([type])').first();
    const go = page.locator('.modal button.primary, .modal button[type=submit]').first();
    await note(page, 'input', 'Add, empty: the button', `disabled=${await go.isDisabled().catch(() => 'n/a')}`);
    await field.fill('x'.repeat(600)).catch(() => undefined);
    await go.click().catch(() => undefined); await page.waitForTimeout(1500);
    await note(page, 'input', 'Add, 600 characters', (await text(page, '.modal')).slice(0, 300));
    await page.keyboard.press('Escape');
    await flush('input', 'the Add sheet');
    // Feedback, empty and long.
    await page.goto(`${BASE}#/you?s=feedback`); await page.waitForTimeout(2000);
    const fb = page.locator('main textarea').first();
    const send = page.locator('main button:has-text("Send")').first();
    await note(page, 'input', 'feedback, empty: Send', `disabled=${await send.isDisabled().catch(() => 'n/a')}`);
    await fb.fill('word '.repeat(2000)).catch(() => undefined);
    await send.dblclick().catch(() => undefined); await page.waitForTimeout(2500);
    const { count } = await kit.db.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', p.id);
    await note(page, 'input', 'feedback, 10,000 characters, double-clicked Send', `stored ${count} row(s)`, count > 1);
    await flush('input', 'feedback');
    // A class with no name.
    await page.goto(`${BASE}#/classes`); await page.waitForTimeout(2000);
    await page.click('button:has-text("Add class")').catch(() => undefined); await page.waitForTimeout(800);
    await note(page, 'input', 'Add class', (await text(page, '.modal')).slice(0, 200));
    const save = page.locator('.modal button.primary, .modal button[type=submit]').first();
    await save.click().catch(() => undefined); await page.waitForTimeout(1000);
    await note(page, 'input', 'Add class with nothing filled in', (await text(page, '.modal')).slice(0, 200));
    await page.keyboard.press('Escape');
    // A score typed as words.
    await page.goto(`${BASE}#/grades`); await page.waitForTimeout(2000);
    await page.click('button:has-text("Scores")').catch(() => undefined); await page.waitForTimeout(800);
    const score = page.locator('.score-input input, input[inputmode="decimal"]').first();
    await score.fill('ten').catch(() => undefined);
    await score.press('Enter').catch(() => undefined); await page.waitForTimeout(800);
    await note(page, 'input', 'a score typed as "ten"', (await text(page, 'main')).slice(0, 200));
    await flush('input', 'grades');
    // Ask, a 4,000-character question, sent twice fast.
    await page.goto(`${BASE}#/ask`); await page.waitForTimeout(2000);
    await page.fill('input[aria-label="Your question"]', 'why '.repeat(1000)).catch(() => undefined);
    await page.locator('form button[type=submit]').dblclick().catch(() => undefined); await page.waitForTimeout(2500);
    const answers = await page.$$eval('.chat-msg', (m) => m.length).catch(() => 0);
    await note(page, 'input', 'Ask: a 4,000-character question, double-clicked', `${answers} messages on screen`);
    await flush('input', 'Ask');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways; ${n} notes → ${OUT}/findings.jsonl`);
}
