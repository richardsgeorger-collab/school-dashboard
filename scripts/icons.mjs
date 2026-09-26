// Renders public/icon.svg to the PNG sizes the manifest lists (192, 512, and the 180px Apple touch icon): node scripts/icons.mjs
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [file, size] of [['public/icon-192.png', 192], ['public/icon-512.png', 512], ['public/apple-touch-icon.png', 180]]) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(`<html><body style="margin:0;background:#0b0d10">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
  writeFileSync(file, buf);
  await ctx.close();
}
await browser.close();
console.log('icons written');
