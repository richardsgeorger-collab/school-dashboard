// The table sign for the GCU student market (George, 2026-10-08): one printable letter page, gold on dark like the
// app, the halo mark, the landing headline, three bullets, a big QR code to haloplus.app/market, "7 days free, no
// card", and the small "Not affiliated with GCU". Writes docs/market/halo-plus-table-sign.pdf, a PNG preview beside
// it, and the QR code on its own (docs/market/qr-market.png) for anything else that needs it.
//   node scripts/market-sign.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { chromium } from 'playwright-core';

const OUT = 'docs/market';
mkdirSync(OUT, { recursive: true });
const URL = 'https://haloplus.app/market';
const qr = await QRCode.toDataURL(URL, { errorCorrectionLevel: 'H', margin: 1, width: 1200, color: { dark: '#0b0d10', light: '#ffffff' } });
writeFileSync(`${OUT}/qr-market.png`, Buffer.from(qr.split(',')[1], 'base64'));

const MARK = `<svg viewBox="0 0 64 64" width="88" height="88" aria-hidden="true"><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="#f2b84b" stroke-width="6" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke="#f2f4f7" stroke-width="6.5" stroke-linecap="round"/></svg>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" />
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; }
  body { width: 8.5in; height: 11in; background: #0b0d10; color: #f2f4f7; font-family: 'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { box-sizing: border-box; width: 8.5in; height: 11in; padding: 0.6in 0.65in 0.5in; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand b { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-size: 34px; font-weight: 800; letter-spacing: -0.02em; }
  .eyebrow { margin: 26px 0 8px; color: #b8bcc6; font-size: 14px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
  h1 { margin: 0; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-size: 50px; line-height: 1.06; font-weight: 800; letter-spacing: -0.025em; }
  h1 em { font-style: normal; color: #f2b84b; }
  ul { margin: 30px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  li { display: flex; align-items: flex-start; gap: 14px; font-size: 21px; line-height: 1.35; color: #e6e8ee; }
  li i { flex: none; width: 12px; height: 12px; margin-top: 9px; border-radius: 50%; background: #f2b84b; }
  .qr-row { margin-top: auto; display: flex; align-items: center; gap: 36px; }
  .qr { flex: none; width: 3.7in; height: 3.7in; padding: 14px; border-radius: 22px; background: #fff; box-sizing: border-box; }
  .qr img { width: 100%; height: 100%; display: block; }
  .cta { display: flex; flex-direction: column; gap: 10px; }
  .cta .big { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-size: 36px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
  .cta .free { display: inline-block; width: max-content; padding: 10px 18px; border-radius: 999px; background: #f2b84b; color: #141414; font-size: 20px; font-weight: 700; }
  .cta .url { color: #b8bcc6; font-size: 20px; font-weight: 500; }
  .foot { margin-top: 22px; display: flex; justify-content: space-between; color: #8a8f9a; font-size: 12px; }
</style>
</head>
<body>
<div class="page">
  <div class="brand">${MARK}<b>Halo+</b></div>
  <p class="eyebrow">The planner built for Halo</p>
  <h1>Every GCU deadline in one place. <em>Even the ones hidden in announcements.</em></h1>
  <ul>
    <li><i></i><span>Your classes, due dates, grades and announcements, synced from Halo by themselves every 3 hours.</span></li>
    <li><i></i><span>It reads every announcement and attaches what the professor asked for to the assignment itself.</span></li>
    <li><i></i><span>One screen says what to do next. Ask it anything about your own classes.</span></li>
  </ul>
  <div class="qr-row">
    <div class="qr"><img src="${qr}" alt="QR code to haloplus.app/market" /></div>
    <div class="cta">
      <span class="big">Scan to try it on your phone.</span>
      <span class="free">7 days free, no card</span>
      <span class="url">haloplus.app/market</span>
    </div>
  </div>
  <div class="foot"><span>Never asks for your GCU password.</span><span>Not affiliated with GCU.</span></div>
</div>
</body>
</html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/halo-plus-table-sign.pdf`, format: 'Letter', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: `${OUT}/halo-plus-table-sign.png`, fullPage: false });
  console.log(`wrote ${OUT}/halo-plus-table-sign.pdf, .png and qr-market.png (${URL})`);
} finally {
  await browser.close();
}
