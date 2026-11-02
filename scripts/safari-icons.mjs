// Halo+ for Safari's app icons (Loop 308), from the Halo+ mark (extension/icon.svg's ring and plus), drawn large:
//   iPhone/iPad: one 1024 px square, full bleed and opaque (iOS rounds the corners itself);
//   Mac: Apple's Mac icon shape (a rounded square inset in the canvas), at every Mac size;
//   the app's own screen: Icon.png.
//   node scripts/safari-icons.mjs
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const SET = 'safari/Halo+/Shared (App)/Assets.xcassets/AppIcon.appiconset';
const mark = (s) => `<path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="#f2b84b" stroke-width="6" stroke-linecap="round" transform="${s}"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke="#f2f4f7" stroke-width="6.5" stroke-linecap="round" transform="${s}"/>`;
// iOS: the whole square dark, the mark a little smaller than the toolbar icon's, so it sits inside iOS's corners.
const ios = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024"><rect width="64" height="64" fill="#0b0d10"/>${mark('translate(6.4 6.4) scale(0.8)')}</svg>`;
// Mac: 824 of 1024 px, 185 px corners (Apple's grid), a soft shadow below.
const mac = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><defs><filter id="s" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity="0.28"/></filter></defs><rect x="100" y="90" width="824" height="824" rx="185" fill="#0b0d10" filter="url(#s)"/><g transform="translate(100 90) scale(12.875)">${mark('translate(6.4 6.4) scale(0.8)')}</g></svg>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
const draw = async (svg, file, transparent) => {
  await p.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#0b0d10'}">${svg}</body></html>`);
  await p.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
};
await draw(ios, `${SET}/universal-icon-1024@1x.png`, false);
await draw(mac, '.scratch/mac-1024.png', true);
await b.close();
// iOS's icon may not have an alpha channel.
execFileSync('sips', ['-s', 'format', 'jpeg', `${SET}/universal-icon-1024@1x.png`, '--out', '.scratch/ios.jpg'], { stdio: 'ignore' });
execFileSync('sips', ['-s', 'format', 'png', '.scratch/ios.jpg', '--out', `${SET}/universal-icon-1024@1x.png`], { stdio: 'ignore' });
for (const n of [16, 32, 128, 256, 512])
  for (const k of [1, 2]) execFileSync('sips', ['-z', String(n * k), String(n * k), '.scratch/mac-1024.png', '--out', `${SET}/mac-icon-${n}@${k}x.png`], { stdio: 'ignore' });
execFileSync('sips', ['-z', '256', '256', '.scratch/mac-1024.png', '--out', 'safari/Halo+/Shared (App)/Resources/Icon.png'], { stdio: 'ignore' });
console.log('icons drawn');
