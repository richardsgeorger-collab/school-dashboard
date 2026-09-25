// A brand-new user: fresh profile, phone width, nothing in storage. Every route, what it shows, and a screenshot.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = process.env.OUT ?? '/tmp/audit';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setRequestInterception(true);
page.on('request', (req) => (req.url().startsWith('https://api.anthropic.com/') ? req.abort() : req.continue()));

const routes = ['#/now', '#/calendar', '#/calendar?v=month', '#/classes', '#/inbox', '#/you', '#/you?s=plan', '#/load', '#/load?v=term', '#/grades', '#/library'];
// The first open is the welcome. Walk it, screenshotting each step, then finish it so the tabs can be walked.
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
const click = (src) => page.$$eval('.onboard button, .tour-tip button', (els, s) => { const b = els.find((e) => new RegExp(s).test(e.textContent)); if (b) b.click(); return !!b; }, src);
let k = 0;
for (const label of ['Next', 'Next', 'Get started', 'do this later', 'Show me my day']) {
  await sleep(300);
  await page.screenshot({ path: `${OUT}/onboard-${k++}.png`, fullPage: true });
  const info = await page.evaluate(() => ({ title: document.querySelector('.onboard-title')?.textContent ?? null, step: document.querySelector('.onboard-head .mono')?.textContent ?? null, words: document.querySelector('.onboard')?.innerText.split(/\s+/).length ?? 0 }));
  console.log('onboarding:', info.step, '|', info.title, `(${info.words} words)`);
  if (!(await click(label))) { console.log('  no button matching', label); break; }
}
await sleep(500);
console.log('tour tip 1:', await page.evaluate(() => document.querySelector('.tour-tip p')?.textContent ?? null));
await page.screenshot({ path: `${OUT}/tour-0.png`, fullPage: false });
for (let t = 0; t < 3; t++) { await click('Next|Got it'); await sleep(250); }
console.log('tour finished:', await page.evaluate(() => !document.querySelector('.tour-tip')));

for (const r of routes) {
  await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(700);
  const info = await page.evaluate(() => {
    const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return {
      h1: text('h1').slice(0, 2),
      headings: text('h2, .section-title').slice(0, 10),
      buttons: [...new Set(text('button, a.btn'))].slice(0, 18),
      hints: text('.hint').slice(0, 6).map((t) => t.slice(0, 110)),
      words: document.body.innerText.split(/\s+/).length,
      scrollPx: document.documentElement.scrollHeight,
    };
  });
  const name = r.replace(/[#/?=]/g, '_');
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`\n=== ${r} === (${info.words} words, ${info.scrollPx}px tall)`);
  console.log('  h1:', info.h1.join(' | '));
  console.log('  sections:', info.headings.join(' | '));
  console.log('  actions:', info.buttons.join(' | '));
  console.log('  hints:', info.hints.join(' || '));
}
const seeded = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); return { courses: d.courses.map((c) => c.code), items: d.items.length }; });
console.log('\nA brand-new user starts with:', JSON.stringify(seeded));
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
