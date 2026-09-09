import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [src, out] = process.argv.slice(2);
const lines = readFileSync(src, 'utf8').split('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<html><body style="font-family:Helvetica;font-size:10.5pt;line-height:1.5;margin:40px">
${lines.map((l, i) => `<div>${esc(l) || '&nbsp;'}</div>${i % 48 === 47 ? '<div style="page-break-after:always"></div><div style="color:#888">Page X Grand Canyon University 2026 © Prepared on: Sep 9, 2026, 11:44 AM</div>' : ''}`).join('\n')}
</body></html>`;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setContent(html);
await page.pdf({ path: out, format: 'Letter' });
await browser.close();
console.log('wrote', out);
