// The end of the free week as two pages (George, 2026-10-01), on the real backend with throwaway students whose week
// is seeded with real things: assignments checked off, a requirement only an announcement said, a date an
// announcement moved (caught early), practice built for a named quiz, questions answered. Page 1 tells it line by
// line (fade, slide, numbers counting up) with the 1 to 10 rating and Continue, and no way to Free; page 2 is the
// GCBC page with Keep Max, Choose Plus, the terms, the invite and a plain Stay on Free that works in one tap.
// Screens: both pages, desktop and phone, light and dark; page 1's animation as a .webm and a .gif. Throwaways removed.
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
  await put(lab, { notes: 'Complete the photosynthesis procedure and record your results.', requirements: [{ id: randomUUID(), text: 'Bring your own splash goggles', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: ago(6) }] });
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
    check(firstOpacity < 0.5 && finalOpacity === 1, `lines fade in one at a time (first line opacity ${firstOpacity.toFixed(2)} at the start, the last ${finalOpacity} after)`);
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

  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    await resetRating(first.id);
    const { ctx, p } = await open(first, dev, scheme);
    await p.waitForTimeout(5500);
    const tag = `${dev} ${scheme}`;
    if (dev === 'desk' && scheme === 'light') {
      const lines = (await p.locator('.story-line').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim());
      console.log(`     page 1 lines: ${lines.join(' || ')}`);
      check(lines.length >= 3 && lines.length <= 5, `3 to 5 lines (${lines.length})`);
      check(lines.some((l) => /^1 thing your professors only put in an announcement, Halo\+ caught: BIO-181L: Bring your own splash goggles/.test(l)), 'the announcement-only requirement, named');
      check(lines.some((l) => new RegExp(`moved from .+ to .+\\. You knew before it mattered\\.`).test(l) && l.includes(first.moved)), 'the moved date, caught before the old date');
      check(lines.some((l) => /^You checked off \d+ assignments this week\.$/.test(l)), 'assignments checked off');
      check(lines.some((l) => l.includes(`Built practice for your`) && l.includes(first.quiz)), 'practice, naming the quiz');
      check(/Here's what Halo\+ did for you\./.test(await p.locator('.story-title').innerText()), 'the title');
      check((await p.locator('.trial-ended :text("Stay on Free"), .trial-ended [aria-label="Close"]').count()) === 0 && (await p.locator('.story-continue').isVisible()), 'page 1 has no way to Free or close, only Continue');
    }
    check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: page 1 no sideways scroll`);
    await shotAll(p, `${OUT}/page1-${dev}-${scheme}.png`);
    await ctx.close();
    // Page 2.
    const o2 = await open(first, dev, scheme);
    await o2.p.click('.story-continue');
    await o2.p.waitForSelector('.gcbc-page');
    await o2.p.waitForTimeout(2600);
    if (dev === 'desk' && scheme === 'light') {
      const text = (await o2.p.locator('.gcbc-page').innerText()).replace(/\s+/g, ' ');
      check(/You'd pay this for a GCBC drink\. ?This one actually helps\./.test(text), 'page 2 headline');
      check((await o2.p.locator('.gcbc-plan[data-tier=max] .drink-cup').getAttribute('data-size')) === 'large' && (await o2.p.locator('.gcbc-plan[data-tier=plus] .drink-cup').getAttribute('data-size')) === 'small', 'a large cup for Max, a small one for Plus');
      check(/What you had this week/.test(await o2.p.locator('.gcbc-plan[data-tier=max]').innerText()) && (await o2.p.locator('.gcbc-plan[data-tier=max] button:has-text("Keep Max")').isVisible()) && (await o2.p.locator('.gcbc-plan[data-tier=plus] button:has-text("Choose Plus")').isVisible()), 'Max is the star with Keep Max; Plus has Choose Plus');
      check(/Cancel anytime · plus tax where applicable/.test(text), 'Cancel anytime · plus tax where applicable under both');
      check(/Not ready\? Invite a friend, you both get 30 days of Plus free\./.test(text), 'the smaller invite option');
      check(/your syllabi/.test(text) && !/their syllabi/.test(text), 'Free copy says "your syllabi"');
      const maxH = (await o2.p.locator('.gcbc-plan[data-tier=max] .btn').boundingBox()).height;
      const plusH = (await o2.p.locator('.gcbc-plan[data-tier=plus] .btn').boundingBox()).height;
      check(maxH > plusH, `Keep Max is the bigger button (${Math.round(maxH)} vs ${Math.round(plusH)}px)`);
    }
    check(!(await o2.p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: page 2 no sideways scroll`);
    await shotAll(o2.p, `${OUT}/page2-${dev}-${scheme}.png`);
    await o2.ctx.close();
  }

  // Stay on Free: one tap, no confirm, and it is over.
  {
    await resetRating(first.id);
    const { ctx, p } = await open(first, 'phone', 'light');
    await p.click('.story-continue');
    await p.click('.gcbc-free-link');
    await p.waitForTimeout(1500);
    const { data } = await db.from('settings').select('data').eq('user_id', first.id).single();
    check((await p.locator('.trial-ended').count()) === 0 && !!data.data.trialEndSeen, 'Stay on Free closes it in one tap and it is not shown again');
    await ctx.close();
  }

  // Ratings on page 1: low → Feedback, high → invite, skip.
  const low = await student();
  raters.push(low);
  {
    const { ctx, p } = await open(low, 'desk', 'light');
    await p.waitForTimeout(4500);
    await p.click('.trial-rating-n:has-text("4")');
    await p.fill('.trial-rating textarea', 'Wish it read my discussion replies too.');
    await p.locator('.trial-rating').screenshot({ path: `${OUT}/rating-low-desk-light.png` });
    await p.click('.trial-rating button:has-text("Send")');
    await p.waitForSelector('.trial-rating [role=status]', { timeout: 10000 });
    check(await p.locator('.story-continue').isVisible(), 'Continue is still there after rating');
    await ctx.close();
  }
  const { data: lowRow } = await db.from('trial_ratings').select('rating, comment').eq('user_id', low.id).single();
  const { data: fb } = await db.from('feedback').select('text, screen').eq('user_id', low.id);
  check(lowRow?.rating === 4 && fb?.some((f) => f.screen === '#trial-end' && /rated 4\/10: Wish it read/.test(f.text)), 'a 4 is saved, its comment lands in Feedback');
  const high = await student();
  raters.push(high);
  {
    const { ctx, p } = await open(high, 'phone', 'dark');
    await p.waitForTimeout(4500);
    await p.click('.trial-rating-n:has-text("9")');
    await p.waitForSelector('.trial-rating-invite');
    check(/both get 30 days of Plus free/.test(await p.locator('.trial-rating').innerText()), 'a 9 says thanks and offers the invite');
    await p.locator('.trial-rating').screenshot({ path: `${OUT}/rating-high-phone-dark.png` });
    await ctx.close();
  }
  {
    const skip = await student();
    const { ctx, p } = await open(skip, 'desk', 'dark');
    await p.waitForTimeout(4500);
    await p.click('.trial-rating-skip');
    await p.waitForTimeout(300);
    check((await p.locator('.trial-rating').count()) === 0 && (await p.locator('.story-continue').isVisible()), 'Skip removes the question; Continue stays');
    await ctx.close();
  }

  // Admin still sees the ratings.
  const boss = await kit.persona('admin');
  const bossC = (await kit.signIn(boss.email)).c;
  for (const r of raters) await bossC.rpc('admin_set_test', { uid: r.id, test: false });
  const { data: stats } = await bossC.rpc('admin_trial_ratings');
  check(stats.n >= 2 && stats.comments.some((c) => /discussion replies/.test(c.comment)), `Admin: ${stats.n} ratings, average ${stats.average}`);
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
