// The end of the free week (2026-10-29: two cards), on the real backend with throwaway students whose week is seeded
// with real things: assignments checked off, a requirement only an announcement said, a date an announcement moved
// (caught early). "Max caught N things this week you'd have missed."; Max first and the main card ("What you have
// now", $0.99 a month, up to three lines of the week counting up, "Keep Max · $0.99/mo"); Free quieter beside it
// with a real Stay on Free that works in one tap; the terms and the invite (30 days of Max). Screens: desktop and
// phone, light and dark; the week's animation as a .webm and a .gif. Throwaways removed.
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
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const ago = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const DEVICES = { desk: { viewport: { width: 1280, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

/** A student whose free week (9 to 2 days ago) had real things in it. */
async function student() {
  const s = await kit.persona('ended');
  await db.from('usage_log').insert(Array.from({ length: 13 }, () => ({ user_id: s.id, day: ago(5).slice(0, 10), kind: 'tutor', model: 'claude-haiku-4-5', created_at: ago(5) })));
  const { data: rows } = await db.from('items').select('id, data').eq('user_id', s.id);
  const { data: cs } = await db.from('courses').select('id, data').eq('user_id', s.id);
  const code = (r) => cs.find((c) => c.id === r.data.courseId)?.data.code;
  const lab = rows.find((r) => code(r) === 'BIO-181L' && /Lab/.test(r.data.title));
  const quiz = rows.find((r) => r.data.type === 'quiz' && r.id !== lab.id);
  const moved = rows.find((r) => r.id !== lab.id && r.id !== quiz.id && r.data.status !== 'done');
  const src = { kind: 'announcement', id: 'e2e-post', title: 'Lab reminder', quote: 'Bring your own splash goggles', at: ago(6) };
  const put = (r, patch) => db.from('items').update({ data: { ...r.data, ...patch }, updated_at: new Date().toISOString() }).eq('id', r.id);
  const req = (text, scope) => ({ id: randomUUID(), text, dueAt: null, done: false, doneAt: null, gradedOn: true, scope, source: src, addedAt: ago(6) });
  // A standing rule first, then two real things to do: the examples must be the things to do.
  await put(lab, { points: 50, notes: 'Complete the photosynthesis procedure and record your results.', requirements: [req('Cite any AI-generated content', 'rule'), req('Acknowledge this announcement after reading it'), req('Bring your own splash goggles'), req('Sign the lab safety waiver before lab', 'instance')] });
  await put(quiz, { practicedAt: ago(4) });
  await put(moved, { dateChange: { from: ago(3), at: ago(6), source: src }, dueAt: ago(1) });
  const toCheck = rows.filter((r) => ![lab.id, quiz.id, moved.id].includes(r.id)).slice(0, 23);
  for (const r of toCheck) await put(r, { status: 'done', completedAt: ago(4) });
  return { ...s, lab: lab.data.title, quiz: quiz.data.title, moved: moved.data.title };
}

/** The whole screen in one picture: it scrolls inside its own layer, so it is laid out on the page for the shot. */
async function shotAll(p, path) {
  await p.evaluate(() => {
    const el = document.querySelector('.trial-ended');
    const style = document.createElement('style');
    style.id = 'shot-all';
    style.textContent = '#root{display:none!important}.trial-ended{position:static!important;height:auto!important;max-height:none!important;overflow:visible!important}.trial-ended .onboard-inner{height:auto!important;max-height:none!important;overflow:visible!important}.trial-ended *{animation:none!important}.trial-ended .cup-steam path{opacity:.55}';
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
  await ctx.route('**/functions/v1/stripe-checkout', (r) => r.fulfill({ status: 500, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.trial-ended .story-line', { timeout: 30000 });
  return { ctx, p };
};
const resetRating = async (id) => {
  const { data } = await db.from('settings').select('data').eq('user_id', id).single();
  await db.from('settings').update({ data: { ...data.data, trialRating: null, trialEndSeen: null } }).eq('user_id', id);
  await db.from('trial_ratings').delete().eq('user_id', id);
};
try {
  const raters = [];
  const first = await student();
  // A real free week has a start as well as an end: the intro offer needs it.
  await db.from('profiles').update({ trial_started_at: new Date(Date.now() - 7 * 864e5).toISOString() }).eq('user_id', first.id).is('trial_started_at', null);
  raters.push(first);

  // Page 1's animation: a video, and frames for a GIF.
  {
    const { ctx, p } = await open(first, 'desk', 'light', { recordVideo: { dir: `${OUT}/video`, size: { width: 1280, height: 900 } } });
    const t0 = Date.now();
    const firstOpacity = await p.locator('.story-line').first().evaluate((e) => Number(getComputedStyle(e).opacity));
    const firstN = await p.locator('.story-n').first().textContent();
    let i = 0;
    while (Date.now() - t0 < 6500) {
      await p.screenshot({ path: `${OUT}/frames/${String(i++).padStart(3, '0')}.png`, clip: { x: 240, y: 0, width: 800, height: 900 } });
      await p.waitForTimeout(60);
    }
    const finalOpacity = await p.locator('.story-line').last().evaluate((e) => Number(getComputedStyle(e).opacity));
    const finalN = await p.locator('.story-n').first().textContent();
    const label = await p.locator('.story-n').first().getAttribute('aria-label');
    check(firstOpacity < 0.95 && finalOpacity === 1, `lines fade in one at a time (first line opacity ${firstOpacity.toFixed(2)} at the start, the last ${finalOpacity} after)`);
    check(Number(firstN) < Number(finalN) && finalN === label, `numbers count up (${firstN} → ${finalN})`);
    await ctx.close();
    renameSync((await p.video().path()), `${OUT}/page1-animation.webm`);
    rmSync(`${OUT}/video`, { recursive: true, force: true });
    execFileSync('python3', ['-c', `
import glob
from PIL import Image
fs = sorted(glob.glob('${OUT}/frames/*.png'))
ims = [Image.open(f).convert('RGB').resize((560, 630)) for f in fs]
ims[0].save('${OUT}/page1-animation.gif', save_all=True, append_images=ims[1:] + [ims[-1]] * 12, duration=110, loop=0, optimize=True)
`]);
    rmSync(`${OUT}/frames`, { recursive: true, force: true });
  }

  // On a laptop both cards and both buttons show without scrolling (2026-10-29: two cards, Max first).
  for (const [w, h] of [[1366, 640], [1280, 720], [1440, 780]]) {
    await resetRating(first.id);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'light' });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: first.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    await ctx.route('**/functions/v1/stripe-checkout', (r) => r.fulfill({ status: 500, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.trial-ended .story-line', { timeout: 30000 });
    await p.waitForTimeout(4000);
    const fit = await p.evaluate(() => ({ h: window.innerHeight, cards: document.querySelectorAll('.trial-end-two > div').length, bottoms: [...document.querySelectorAll('.trial-end-two .btn')].map((e) => e.getBoundingClientRect().bottom) }));
    check(fit.cards === 2 && fit.bottoms.length === 2, `${w}x${h}: two cards, two buttons (Keep Max, Stay on Free); bottoms ${fit.bottoms.map((b) => Math.round(b)).join('/')} of ${fit.h}`);
    if (w === 1366) for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme });
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/laptop-1366x640-${scheme}.png` });
    }
    await ctx.close();
  }

  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    await resetRating(first.id);
    const { ctx, p } = await open(first, dev, scheme);
    await p.waitForTimeout(4500);
    const tag = `${dev} ${scheme}`;
    if (dev === 'desk' && scheme === 'light') {
      const lines = (await p.locator('.story-line').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim());
      console.log(`     the week: ${lines.join(' || ')}`);
      check(lines.length >= 1 && lines.length <= 3, `at most 3 lines of the week on the Max card (${lines.length})`);
      const title = await p.locator('.story-title').innerText();
      check(/^Max caught \d+ things? this week you'd have missed\.$/.test(title), `the headline counts what Max caught: "${title}"`);
      const text = (await p.locator('.trial-ended').innerText()).replace(/\s+/g, ' ');
      check(/What you have now/i.test(text) && /Max · \$0\.99 a month/.test(text), 'Max: "What you have now", $0.99 a month');
      check(/Free · \$0/.test(text) && /Stay on Free/.test(text), 'Free: $0 and a real Stay on Free button');
      check(!/Plus\b/.test(text) && !/\$[2-9]\.99/.test(text) && !/first month/i.test(text), 'no Plus, no old prices, no intro offer');
      check(/Cancel anytime/.test(text) && /plus tax where applicable/.test(text), 'cancel and tax beside it');
      check(/you both get 30 days of Max free/i.test(text), 'the invite gives 30 days of Max');
      const btns = await p.locator('.trial-end-two .btn').evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), primary: e.classList.contains('primary'), h: Math.round(e.getBoundingClientRect().height) })));
      check(btns.length === 2 && btns[0].text === 'Keep Max · $0.99/mo' && btns[0].primary && btns[1].text === 'Stay on Free' && !btns[1].primary && btns[0].h > btns[1].h, `Max the main button, Free quieter: ${btns.map((b) => `${b.text} ${b.h}px${b.primary ? ' primary' : ''}`).join(', ')}`);
      check((await p.locator('.trial-ended [data-tone="red"], .trial-ended .drink-cup, .trial-ended .intro-was, .trial-rating').count()) === 0, 'calm: nothing red, no cups, no struck-through price, no rating');
      const order = await p.evaluate(() => { const [a, b] = document.querySelectorAll('.trial-end-two > div'); return a.dataset.tier + ',' + b.dataset.tier; });
      check(order === 'max,free', `Max first (${order})`);
    }
    check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: no sideways scroll`);
    await p.locator('.trial-end-two').screenshot({ path: `${OUT}/cards-${dev}-${scheme}.png` });
    await shotAll(p, `${OUT}/screen-${dev}-${scheme}.png`);
    await ctx.close();
  }

  // Stay on Free: one tap, no confirm, and it is over.
  {
    await resetRating(first.id);
    const { ctx, p } = await open(first, 'phone', 'light');
    await p.waitForSelector('.trial-end-two button:has-text("Stay on Free")', { timeout: 20000 });
    await p.click('.trial-end-two button:has-text("Stay on Free")');
    await p.waitForTimeout(1500);
    const { data } = await db.from('settings').select('data').eq('user_id', first.id).single();
    check((await p.locator('.trial-ended').count()) === 0 && !!data.data.trialEndSeen, 'Stay on Free closes it in one tap and it is not shown again');
    await ctx.close();
  }

} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
