// Two tabs, one cache. The Halo bookmark opens the app in a second tab, so this is the ordinary case: tab B applies
// a sync, tab A (never reloaded) ticks something, and both changes must survive in the cache and in each tab.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/twotab.mjs
import { chromium } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const BUILD = await currentBuild(BASE);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const A = await ctx.newPage();
await A.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
await A.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
await A.goto(`${BASE}#/now`, { waitUntil: 'networkidle' }); await A.reload({ waitUntil: 'networkidle' }); await A.waitForTimeout(600);
const B = await ctx.newPage();
await B.goto(`${BASE}#/now`, { waitUntil: 'networkidle' }); await B.waitForTimeout(600);
const chm = await B.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).courses.find((c) => c.code === 'CHM-113'));
const p = { kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments'], classes: [{ id: `h-${chm.id}`, slugId: 'X', classCode: 'CHM-113-X', courseCode: 'CHM-113', name: chm.name, instructors: [], stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [{ id: 'tab-1', title: 'Two-tab probe item', dueDate: '2026-11-21T06:59:00.000Z', points: 30, type: 'ASSIGNMENT', status: null, score: null, description: '' }], announcements: [], resources: [], discussions: [], messages: [] }] };
await B.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), p);
await B.waitForTimeout(1500);
await B.locator('.modal-actions button').last().click(); await B.waitForTimeout(1000);
const applied = await B.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.some((i) => i.title === 'Two-tab probe item'));
await A.waitForTimeout(500);
await A.keyboard.press('d'); await A.waitForTimeout(1200);
const after = await A.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); return { hasNew: d.items.some((i) => i.title === 'Two-tab probe item'), heroDone: d.items.some((i) => i.status === 'done' && i.completedAt && Date.now() - new Date(i.completedAt).getTime() < 10000) }; });
await B.waitForTimeout(500);
const bSees = await B.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.some((i) => i.status === 'done' && i.completedAt && Date.now() - new Date(i.completedAt).getTime() < 15000));
await browser.close();
const ok = applied && after.hasNew && after.heroDone && bSees;
console.log(`${ok ? 'PASS' : 'FAIL'} sync applied in B: ${applied} · after A's tick the cache has B's item: ${after.hasNew}, A's tick: ${after.heroDone} · B sees A's tick: ${bSees}`);
process.exit(ok ? 0 : 1);
