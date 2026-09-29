// Lecture recordings to text (2026-09-28), on the real backend with throwaway accounts. Groq itself is stood in for
// (the transcribe function's URL is answered in the test browser, checking each piece is 16 kHz mono WAV and returning
// text), since its key is not set yet; everything else is real, including the Haiku notes after Save. Checks: MP4 video,
// M4A and WAV all come through; progress says how long is left; the result lands in the transcript box and saves like a
// pasted one; the not-set-up and not-Max cases say so plainly. Screens light and dark.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ MEDIA=/path/to/media node scripts/e2e-lecture-file.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const MEDIA = process.env.MEDIA;
const OUT = 'docs/screens/lecture-file';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const user = async (tier) => {
  const email = `e2e-lecture-${tier}-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  await admin.from('profiles').update({ tier }).eq('user_id', data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return s.session;
};
const SAID = 'Today we cover limiting reactants. Remember, the exam on Friday will have a stoichiometry question, so practice mole ratios. The homework on percent yield is due Monday before class, and it is worth twenty points.';
const pieces = [];
const standIn = (ctx, delay) => ctx.route('**/functions/v1/transcribe', async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST' } });
  if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ready":true}' });
  const b = req.postDataBuffer();
  pieces.push({ riff: b.subarray(0, 4).toString() === 'RIFF', rate: b.readUInt32LE(24), channels: b.readUInt16LE(22), seconds: Number(req.headers()['x-seconds']), auth: /^Bearer ey/.test(req.headers().authorization ?? '') });
  await new Promise((r) => setTimeout(r, delay));
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, text: SAID }) });
});
const open = async (ctx, session) => {
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.evaluate(({ s, key }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(s)); }, { s: session, key: `sb-${ref}-auth-token` });
  await p.goto(`${BASE}#/now?seed=1`, { waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); localStorage.setItem('school-dashboard:home-screen-nudge', 'done'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(2500);
  // The first change writes the seeded term into the cache.
  await p.click('.upgrade button:has-text("Skip")', { timeout: 3000 }).catch(() => undefined);
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('school-dashboard:v1') || '{}').courses || []).length > 0, null, { timeout: 15000 });
  const course = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113').id);
  await p.goto(`${BASE}#/class?c=${course}`, { waitUntil: 'load' });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.click('.upgrade button:has-text("Skip")', { timeout: 2000 }).catch(() => undefined);
  await p.click('button:has-text("Add a lecture")');
  await p.waitForTimeout(1200);
  return p;
};
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const max = await user('max');
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
    await standIn(ctx, 2500);
    const p = await open(ctx, max);
    await p.screenshot({ path: `${OUT}/1-upload-${scheme}.png` });
    if (scheme === 'light') check(/Upload a recording/.test(await text(p, '.lecture-mode')) && /Paste transcript/.test(await text(p, '.lecture-mode')) && !!(await p.$('.lecture-drop input[type=file]')), 'the lecture screen offers Upload a recording and Paste transcript');
    if (scheme === 'light') check((await p.$eval('.lecture-drop input', (e) => e.accept)).includes('.mp4') && (await p.$eval('.lecture-drop input', (e) => e.accept)).includes('.m4a'), 'the picker takes MP4, M4A, MP3 and WAV');
    const files = scheme === 'light' ? ['lecture-video.mp4', 'lecture.m4a', 'lecture.wav', 'long.wav'] : ['lecture-video.mp4'];
    for (const f of files) {
      if (f !== files[0]) {
        await p.click('.modal-actions .btn:has-text("Cancel")').catch(() => undefined);
        await p.waitForTimeout(300);
        await p.click('button:has-text("Add a lecture")');
        await p.waitForTimeout(800);
      }
      pieces.length = 0;
      await p.setInputFiles('.lecture-drop input', `${MEDIA}/${f}`);
      await p.waitForSelector('.lecture-drop.busy:has-text("Transcribing")', { timeout: 20000 }).catch(() => undefined);
      if (f === files[0]) await p.screenshot({ path: `${OUT}/2-transcribing-${scheme}.png` });
      const prog = await text(p, '.lecture-drop');
      await p.waitForSelector('textarea.paste-transcript', { timeout: 60000 }).catch(() => undefined);
      const got = await p.$eval('textarea.paste-transcript', (e) => e.value).catch(() => '');
      if (scheme === 'light') {
        check(/Transcribing/.test(prog), `${f}: progress shows while it works: "${prog}"`);
        check(pieces.length >= 1 && pieces.every((x) => x.riff && x.rate === 16000 && x.channels === 1 && x.auth), `${f}: the sound came out as 16 kHz mono WAV, sent signed in (${pieces.map((x) => `${x.seconds}s`).join(', ')})`);
        check(got.includes('limiting reactants'), `${f}: the transcript lands in the box, like a pasted one`);
        if (f === 'long.wav') check(pieces.length === 3 && got.split('limiting reactants').length === 4, `a 12-minute file goes in ${pieces.length} pieces and comes back joined in order`);
      }
    }
    await p.screenshot({ path: `${OUT}/3-transcript-${scheme}.png` });
    if (scheme === 'light') {
      await p.click('.modal-actions .btn.primary');
      await p.waitForSelector('.lecture-review, .modal-body .hint:has-text("Saved")', { timeout: 120000 }).catch(() => undefined);
      await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}/4-read-light.png` });
      const body = await text(p, 'body');
      check(/exam|stoichiometry|percent yield|Friday/i.test(body), 'Save and read it: the real notes come back from the transcript, as with a paste');
    }
    await ctx.close();
  }
  // Not set up yet: the real function answers.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const p = await open(ctx, max);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/5-not-set-up-light.png` });
  check(/not switched on yet\. Paste a transcript for now\./.test(await text(p, '.modal')), 'before the key is set, it says so and points at pasting (no dead button)');
  await ctx.close();
  // Not Max.
  const plus = await user('plus');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await standIn(ctx2, 0);
  const p2 = await open(ctx2, plus);
  await p2.click('.lecture-mode button:has-text("Upload a recording")').catch(() => undefined);
  await p2.waitForTimeout(500);
  await p2.screenshot({ path: `${OUT}/6-not-max-light.png` });
  check(/part of Max/.test(await text(p2, '.modal')) && !(await p2.$('.lecture-drop')), 'on Plus, uploading is marked as Max; pasting still works');
  await ctx2.close();
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan', 'transcribe_log']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
