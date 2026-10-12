// The five Chrome Web Store screenshots (George, 2026-10-12): exactly 1280×800, 24-bit PNG (no alpha), each with a short
// caption bar on top, from the Maya Torres demo student only (never real student data). The demo is entered as a
// throwaway admin presses "Load the demo student"; its "Demo · Play the wow moments" chip is hidden for the shots.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/webstore-shots.mjs
// Into webstore-upload/screenshots/ (kept out of git).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = resolve('webstore-upload/screenshots');
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAR = 72;
const HIDE = '.demo-chip, .demo-tour, .rate-prompt { display: none !important; }';

const SHOTS = [
  { file: '1-whats-due-next.png', caption: "Every Halo class in one plan. Know what's due next.", hash: '#/now' },
  { file: '2-announcements-caught.png', caption: 'Due dates hidden in announcements, caught for you', hash: '#/inbox' },
  { file: '3-on-your-phone.png', caption: 'Your whole week on your phone, synced from Halo', hash: '#/now', phone: true },
  { file: '4-classes-and-grades.png', caption: 'Every class with your real Halo grade', hash: '#/classes' },
  { file: '5-ask-a-question.png', caption: 'Ask anything about your classes', hash: '#/ask?q=How%20many%20words%20does%20the%20Case%20Study%20Analysis%20need%3F', wait: 12000 },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const boss = await kit.persona('admin');
  const enter = async (device) => {
    const ctx = await browser.newContext(device);
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: boss.session, key: `sb-${ref}-auth-token` });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
    await p.waitForSelector('button:has-text("Load the demo student")', { timeout: 60000 });
    await p.click('button:has-text("Load the demo student")');
    await p.waitForSelector('.now-head', { timeout: 30000 });
    await sleep(3000);
    return { ctx, p };
  };
  const clear = async (p) => { for (let i = 0; i < 4 && (await p.locator('.modal-backdrop, .levelup').count()) > 0; i++) { await p.keyboard.press('Escape'); await sleep(400); } };
  const capture = async (p, s, path) => {
    await p.goto(`${BASE}${s.hash}`, { waitUntil: 'load' });
    await sleep(s.wait ?? 3500);
    await clear(p);
    await p.addStyleTag({ content: HIDE });
    await sleep(300);
    await p.screenshot({ path });
  };

  const desk = await enter({ viewport: { width: 1280, height: 800 - BAR }, deviceScaleFactor: 1 });
  const phone = await enter({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const raw = {};
  for (const s of SHOTS) {
    raw[s.file] = resolve(OUT, `.raw-${s.file}`);
    await capture(s.phone ? phone.p : desk.p, s, raw[s.file]);
  }

  // Compose: the caption bar, then the screen (the phone one centred on a quiet background with one line beside it).
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
  for (const s of SHOTS) {
    const img = `data:image/png;base64,${readFileSync(raw[s.file]).toString('base64')}`;
    const body = s.phone
      ? `<div class="phone-wrap"><div class="pitch"><b>Synced on your laptop.</b><span>Open it on your phone and it's all there: what's due, what moved, what to start.</span></div><div class="phone"><img src="${img}"></div></div>`
      : `<img class="screen" src="${img}">`;
    await page.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; margin: 0; }
      body { width: 1280px; height: 800px; overflow: hidden; background: #f3f4f6; font-family: Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
      .bar { height: ${BAR}px; background: #171b21; color: #fff; display: flex; align-items: center; gap: 14px; padding: 0 36px; }
      .bar .mark { width: 12px; height: 12px; border-radius: 50%; background: #f2b84b; flex: none; }
      .bar b { font-size: 28px; font-weight: 800; letter-spacing: -0.01em; }
      .screen { display: block; width: 1280px; height: ${800 - BAR}px; object-fit: cover; object-position: top; }
      .phone-wrap { height: ${800 - BAR}px; display: flex; align-items: center; justify-content: center; gap: 72px; background: linear-gradient(180deg, #f6f1e4, #f3f4f6); }
      .pitch { width: 380px; display: grid; gap: 14px; color: #1b1d22; }
      .pitch b { font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; }
      .pitch span { font-size: 20px; line-height: 1.4; color: #4b5563; }
      .phone { width: 312px; height: 676px; border-radius: 44px; background: #111; padding: 12px; box-shadow: 0 24px 60px rgba(0,0,0,.28); }
      .phone img { width: 288px; height: 652px; border-radius: 34px; object-fit: cover; object-position: top; display: block; }
    </style></head><body><div class="bar"><span class="mark"></span><b>${s.caption}</b></div>${body}</body></html>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const out = resolve(OUT, s.file);
    await page.screenshot({ path: out });
    // 24-bit, no alpha, exactly 1280×800.
    execFileSync('python3', ['-c', `from PIL import Image\nim = Image.open('${out}').convert('RGB')\nassert im.size == (1280, 800), im.size\nim.save('${out}')`]);
    execFileSync('rm', ['-f', raw[s.file]]);
    console.log('wrote', s.file);
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
