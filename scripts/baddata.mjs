// Bad data probe against the preview: a corrupt local store, a wrong-shape store, then malformed Halo exports
// (classes null, a class with no fields, an assessment with no due date and non-numeric points, a future version,
// a 12-class × 80-item export). Prints page errors and whether the app is still standing after each.
//   node scripts/baddata.mjs
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
const standing = () => page.evaluate(() => ({ root: (document.getElementById('root')?.innerHTML.length ?? 0) > 200, screen: !!document.querySelector('.now, .landing, .onboard'), sheet: document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null }));
let failed = 0;
const report = (name, st, ms) => { const bad = !st.root || !st.screen || errors.length; if (bad) failed++; console.log(`${bad ? 'FAIL' : 'ok  '} ${name}: ${JSON.stringify(st)}${ms ? ` ${ms}ms` : ''}${errors.length ? ` ${errors.splice(0).join(' | ')}` : ''}`); };

await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('school-dashboard:v1', '{not json'));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
report('corrupt store', await standing());
await page.evaluate(() => localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: 'nope', items: [{ id: 1 }], settings: null })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
report('wrong-shape store', await standing());

await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
const send = (p) => page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), p);
const base = { kind: 'halo-export', version: 1, build: '2026-09-24a', exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [] };
const cls = (k, assessments) => ({ id: `h${k}`, slugId: 'X', classCode: `ZZZ-${100 + k}-X`, courseCode: `ZZZ-${100 + k}`, name: `Class ${k}`, instructors: [], stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments, announcements: [], resources: [], discussions: [], messages: [] });
const cases = {
  'classes null': { ...base, classes: null },
  'class with no fields': { ...base, classes: [{ id: 'x' }] },
  'broken assessments': { ...base, classes: [cls(0, [{ id: 'a1', title: 'Broken' }, { id: 'a2', title: 'Half', dueDate: 'not-a-date', points: 'ten' }])] },
  'future version': { ...base, version: 9, classes: [] },
  'huge export': { ...base, classes: Array.from({ length: 12 }, (_, k) => cls(k, Array.from({ length: 80 }, (_, j) => ({ id: `a${k}-${j}`, title: `Item ${j}`, dueDate: `2026-1${(j % 2)}-${String((j % 28) + 1).padStart(2, '0')}T23:59:00.000Z`, points: 10, type: 'ASSIGNMENT', status: null, score: null, description: '' })))) },
};
for (const [name, p] of Object.entries(cases)) {
  const t0 = Date.now();
  await send(p); await page.waitForTimeout(1500);
  report(name, await standing(), Date.now() - t0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}
await browser.close();
console.log(failed ? `${failed} case(s) failed` : 'all cases standing');
process.exit(failed ? 1 : 0);
