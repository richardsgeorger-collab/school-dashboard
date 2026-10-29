// The end of the free week (2026-10-29, George: "make Max feel like it did a lot, using ONLY real numbers from that
// student's week and ONLY things that are Max"), on the real backend with throwaway students only:
// - a busy week, seeded the way the app and the server record it: requirements announcements added (things to bring,
//   new things to hand in, a hidden deadline), a generic line and a class rule that must not count, two moved due
//   dates, an assignment only an announcement announced, announcements read (read ledger), Halo synced on its own while
//   the student was away (sync runs in the extension's own tab; ones in the student's tab or failed must not count),
//   reminders and a Sunday preview sent (and a sync nudge that must not count), practice built, and checked-off work
//   that must never be counted;
// - a quiet week: a few syncs on their own and one reminder;
// - an empty week: nothing Max did.
// Checks: the headline from the real count; the three strongest catches with their class, then "+N more" that opens
// the rest; only Max lines, never a zero, never "checked off" or "on time"; the honest line on what stops on Free; the
// Apple Pay, Google Pay and card marks under the button (official artwork, the same height, apart), no gray line about
// Stripe; "Stay on Free" a real button that closes it. Screens: desktop and phone, light and dark, busy and quiet.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-trial-end.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/trial-end';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/frames`, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const ago = (d, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();
const DEVICES = { desk: { viewport: { width: 1280, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

/** The persona's items and courses, and a way to change one item's data. */
async function rowsOf(s) {
  const { data: rows } = await db.from('items').select('id, data').eq('user_id', s.id);
  const { data: cs } = await db.from('courses').select('id, data').eq('user_id', s.id);
  const code = (r) => cs.find((c) => c.id === r.data.courseId)?.data.code;
  const find = (c, re) => rows.find((r) => code(r) === c && re.test(r.data.title));
  const put = (r, patch) => db.from('items').update({ data: { ...r.data, ...patch }, updated_at: new Date().toISOString() }).eq('id', r.id);
  return { rows, find, put };
}
/** An insert that must work (a silent failure would make a count look wrong). */
const ins = async (table, rows) => {
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
};
const src = (title, at) => ({ kind: 'announcement', id: `e2e-${randomUUID().slice(0, 8)}`, title, quote: title, at });
const req = (text, at, extra = {}) => ({ id: randomUUID(), text, dueAt: null, done: false, doneAt: null, gradedOn: true, scope: 'instance', source: src('Announcement', at), addedAt: at, ...extra });

/** A busy week, the way the app and the server record each thing. Returns how many catches it seeded. */
async function busy(s) {
  const { rows, find, put } = await rowsOf(s);
  const lab = find('BIO-181L', /^Lab 4: Photo/);
  const quiz = find('MAT-250', /^Quiz 2/);
  const outline = find('COM-100', /Speech Outline/);
  const sheet = find('PSY-102', /Research Methods/);
  const exam = find('BIO-181', /Quiz 2/);
  const unv = rows.find((r) => r.data.title && /UNV|Reflection|Success/i.test(r.data.title) && r.data.status !== 'done') ?? find('BIO-181', /Topic 3 Homework/);
  await put(lab, { points: 50, notes: 'Complete the photosynthesis procedure and record your results.', requirements: [req('Bring your own splash goggles', ago(6)), req('Sign the lab safety waiver before lab', ago(6), { dueAt: ago(-1) }), req('Submit the data table as one PDF', ago(5)), req('Acknowledge this announcement after reading it', ago(5)), req('Cite any AI-generated content', ago(6), { scope: 'rule' })] });
  await put(quiz, { notes: 'Covers sections 3.1 to 3.3.', requirements: [req('Bring a scientific calculator, no graphing calculators', ago(4))] });
  await put(outline, { notes: 'Write a full-sentence outline for your informative speech.', requirements: [req('Bring two printed copies of your outline to class', ago(3))] });
  await put(sheet, { notes: 'Answer the worksheet questions on research designs.', requirements: [req('Include at least three peer-reviewed sources', ago(4))] });
  await put(exam, { requirements: [req('Bring your student ID to the quiz', ago(2, 6))] });
  await put(unv, { requirements: [req('Email your success coach your study plan by Friday', ago(5), { dueAt: ago(-2) })] });
  // Two due dates an announcement moved, and an assignment only an announcement announced.
  const movedA = find('BIO-181', /Topic 3 Homework/);
  const movedB = find('PSY-102', /Topic 3 DQ/);
  await put(movedA, { dateChange: { from: new Date(Date.parse(movedA.data.dueAt) - 2 * 86_400_000).toISOString(), at: ago(5), source: src('Due date change', ago(5)) } });
  await put(movedB, { dateChange: { from: new Date(Date.parse(movedB.data.dueAt) - 86_400_000).toISOString(), at: ago(3), source: src('Extension', ago(3)) } });
  const cid = lab.data.courseId;
  const id = randomUUID();
  await ins('items', { id, user_id: s.id, data: { ...lab.data, id, title: 'Lab Safety Quiz', label: '', points: 10, type: 'quiz', status: 'todo', requirements: [], dateChange: undefined, dueAt: ago(-3), source: 'manual', haloId: null, origin: src('Lab safety', ago(6)), courseId: cid }, updated_at: new Date().toISOString() });
  // Checked-off work during the week: real, but not Max, so never counted.
  for (const r of rows.filter((x) => x.data.status !== 'done' && ![lab, quiz, outline, sheet, exam, unv, movedA, movedB].includes(x)).slice(0, 6)) await put(r, { status: 'done', completedAt: ago(4) });
  // Announcements read for them.
  await ins('read_ledger', Array.from({ length: 14 }, (_, i) => ({ user_id: s.id, post_id: `e2e-post-${i}`, hash: `h${i}`, read_at: ago(3 + (i % 5), i), action_count: i % 3 })));
  // Halo synced on its own while they were away (the extension's own tab), and ones that must not count.
  const run = (auto, outcome, tab, d, h) => ({ run_id: `e2e-${randomUUID()}`, user_id: s.id, auto, outcome, tab, started_at: ago(d, h), ended_at: ago(d, h), ext_version: '0.12.12', browser: 'chrome', setup: false });
  await ins('sync_runs', [...Array.from({ length: 16 }, (_, i) => run(true, 'landed', 'own', 3 + (i % 5), i)), run(true, 'landed', 'student', 3, 2), run(true, 'failed', 'own', 4, 1), run(false, 'landed', 'own', 2, 1)]);
  // Reminders and the Sunday preview sent; a sync nudge and an unsent one that must not count.
  const note = (kind, d, sent = true) => ({ user_id: s.id, kind, key: `${kind}:${randomUUID().slice(0, 8)}`, title: kind, body: kind, send_at: ago(d), sent_at: sent ? ago(d) : null });
  await ins('notification_plan', [note('morning', 8), note('morning', 7), note('morning', 6), note('morning', 5), note('morning', 4), note('not_started', 6), note('not_started', 4), note('heavy_day', 5), note('caught', 6), note('sunday', 4), note('resync', 3), note('morning', 3, false)]);
  // Practice built from their classes.
  await ins('usage_log', [{ user_id: s.id, day: ago(5).slice(0, 10), kind: 'study', model: 'claude-haiku-5-5', cost_usd: 0.002, created_at: ago(5) }, { user_id: s.id, day: ago(3).slice(0, 10), kind: 'quiz', model: 'claude-haiku-5-5', cost_usd: 0.002, created_at: ago(3) }]);
  // 8 requirements (goggles, waiver, PDF, calculator, copies, sources, ID, email) + 2 moved + 1 announced only.
  return 11;
}
/** A quiet week: a few syncs on their own and one reminder, nothing caught. */
async function quiet(s) {
  const { rows, put } = await rowsOf(s);
  for (const r of rows.filter((x) => x.data.status !== 'done').slice(0, 2)) await put(r, { status: 'done', completedAt: ago(4) });
  await ins('sync_runs', Array.from({ length: 3 }, (_, i) => ({ run_id: `e2e-${randomUUID()}`, user_id: s.id, auto: true, outcome: 'landed', tab: 'own', started_at: ago(3 + i), ext_version: '0.12.12', browser: 'chrome', setup: false })));
  await ins('notification_plan', [{ user_id: s.id, kind: 'morning', key: 'morning:e2e', title: 'm', body: 'm', send_at: ago(4), sent_at: ago(4) }]);
}

/** The whole screen in one picture: it scrolls inside its own layer, so it is laid out on the page for the shot. */
async function shotAll(p, path) {
  await p.evaluate(() => {
    const el = document.querySelector('.trial-ended');
    const style = document.createElement('style');
    style.textContent = '#root{display:none!important}.trial-ended{position:static!important;height:auto!important;max-height:none!important;overflow:visible!important}.trial-ended .onboard-inner{height:auto!important;max-height:none!important;overflow:visible!important}.trial-ended *{animation:none!important}';
    document.head.appendChild(style);
    document.body.appendChild(el);
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path, fullPage: true });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (s, dev, scheme, extra = {}) => {
  const ctx = await browser.newContext({ ...DEVICES[dev], colorScheme: scheme, ...extra });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  // Never Stripe: the checkout the button makes ready is answered here.
  await ctx.route('**/functions/v1/stripe-checkout', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.invalid/checkout' }) }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.trial-ended .trial-end-two', { timeout: 30000 });
  await p.waitForSelector('.trial-ended [aria-busy="true"]', { state: 'detached', timeout: 20000 }).catch(() => undefined);
  return { ctx, p };
};
const resetSeen = async (id) => {
  const { data } = await db.from('settings').select('data').eq('user_id', id).single();
  await db.from('settings').update({ data: { ...data.data, trialEndSeen: null } }).eq('user_id', id);
};
const look = (p) => p.evaluate(() => {
  const t = (s) => (document.querySelector(s)?.innerText ?? '').replace(/\s+/g, ' ').trim();
  // Google's mark carries its clear space inside the file: its pill is 400/742 of the image's height, 1094 wide with 752 of pill.
  const imgs = [...document.querySelectorAll('.trial-end-pay img')].map((i) => { const b = i.getBoundingClientRect(); const g = i.classList.contains('trial-end-gpay'); const h = g ? (b.height * 400) / 742 : b.height; const padX = g ? (b.width * 171) / 1094 : 0; return { ok: i.complete && i.naturalWidth > 0, h: Math.round(h), l: Math.round(b.left + padX), r: Math.round(b.right - padX) }; });
  const card = document.querySelector('.trial-end-card')?.getBoundingClientRect();
  return {
    title: t('.story-title'),
    caught: [...document.querySelectorAll('.trial-end-caught li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
    more: t('.tec-more'),
    lines: [...document.querySelectorAll('.trial-end-week .story-line')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
    stops: t('.trial-end-stops'),
    all: t('.trial-ended'),
    imgs,
    card: card ? Math.round(card.height) : 0,
    stay: !!document.querySelector('.trial-end-two button.trial-end-stay') && getComputedStyle(document.querySelector('.trial-end-stay')).visibility === 'visible',
  };
});

try {
  const B = await kit.persona('ended');
  const want = await busy(B);
  const Q = await kit.persona('ended');
  await quiet(Q);
  const E = await kit.persona('ended');

  // The busy week's numbers counting up: a video and a GIF.
  {
    const { ctx, p } = await open(B, 'desk', 'light', { recordVideo: { dir: `${OUT}/video`, size: { width: 1280, height: 900 } } });
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 4500) {
      await p.screenshot({ path: `${OUT}/frames/${String(i++).padStart(3, '0')}.png`, clip: { x: 240, y: 0, width: 800, height: 900 } });
      await p.waitForTimeout(60);
    }
    await ctx.close();
    renameSync(await p.video().path(), `${OUT}/busy-animation.webm`);
    rmSync(`${OUT}/video`, { recursive: true, force: true });
    execFileSync('python3', ['-c', `
import glob
from PIL import Image
fs = sorted(glob.glob('${OUT}/frames/*.png'))
ims = [Image.open(f).convert('RGB').resize((560, 630)) for f in fs]
ims[0].save('${OUT}/busy-animation.gif', save_all=True, append_images=ims[1:] + [ims[-1]] * 12, duration=110, loop=0, optimize=True)
`]);
    rmSync(`${OUT}/frames`, { recursive: true, force: true });
  }

  for (const [tag, who] of [['busy', B], ['quiet', Q]]) {
    for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
      await resetSeen(who.id);
      const { ctx, p } = await open(who, dev, scheme);
      await p.waitForTimeout(4000);
      const v = await look(p);
      const at = `${tag} ${dev} ${scheme}`;
      if (dev === 'desk' && scheme === 'light') {
        console.log(`     ${tag}: "${v.title}" | caught: ${v.caught.join(' || ')} | ${v.more} | lines: ${v.lines.join(' || ')}`);
        if (tag === 'busy') {
          check(v.title === `Max caught ${want} things this week you'd have missed.`, `busy: the headline from the real count: "${v.title}"`);
          check(v.caught.length === 3 && v.caught.every((c) => /^(BIO-181L?|MAT-250|PSY-102|COM-100|UNV-103) /.test(c)) && v.more === `+${want - 3} more`, `busy: the three strongest, each with its class, then "${v.more}"`);
          check(/Sign the lab safety waiver/.test(v.caught[0]) || /moved to/.test(v.caught[0]), `busy: the strongest first: "${v.caught[0]}"`);
          const has = (re) => v.lines.some((l) => re.test(l));
          check(has(/^14 announcements read for you$/) && has(/^2 due dates that moved/) && has(/^16 times Halo synced on its own while you weren't on it$/) && has(/^9 reminders sent$/) && has(/^1 Sunday preview of your week$/) && has(/^2 practice sets built/), `busy: every Max line, real counts (the student's-tab sync, the failed one, Sync now, the sync nudge and the unsent reminder not counted)`);
          check(!/checked off|on time|\b0 (announcement|reminder|time|due|extra|Sunday|practice)/i.test(v.all) && !v.lines.some((l) => /^0\b/.test(l)), 'busy: nothing free counted (no "checked off", no "on time") and no zero anywhere');
          check(!/Acknowledge this announcement|Cite any AI/.test(v.all), 'busy: the generic line and the class rule are not counted');
          await p.locator('.tec-more').click();
          await p.waitForTimeout(300);
          const open2 = await look(p);
          check(open2.caught.length === want && open2.more === 'Show less' && open2.caught.some((c) => /Lab Safety Quiz, only announced/.test(c)), `busy: "+${want - 3} more" opens all ${want} (${open2.caught.length}), "Show less" closes them`);
          await p.locator('.trial-end-caught').screenshot({ path: `${OUT}/busy-caught-open.png` });
          await p.locator('.tec-more').click();
        } else {
          check(v.title === 'Max kept Halo synced 3 times while you were away.' && v.caught.length === 0 && v.lines.join('|') === "3 times Halo synced on its own while you weren't on it|1 reminder sent", `quiet: a real headline and only what happened: "${v.title}" / ${v.lines.join(' | ')}`);
          check(!/\b0\b/.test(v.lines.join(' ')) && !/checked off/i.test(v.all), 'quiet: no zeros, no free things');
        }
        check(v.stops === "On Free, announcements stop being read and Halo only syncs when you're on it.", `${tag}: the honest line on what stops on Free`);
        check(!/Opens Stripe/.test(v.all), `${tag}: no gray line about Stripe under the button`);
        check(v.imgs.length === 2 && v.imgs.every((i) => i.ok && i.h === 26) && v.card === 26 && v.imgs[1].l - v.imgs[0].r >= 7, `${tag}: Apple Pay and Google Pay marks (official artwork, loaded) and a card, all 26 px tall (the marks' own shapes) and apart (${JSON.stringify(v.imgs)})`);
        check(v.stay && /Stay on Free/.test(v.all) && /Keep Max · \$0\.99\/mo/.test(v.all), `${tag}: Keep Max and a real Stay on Free`);
      }
      check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${at}: no sideways scroll`);
      if (dev === 'desk') await p.locator('.trial-end-max').screenshot({ path: `${OUT}/${tag}-max-card-${dev}-${scheme}.png` });
      await shotAll(p, `${OUT}/${tag}-${dev}-${scheme}.png`);
      await ctx.close();
    }
  }

  // An empty week: nothing Max did, so no numbers at all, and an honest headline.
  {
    const { ctx, p } = await open(E, 'desk', 'light');
    await p.waitForTimeout(3000);
    const v = await look(p);
    check(v.title === 'Your free week is over. Everything you have stays.' && v.caught.length === 0 && v.lines.length === 3 && (await p.locator('.trial-end-week .story-n').count()) === 0, `empty: no counted numbers, what Max does instead: ${v.lines.join(' | ')}`);
    await shotAll(p, `${OUT}/empty-desk-light.png`);
    await ctx.close();
  }

  // Stay on Free: one tap, no confirm, and it is over.
  {
    await resetSeen(B.id);
    const { ctx, p } = await open(B, 'phone', 'light');
    await p.click('.trial-end-two button:has-text("Stay on Free")');
    await p.waitForTimeout(1500);
    const { data } = await db.from('settings').select('data').eq('user_id', B.id).single();
    check((await p.locator('.trial-ended').count()) === 0 && !!data.data.trialEndSeen, 'Stay on Free closes it in one tap and it is not shown again');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
