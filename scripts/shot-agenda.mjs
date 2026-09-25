// Seeds the real data shape, then screenshots a route. Before-and-after evidence for the agenda work.
// usage: node scripts/shot-agenda.mjs <out.png> [route] [width]
import puppeteer from 'puppeteer-core';
import { CLASSES, items } from './fixtures/messy.mjs';

const [out = 'agenda.png', route = '#/calendar?v=agenda', width = '1280'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: Number(width), height: 1400, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';

await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle0' });
// Make sure every class exists, and learn its id, before building the items in node where the fixture's helpers live.
const byCode = await page.evaluate((classes) => {
  const raw = JSON.parse(localStorage.getItem('school-dashboard:v1'));
  const map = {};
  for (const c of classes) {
    const hit = raw.courses.find((x) => x.code === c.code);
    if (hit) {
      hit.name = c.name;
      hit.color = c.color;
      map[c.code] = hit.id;
      continue;
    }
    const id = `c-${c.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    raw.courses.push({ ...raw.courses[0], id, code: c.code, name: c.name, color: c.color, notes: [] });
    map[c.code] = id;
  }
  localStorage.setItem('school-dashboard:v1', JSON.stringify(raw));
  return map;
}, CLASSES);
// The store saves its own copy on a debounce, so a write can be clobbered moments later. Seed, reload, verify,
// and try again rather than screenshotting whatever happened to win.
const seed = async () => {
  await page.evaluate((list) => {
    const raw = JSON.parse(localStorage.getItem('school-dashboard:v1'));
    raw.items = list;
    localStorage.setItem('school-dashboard:v1', JSON.stringify(raw));
  }, items(byCode));
  // A goto that only changes the hash is a same-document navigation: the app never remounts and keeps its own
  // copy of the data, which is what made every earlier screenshot show the seed rather than the fixture.
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('school-dashboard:v1'));
    return { items: raw.items.length, parts: raw.items.reduce((n, i) => n + (i.requirements ?? []).length, 0), first: raw.items[0]?.title ?? '' };
  });
};
let wrote = await seed();
for (let i = 0; i < 4 && wrote.first !== 'APA Quiz 1'; i++) wrote = await seed();
if (wrote.first !== 'APA Quiz 1') throw new Error(`seed did not stick: first item is "${wrote.first}"`);
wrote.courses = Object.keys(byCode).length;

await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: out, fullPage: true });
const h = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(`saved ${out} · page height ${h}px`);
await browser.close();
