// The landing page led by the extension (Loop 302): desktop (Chrome, Edge, Safari's label) and iPhone (Safari and
// Instagram's browser), with checks on the order of the sections, the trust lines and their live count, the Add to
// Chrome button's address, and the phone keeping its sign-up screen. haloplus.app is this build (dist-site).
//   node scripts/shots-landing-ext.mjs   → docs/screens/landing-ext/
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, devices, webkit } from 'playwright-core';

const OUT = 'docs/screens/landing-ext';
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const site = (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
  let file = join('dist-site', path || 'index.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join('dist-site', 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
};
const checks = [];
const check = (ok, line) => {
  checks.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prep = async (ctx) => {
  await ctx.route('https://haloplus.app/**', site);
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
};

const cr = await chromium.launch();
for (const [name, ua] of [
  ['chrome', null],
  ['edge', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'],
]) {
  const ctx = await cr.newContext({ viewport: { width: 1440, height: 900 }, ...(ua ? { userAgent: ua } : {}) });
  await prep(ctx);
  const p = await ctx.newPage();
  await p.goto('https://haloplus.app/', { waitUntil: 'load' });
  await p.waitForFunction(() => /Join (\d+\+|hundreds of) GCU students already using it/.test(document.querySelector('.lp-trust')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => undefined);
  await sleep(800);
  const r = await p.evaluate(() => {
    const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top + scrollY;
    const feats = [...document.querySelectorAll('.lp-feature-title')].map((h) => h.textContent);
    return {
      order: ['.lp-hero-ext', '.lp-features', '.lp-bonus', '.lp-close', '.landing-faq'].map(top),
      reelInHero: !!document.querySelector('.lp-hero-ext .lp-reel-frame'),
      feats,
      hook: document.querySelector('.lp-title-hook')?.textContent,
      cta: document.querySelector('.lp-hero-ext .btn.primary')?.textContent,
      href: document.querySelector('.lp-hero-ext .btn.primary')?.getAttribute('href'),
      trust: [...document.querySelectorAll('.lp-trust')].map((t) => t.textContent),
      phone: getComputedStyle(document.querySelector('.lp-onphone')).display,
    };
  });
  const sorted = r.order.every((v, i, a) => i === 0 || v > a[i - 1]);
  if (name === 'chrome') {
    check(r.hook === 'The Halo upgrade every GCU student needs.' && r.reelInHero && sorted, `desktop: hook and the reel first, then features, bonus app, close, FAQ (${r.order.map(Math.round).join(' < ')})`);
    check(r.feats.join(' | ') === 'What’s next, on every class. | Every class, one calendar. | ⌘K. Find anything. | Rubrics, right under the assignment. | Confetti when you submit. | Never miss a hidden due date.', `the features in order: ${r.feats.join(' | ')}`);
    check(r.cta === 'Add to Chrome, it’s free' && /^https:\/\/chromewebstore\.google\.com\/detail\//.test(r.href ?? ''), `Add to Chrome goes to the Web Store (${r.href})`);
    check(r.trust.length === 2 && r.trust.every((t) => /^Takes 10 seconds\. Free\. Join (\d+\+ |hundreds of )?GCU students already using it\.$/.test(t)), `a trust line by both main buttons: "${r.trust[0]}"`);
    check(r.phone === 'none', 'desktop: no phone screen');
    await p.screenshot({ path: `${OUT}/desktop-top.png` });
    // Scroll through, as a visitor does, so every picture loads (they load lazily), and check each one drew.
    for (let y = 0; y < 7000; y += 600) {
      await p.evaluate((v) => window.scrollTo(0, v), y);
      await sleep(150);
    }
    await sleep(800);
    const imgs = await p.evaluate(() => [...document.querySelectorAll('.lp-feature img')].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
    check(imgs.length === 6 && imgs.every((i) => i.ok), `every feature picture loaded (${imgs.filter((i) => i.ok).length} of ${imgs.length})`);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: `${OUT}/desktop-full.png`, fullPage: true });
  } else check(r.cta === 'Add to Edge, it’s free', `Edge: "${r.cta}"`);
  await ctx.close();
}
await cr.close();

const wk = await webkit.launch();
{
  const ctx = await wk.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' });
  await prep(ctx);
  const p = await ctx.newPage();
  await p.goto('https://haloplus.app/', { waitUntil: 'load' });
  await sleep(1200);
  const b = await p.evaluate(() => ({ t: document.querySelector('.lp-hero-ext .btn.primary').textContent, h: document.querySelector('.lp-hero-ext .btn.primary').getAttribute('href') }));
  check(b.t === 'Get Halo+ for Chrome' && b.h === './laptop/', `Mac Safari: "${b.t}" → the laptop page (it says Chrome or Edge kindly)`);
  await ctx.close();
}
for (const [name, d, igH] of [
  ['iphone-se', devices['iPhone SE'], 520],
  ['iphone-15', devices['iPhone 15'] ?? devices['iPhone 14'], 664],
]) {
  for (const where of ['safari', 'instagram']) {
    const ua = where === 'instagram' ? d.userAgent.replace(/Version\/[\d.]+ Mobile\/(\w+) Safari\/[\d.]+/, 'Mobile/$1 Instagram 312.0.0.32.112') : d.userAgent;
    const ctx = await wk.newContext({ ...d, userAgent: ua, viewport: { width: d.viewport.width, height: where === 'instagram' ? igH : d.viewport.height - 120 } });
    // The real local server (vite preview of dist, :4174): in Safari's engine, pictures served through request
    // interception and loaded lazily paint blank, which is the test tool, not the page.
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto('http://localhost:4174/school-dashboard/?src=ig', { waitUntil: 'load' });
    await p.locator('.lp-onphone-title').waitFor({ timeout: 15000 });
    await p.waitForFunction(() => /Join (\d+\+|hundreds of) GCU students already using it/.test(document.querySelector('.lp-onphone-why')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => undefined);
    await sleep(900);
    const r = await p.evaluate(() => ({
      why: document.querySelector('.lp-onphone-why')?.textContent,
      heroHidden: getComputedStyle(document.querySelector('.lp-hero-ext')).display === 'none',
      featuresShown: getComputedStyle(document.querySelector('.lp-features')).display !== 'none',
      first: (document.querySelector('.lp-onphone-main')?.textContent ?? '').trim(),
    }));
    check(/^Takes 10 seconds\. Free\. Join (\d+\+ |hundreds of )?GCU students already using it\.$/.test(r.why ?? '') && r.heroHidden && r.featuresShown && r.first === (where === 'instagram' ? 'Sign up with email' : 'Continue with Google'), `${name} ${where}: the sign-up screen as before (main "${r.first}"), its trust line "${r.why}", then the features`);
    await p.screenshot({ path: `${OUT}/${name}-${where}.png` });
    if (name === 'iphone-15') {
      for (let y = 0; y < 9000; y += 500) {
        await p.evaluate((v) => window.scrollTo(0, v), y);
        await sleep(120);
      }
      await sleep(700);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.screenshot({ path: `${OUT}/${name}-${where}-full.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await wk.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
