// The iPad's own setup (2026-09-29), in Safari and Chrome, portrait and landscape, light and dark, on the preview
// build: every step on its own screen with its picture and the thing to tap circled; Chrome's nudge to Safari (an
// x-safari-https:// link) and staying in Chrome; the big Copy bookmark code button saying Copied; the test step
// opening Halo in a new tab; the waiting screen with the fix for that browser after the minute (shortened here);
// moving on by itself when the sync arrives; and afterwards the sync hints showing this student's own steps.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-ipad-onboarding.mjs
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const BUILD = await currentBuild(BASE);
const OUT = 'docs/screens/ipad-onboarding';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10) + 'T06:59:00.000Z';
const payload = () => ({ kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'],
  classes: [{ id: 'hc-chm', slugId: 'chm', classCode: 'CHM-113-O500', courseCode: 'CHM-113', name: 'General Chemistry I', instructors: ['Dr. Awad'], startDate: '2026-09-01', endDate: '2026-12-15', stage: 'CURRENT', modality: 'ONGROUND', credits: 3,
    assessments: [{ id: 'a1', title: 'Topic 3 Homework', dueDate: day(3), points: 20, type: 'ASSIGNMENT', status: null, score: null, description: '' }, { id: 'a3', title: 'Quiz 2', dueDate: day(4), points: 50, type: 'QUIZ', status: null, score: null, description: '' }],
    announcements: [], resources: [], discussions: [], messages: [] }] });
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
for (const [bname, ua] of [['safari', SAFARI], ['chrome', CHROME]]) {
  for (const orient of ['portrait', 'landscape']) {
    for (const scheme of ['light', 'dark']) {
      const full = bname === 'safari' ? orient === 'portrait' && scheme === 'light' : orient === 'portrait' && scheme === 'light';
      const tag = `${bname}-${orient}-${scheme}`;
      const ctx = await browser.newContext({ ...devices['iPad Pro 11'], userAgent: ua, viewport: orient === 'portrait' ? { width: 834, height: 1194 } : { width: 1194, height: 834 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: scheme, reducedMotion: 'no-preference', permissions: ['clipboard-read', 'clipboard-write'] });
      await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => (/CriOS/.test(navigator.userAgent) ? 'iPad' : 'MacIntel') }); });
      await ctx.route('https://halo.gcu.edu/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<title>Halo</title><h1>Halo</h1>' }));
      const p = await ctx.newPage();
      await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
      await p.evaluate(() => { localStorage.clear(); localStorage.setItem('school-dashboard:onboard-wait-ms', '1500'); });
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.click('.onboard button:has-text("Start")');
      await p.waitForTimeout(700);
      let n = 0;
      const shot = async (label) => { n += 1; await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${tag}-${String(n).padStart(2, '0')}-${label}.png` }); };
      const title = () => text(p, '.onboard-title');
      const hasPic = () => p.$eval('.ipad-step .ip', (e) => !!e.querySelector('.ip-hot')).catch(() => false);
      const steps = [];
      if (bname === 'chrome') {
        await shot('safari-nudge');
        const link = await p.$eval('.ipad-safari a', (e) => e.getAttribute('href')).catch(() => '');
        if (full) {
          check(/Safari makes this easier on iPad/.test(await title()), 'Chrome on iPad: a gentle nudge to Safari first');
          check(/^x-safari-https?:\/\//.test(link), `one tap opens the same page in Safari (${link.slice(0, 50)}…)`);
          check(!/laptop|computer/i.test(await text(p, '.onboard')), 'no "use a laptop" path anywhere');
        }
        await p.click('.onboard button:has-text("Stay in Chrome")');
        await p.waitForTimeout(400);
      } else {
        await shot('favorites-bar');
        steps.push([await title(), await hasPic()]);
        if (full) check(/Turn on the Favorites Bar/.test(await title()) && /Settings/.test(await text(p, '.ipad-step')) && /Show Favorites Bar/.test(await text(p, '.ipad-step')), 'Safari step 1: turn on the Favorites Bar in Settings');
        await p.click('.onboard-big:has-text("It\'s on")');
        await p.waitForTimeout(400);
      }
      await shot('copy');
      await p.click('.onboard-big:has-text("Copy bookmark code")');
      await p.waitForTimeout(400);
      const copiedLabel = await text(p, '.ipad-step .onboard-big');
      const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      await shot('copied');
      if (full) check(copiedLabel.startsWith('Copied') && /^javascript:/.test(clip), `the big button copies the code and says "${copiedLabel}"`);
      await p.click('.onboard-big:has-text("Next")');
      for (const [label, btn] of [['bookmark', 'Done'], ['open-it', "It's open"], ['rename', 'Renamed'], ['paste', 'Saved']]) {
        await p.waitForTimeout(400);
        await shot(label);
        steps.push([await title(), await hasPic()]);
        await p.click(`.onboard-big:has-text("${btn}")`);
      }
      await p.waitForTimeout(400);
      await shot('test');
      steps.push([await title(), await hasPic()]);
      if (full) {
        check(steps.every(([, pic]) => pic), `every step has its picture with the thing to tap circled (${steps.length} steps)`);
        const t = steps.map(([x]) => x).join(' | ');
        check(bname === 'safari' ? /Save this page to Favorites/.test(t) && /Rename it/.test(t) && /Paste the code as its address/.test(t) && /Favorites Bar/.test(t) : /Bookmark this page/.test(t) && /Rename it/.test(t) && /Paste the code/.test(t) && /type Sync Halo/.test(t), `one step per screen: ${t}`);
      }
      const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), p.click('.onboard-big:has-text("Open Halo")')]);
      if (full) check(!!tab && /halo\.gcu\.edu/.test(tab.url()), 'Open Halo opens Halo in a new tab');
      await p.bringToFront();
      await p.waitForTimeout(600);
      await shot('waiting');
      await p.waitForSelector('.fixes', { timeout: 6000 }).catch(() => undefined);
      await shot('waiting-fixes');
      const fixes = await text(p, '.fixes');
      if (full) {
        check(/Waiting for your sync/.test(await title()) && !!(await p.$('.onboard-wait .ip .ip-hot')), 'the waiting screen repeats the picture');
        check(bname === 'safari' ? /No Favorites Bar under the address bar/.test(fixes) : /No bookmark in the suggestions/.test(fixes), `after the minute, the fix for ${bname}: "${fixes.slice(0, 110)}…"`);
        check(/paste it here/.test(await text(p, '.onboard-wait')), 'with the iPad sync path off for this account, it says up front to paste what Halo shows');
      }
      // The sync arrives: the screen moves on by itself.
      await p.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
      await p.waitForSelector('.onboard-payoff', { timeout: 15000 }).catch(() => undefined);
      await shot('arrived');
      if (full) check(!!(await p.$('.onboard-payoff')), 'when the sync arrives, it moves on by itself');
      const how = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.syncHow);
      if (full) check(how === `ipad-${bname}`, `it remembers how this student syncs: ${how}`);
      await p.click('.onboard button:has-text("Start here")').catch(() => undefined);
      await p.waitForTimeout(800);
      await p.click('.tour-tip button:has-text("Skip")').catch(() => undefined);
      await p.goto(`${BASE}#/you?s=halo`, { waitUntil: 'load' });
      await p.waitForTimeout(1000);
      await shot('you-halo');
      const youHow = await text(p, '.how-you-sync');
      if (full) check(bname === 'safari' ? /Favorites Bar/.test(youHow) : /type Sync Halo/.test(youHow), `You shows their own steps: "${youHow}"`);
      if (full) {
        await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); const old = new Date(Date.now() - 5 * 86400000).toISOString(); d.settings.lastPull.at = old; for (const k of Object.keys(d.settings.haloPulls ?? {})) for (const f of Object.keys(d.settings.haloPulls[k])) d.settings.haloPulls[k][f] = old; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
        await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
        await p.reload({ waitUntil: 'load' });
        await p.waitForTimeout(1200);
        await shot('stale');
        const line = await text(p, '.synced');
        check(bname === 'safari' ? /Favorites Bar/.test(line) : /type Sync Halo/.test(line), `the stale banner shows their steps too: "${line}"`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
