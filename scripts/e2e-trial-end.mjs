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
  const req = (text, scope) => ({ id: randomUUID(), text, dueAt: null, done: false, doneAt: null, gradedOn: true, scope, source: src, addedAt: ago(6) });
  // A standing rule first, then two real things to do: the examples must be the things to do.
  await put(lab, { notes: 'Complete the photosynthesis procedure and record your results.', requirements: [req('Cite any AI-generated content', 'rule'), req('Bring your own splash goggles'), req('Sign the lab safety waiver before lab', 'instance')] });
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

  // On a laptop the rating shows without scrolling (and Continue too).
  for (const [w, h] of [[1366, 640], [1280, 720], [1440, 780]]) {
    await resetRating(first.id);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'light' });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: first.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForSelector('.trial-ended .story-line', { timeout: 30000 });
    await p.waitForTimeout(5000);
    const fit = await p.evaluate(() => ({ plus: document.querySelector('.story-plans .plan-choice[data-tier=plus]').getBoundingClientRect().bottom, free: document.querySelector('.gcbc-free-link').getBoundingClientRect().bottom, scrolled: document.querySelector('.trial-ended').scrollTop, h: window.innerHeight, cups: document.querySelectorAll('.story-plans .drink-cup').length, big: document.querySelector('.story-plans .plan-choice[data-tier=max] .drink-cup').getBoundingClientRect().height }));
    check(fit.cups === 2 && fit.big >= 60, `${w}x${h}: two animated cups, Max's ${Math.round(fit.big)}px tall`);
    check(fit.scrolled === 0 && fit.plus <= fit.h, `${w}x${h}: Keep Max and Choose Plus show without scrolling (Plus bottom ${Math.round(fit.plus)} of ${fit.h}; Stay on Free ${Math.round(fit.free)})`);
    if (w === 1366) for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme });
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/page1-laptop-1366x640-${scheme}.png` });
    }
    await ctx.close();
  }

  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    await resetRating(first.id);
    const { ctx, p } = await open(first, dev, scheme);
    await p.waitForTimeout(5500);
    const tag = `${dev} ${scheme}`;
    if (dev === 'desk' && scheme === 'light') {
      const lines = (await p.locator('.story-line').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim());
      console.log(`     page 1 lines: ${lines.join(' || ')}`);
      check(lines.length >= 3 && lines.length <= 4, `3 to 4 lines (${lines.length})`);
      const only = lines.find((l) => /^3 things your professors only put in announcements, Halo\+ caught:/.test(l)) ?? '';
      check(/BIO-181L: Sign the lab safety waiver before lab/.test(only) && /BIO-181L: Bring your own splash goggles/.test(only) && !/Cite any AI/.test(only), `two examples, things to do, not the standing rule: "${only}"`);
      check(lines.some((l) => new RegExp(`moved from .+ to .+\\. You knew before it mattered\\.`).test(l) && l.includes(first.moved)), 'the moved date, caught before the old date');
      check(lines.some((l) => /^(You checked off \d+ assignments this week\.|On time for all \d+ things due this week\.)$/.test(l)), 'checked off or on time');
      check(/Here's what Halo\+ did for you\./.test(await p.locator('.story-title').innerText()), 'the title');
      check((await p.locator('.trial-rating').count()) === 0 && (await p.locator('.story-plans button:has-text("Keep Max")').isVisible()) && (await p.locator('.story-plans button:has-text("Choose Plus")').isVisible()) && (await p.locator('.gcbc-free-link').innerText()) === 'Stay on Free', 'one screen: no rating; Keep Max, Choose Plus and a plain Stay on Free under the recap');
    }
    check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: page 1 no sideways scroll`);
    await shotAll(p, `${OUT}/page1-${dev}-${scheme}.png`);
    await ctx.close();
    // The plans on the same screen (2026-10-09).
    if (dev === 'desk' && scheme === 'light') {
      const text = (await p2text(first, dev, scheme));
      check(/Less than a small at GCBC\./.test(text) && /About a small at GCBC\. Except this one actually helps\./.test(text), 'the GCBC lines: Max "Less than a small", Plus "About a small"');
      check(/\$2\.99 your first month, then \$7\.99\/mo/.test(text) && /Plus · \$4\.99 a month/.test(text), 'the intro offer on Max, same line as the price; Plus unchanged');
      check(/Only \$3 more than Plus for the study tools/.test(text), 'the $3-more line');
      check(/Nothing charges unless you choose a plan\./.test(text) && !/Keep going, or carry on with Free/.test(text), 'the lede is only "Nothing charges unless you choose a plan."');
      check(/Cancel anytime · plus tax where applicable/.test(text), 'Cancel anytime · plus tax where applicable under the plans');
      check(/invite a friend: you both get 30 days of Plus free/i.test(text), 'the smaller invite option');
      check(!/How much did Halo\+ help/.test(text) && !/\b10\b.*A lot/.test(text), 'no rating anywhere');
    }
  }
  async function p2text(who, dev, scheme) {
    const o = await open(who, dev, scheme);
    await o.p.waitForTimeout(3000);
    const t = (await o.p.locator('.trial-ended').innerText()).replace(/\s+/g, ' ');
    await o.ctx.close();
    return t;
  }

  // Stay on Free: one tap, no confirm, and it is over.
  {
    await resetRating(first.id);
    const { ctx, p } = await open(first, 'phone', 'light');
    await p.waitForSelector('.gcbc-free-link', { timeout: 20000 });
    await p.click('.gcbc-free-link');
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
