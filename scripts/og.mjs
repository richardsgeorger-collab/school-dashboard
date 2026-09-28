// The share image (1200×630) behind every pasted link: the mark, the one-line promise, the address. Rendered from
// the same type and colours the site uses, so a link in a group chat looks like the product.   node scripts/og.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; background: #f6f7f9; color: #14171c; font-family: Inter, system-ui, sans-serif; }
  .card { position: relative; box-sizing: border-box; width: 1200px; height: 630px; padding: 72px 80px; display: grid; grid-template-rows: auto 1fr auto; }
  .top { display: flex; align-items: center; gap: 20px; }
  .mark { width: 64px; height: 64px; }
  .eyebrow { font: 600 22px/1 Inter, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #946800; white-space: nowrap; }
  h1 { margin: 0; align-self: center; font: 800 78px/1.04 "Plus Jakarta Sans", Inter, sans-serif; letter-spacing: -0.03em; max-width: 1040px; }
  h1 b { color: #946800; font-weight: 800; }
  .bottom { display: flex; justify-content: space-between; align-items: flex-end; gap: 40px; }
  .lede { margin: 0; font: 500 28px/1.35 Inter, sans-serif; color: #4b535e; max-width: 900px; }
  .url { margin-left: auto; font: 500 18px/1 "JetBrains Mono", monospace; color: #6b7480; white-space: nowrap; }
  .glow { position: absolute; right: -140px; top: -160px; width: 620px; height: 620px; border-radius: 50%; background: radial-gradient(closest-side, rgba(242,184,75,0.28), rgba(242,184,75,0)); }
</style></head><body><div class="card">
  <div class="glow"></div>
  <div class="top">
    <svg class="mark" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#0b0d10"/><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="#f2b84b" stroke-width="6" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke="#f2f4f7" stroke-width="6.5" stroke-linecap="round"/></svg>
    <span class="eyebrow">Halo+ · built for Halo</span>
    <span class="url">richardsgeorger-collab.github.io/school-dashboard</span>
  </div>
  <h1>All of Halo, read for you. <b>Even the announcements.</b></h1>
  <div class="bottom">
    <p class="lede">Then the one thing to do next. Your GCU classes, assignments, grades and every announcement on one screen. One bookmark syncs it. Never your password.</p>
  </div>
</div></body></html>`;

mkdirSync('public', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: 'public/og.png', type: 'png' });
await browser.close();
console.log('wrote public/og.png (1200×630)');
