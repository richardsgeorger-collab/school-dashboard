// The favicons Google shows beside haloplus.app in results (2026-10-05: a grey globe until now). Google wants a square
// icon, a multiple of 48px, linked in the homepage HTML itself; it may crop it to a circle and shows it on white and on
// dark, so: the gold halo on a solid dark square, the mark pulled in from the corners. Writes public/favicon.svg,
// favicon-48.png, favicon-96.png, favicon-192.png and favicon.ico (16, 32, 48). Stable names, no hashes.
//   node scripts/favicons.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0b0d10"/>
  <g transform="translate(32 32) scale(0.8) translate(-32 -32)">
    <path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="#f2b84b" stroke-width="6" stroke-linecap="round"/>
    <path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke="#f2f4f7" stroke-width="6.5" stroke-linecap="round"/>
  </g>
</svg>
`;
writeFileSync('public/favicon.svg', SVG);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const png = {};
try {
  for (const size of [16, 32, 48, 96, 192]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0">${SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    png[size] = await page.screenshot({ omitBackground: false });
    await page.close();
  }
} finally {
  await browser.close();
}
for (const size of [48, 96, 192]) writeFileSync(`public/favicon-${size}.png`, png[size]);

// An .ico holding PNG images (every browser and Google read these): a 6-byte header, a 16-byte entry each, the data.
const sizes = [16, 32, 48];
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt8(0, e + 2);
  head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(png[s].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += png[s].length;
});
writeFileSync('public/favicon.ico', Buffer.concat([head, ...sizes.map((s) => png[s])]));
console.log('wrote favicon.svg, favicon-48/96/192.png, favicon.ico');
