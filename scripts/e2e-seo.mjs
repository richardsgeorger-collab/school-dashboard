// What search engines and AI assistants receive (George, 2026-09-30): the landing page's text in the HTML itself,
// the help pages at clean addresses with their structured data, sitemap and llms.txt; and that the pre-rendered
// landing never shows to a returning student. Screenshots to docs/screens/seo/.
//   [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-seo.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/seo';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const text = async (path) => (await fetch(new URL(path, BASE))).text();

// 1. The raw HTML, as a crawler that runs no JavaScript gets it.
const raw = await text('');
for (const s of ['All of Halo, read for you', 'What it does', 'How the sync works', 'Does it need my GCU password?', 'not affiliated with Grand Canyon University', 'Help for GCU Halo']) check(raw.includes(s), `raw HTML has "${s}"`);
const helpLinks = [...raw.matchAll(/href="\.\/help\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
check(helpLinks.length >= 6, `raw HTML links ${helpLinks.length} help pages`);
const map = await text('sitemap.xml');
const llms = await text('llms.txt');
check(helpLinks.every((s) => map.includes(`/help/${s}/</loc>`)), 'every help page is in the sitemap');
check(llms.startsWith('# Halo+') && helpLinks.every((s) => llms.includes(`/help/${s}/`)), 'llms.txt describes Halo+ and lists every help page');
for (const slug of helpLinks) {
  const r = await fetch(new URL(`help/${slug}/`, BASE));
  const html = await r.text();
  const types = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])['@type']);
  check(r.status === 200 && types.includes('SoftwareApplication') && types.includes('FAQPage') && html.includes('not affiliated'), `/help/${slug}/ 200, ${types.join(' + ')}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // 2. No JavaScript at all: the landing page still reads.
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 860 } });
  const p0 = await nojs.newPage();
  await p0.goto(BASE);
  check(await p0.getByRole('heading', { name: /All of Halo, read for you/ }).isVisible(), 'with JavaScript off, the landing page is there');
  await p0.screenshot({ path: `${OUT}/landing-no-js.png` });
  await nojs.close();

  // 3. A stranger with JavaScript: the landing page from the first frame, never a blank one, no errors.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  let blank = false;
  await page.exposeFunction('__sawBlank', () => { blank = true; });
  await page.addInitScript(() => {
    const look = () => {
      const t = document.getElementById('root');
      if (t && document.readyState !== 'loading' && !t.querySelector('.landing')) window.__sawBlank?.();
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true });
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  check(await page.locator('.landing h1').isVisible(), 'a stranger sees the landing page once the app starts');
  check(!blank, 'no frame without the landing page while the app starts');
  check(errors.length === 0, `no errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await ctx.close();

  // 4. A returning student (any #/ address): the pre-rendered landing page is hidden from the first paint.
  const back = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await back.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p2 = await back.newPage();
  await p2.route('**/assets/**', (r) => new Promise((res) => setTimeout(res, 1500)).then(() => r.continue()));
  await p2.goto(`${BASE}#/now`, { waitUntil: 'domcontentloaded' });
  const hidden = await p2.evaluate(() => { const l = document.querySelector('#root > .prerendered'); return !l || getComputedStyle(l).visibility === 'hidden'; });
  check(hidden, 'at #/now the pre-rendered landing page is hidden before the app loads');
  await back.close();
  // Every screen the app draws stays visible once it starts (the log-in page wears .landing too).
  for (const route of ['#/login', '#/start', '#/now', '']) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await c.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const pg = await c.newPage();
    await pg.goto(`${BASE}${route}`, { waitUntil: 'load' });
    await pg.waitForTimeout(2500);
    const seen = await pg.evaluate(() => [...document.querySelectorAll('#root *')].filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility === 'visible').length);
    check(seen > 5 && !(await pg.$('#root > .prerendered')), `${route || 'the root'}: the app's screen is visible and the pre-rendered copy is gone`);
    await c.close();
  }

  // 5. The help pages: desktop and phone, light and dark.
  for (const [dev, opts] of [['desk', { viewport: { width: 1280, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    for (const scheme of ['light', 'dark']) {
      const c = await browser.newContext({ ...opts, colorScheme: scheme });
      const p = await c.newPage();
      await p.goto(`${BASE}help/gcu-halo-due-dates/`, { waitUntil: 'networkidle' });
      const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check(!wide, `${dev} ${scheme}: help page has no sideways scroll`);
      await p.screenshot({ path: `${OUT}/help-${dev}-${scheme}.png`, fullPage: dev === 'phone' });
      if (dev === 'desk' && scheme === 'light') {
        await p.goto(`${BASE}help/halo-vs-halo-plus/`, { waitUntil: 'networkidle' });
        await p.screenshot({ path: `${OUT}/help-vs-desk-light.png`, fullPage: true });
        await p.goto(`${BASE}help/`, { waitUntil: 'networkidle' });
        await p.screenshot({ path: `${OUT}/help-index-desk-light.png`, fullPage: true });
        await p.goto(BASE, { waitUntil: 'networkidle' });
        await p.locator('.landing-help').scrollIntoViewIfNeeded();
        await p.screenshot({ path: `${OUT}/landing-footer-desk-light.png` });
      }
      await c.close();
    }
  }
} finally {
  await browser.close();
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
