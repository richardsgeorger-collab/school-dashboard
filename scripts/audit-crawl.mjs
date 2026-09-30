// The full hands-on audit (George, 2026-09-30): signs in as each kind of throwaway student, opens every screen and
// clicks every button, link, tab, toggle, menu and summary on it; Escape on every sheet that opens, Back after every
// navigation, Tab through each screen; external links are fetched, not opened. Records console errors, crashes, the
// app's own error reports (intercepted here, so no alert goes out), layout problems (the sweep's audit), sheets that
// Escape does not close, and clicks with no visible effect. Findings to docs/screens/audit/<run>/findings.jsonl with
// a screenshot for each.
// Safety: Stripe checkout and the portal are stubbed (never reached), password-reset and magic-link emails are
// blocked, Halo itself is faked, AI answers are stubbed (no cost), accounts are @example.invalid and removed after.
//   KEYS_ENV=... PERSONAS=synced,plus DEVICE=desk SCHEME=light [ROUTES=now,you] [BASE=...] node scripts/audit-crawl.mjs
import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const ORIGIN = new URL(BASE).origin;
const PERSONAS = (process.env.PERSONAS ?? 'synced').split(',');
const DEVICE = process.env.DEVICE ?? 'desk';
const SCHEME = process.env.SCHEME ?? 'light';
const ONLY_ROUTES = process.env.ROUTES?.split(',');
const MAX_CLICKS = Number(process.env.MAX_CLICKS ?? 70);
const RUN = `${PERSONAS.join('+')}-${DEVICE}-${SCHEME}`;
const OUT = `docs/screens/audit/${RUN}`;
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/findings.jsonl`, '');
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DEVICES = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { ...devices['iPhone 14'], deviceScaleFactor: 2 },
  'ipad-p': { ...devices['iPad Pro 11'], userAgent: IPAD_SAFARI, viewport: { width: 834, height: 1194 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
  'ipad-l': { ...devices['iPad Pro 11'], userAgent: IPAD_SAFARI, viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
};
// The sweep's in-page layout audit (cut off, off the edge, covered, sheets that do not scroll, mono where it should not be).
const AUDIT = new Function(`return \`${readFileSync('scripts/e2e-sweep.mjs', 'utf8').match(/const AUDIT = `([\s\S]*?)`;\n/)[1]}\`;`)();
const MONO_OK = /(^|\s)(mono|chip|grade-stats|quiz-chip|hb-url|course-chip|item-meta|flag|status-pill|ledger-\w+|day-group-head|count|topbar-date|diff-raw|raw|kbd|code|pre|class-card-basis|mock-meta|kb-key|kb-hint|pill|meta|err-pre|score-input|gap-err)(\s|$)/;
// Never clicked by the crawler (checked on their own): leaving the account, deleting things, and what charges money.
const SKIP = /sign out|log out|delete|remove( |$)|reset (the )?key|reset sync|erase|forget (this|everything)|clear (all|everything|data)|cancel plan|start over|disconnect/i;

let findings = 0;
const finding = async (page, f) => {
  findings++;
  const shot = `${OUT}/${String(findings).padStart(3, '0')}-${f.persona}-${(f.route || '').replace(/[^\w]+/g, '_')}.png`;
  if (page) await page.screenshot({ path: shot }).catch(() => undefined);
  appendFileSync(`${OUT}/findings.jsonl`, `${JSON.stringify({ ...f, device: DEVICE, scheme: SCHEME, shot })}\n`);
  console.log(`FIND [${f.kind}] ${f.persona} ${f.route} :: ${f.what}${f.detail ? ` :: ${String(f.detail).slice(0, 160)}` : ''}`);
};

const ROUTES = (p) => {
  const cls = p.courseIds ? Object.values(p.courseIds)[0] : null;
  const you = ['profile', 'plan', 'progress', 'grades', 'workload', 'halo', 'study', 'display', 'classes', 'notifications', 'invite', 'feedback', 'advanced'].map((s) => `#/you?s=${s}`);
  const all = ['#/now', '#/calendar', '#/calendar?v=month', '#/study', '#/ask', '#/practice', '#/check', '#/classes', ...(cls ? [`#/class?c=${cls}`] : []), '#/inbox', ...you, '#/grades', '#/load', '#/library', '#/looks', ...(p.kind === 'admin' ? ['#/admin'] : [])];
  return ONLY_ROUTES ? all.filter((r) => ONLY_ROUTES.some((o) => r.replace(/^#\//, '').startsWith(o))) : all;
};

const aiStub = (kind) => ({ response: { content: [{ type: 'text', text: `Here is what to do next (audit stub for ${kind}).` }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, model: 'claude-haiku-4-5' }, meter: { tier: 'max', monthCostUsd: 0.01, ceilingUsd: 4, ceilingUsed: 0.0025, messagesToday: 1, messagesCap: 30, lecturesThisWeek: 0, lecturesCap: 10 } });

async function crawlPersona(browser, kit, kind) {
  const p = await kit.persona(kind);
  const ctx = await browser.newContext({ ...DEVICES[DEVICE], colorScheme: SCHEME, reducedMotion: 'reduce' });
  if (DEVICE.startsWith('ipad')) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); });
  await ctx.addInitScript(({ s, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, { s: p.session, key: `sb-${ref}-auth-token` });
  const reports = [];
  const blocked = [];
  await ctx.route('**/functions/v1/report', async (r) => { try { reports.push(JSON.parse(r.request().postData() || '{}')); } catch { /* not JSON */ } return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }); });
  await ctx.route('**/functions/v1/ai', (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(aiStub(JSON.parse(r.request().postData() || '{}').kind)) })));
  for (const fn of ['stripe-checkout', 'stripe-portal']) await ctx.route(`**/functions/v1/${fn}`, (r) => { blocked.push(fn); return r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ url: `https://${fn === 'stripe-checkout' ? 'checkout' : 'billing'}.stripe.com/audit-stop` }) }); });
  await ctx.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe (stopped by the audit)</h1>' }));
  await ctx.route(/\/auth\/v1\/(recover|otp|magiclink)/, (r) => { blocked.push('email'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await ctx.route('https://halo.gcu.edu/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Halo (audit)</h1>' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 40[134]|net::ERR_|Download the React DevTools/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => { errors.push(`dialog: ${d.type()} ${d.message()}`); void d.dismiss(); });
  const popups = [];
  ctx.on('page', (pg) => { if (pg !== page) { popups.push(pg.url()); setTimeout(() => void pg.close().catch(() => undefined), 500); } });
  await page.addInitScript(() => { window.__opened = []; const o = window.open; window.open = (u) => { window.__opened.push(String(u)); return null; }; void o; });

  const drain = () => { const e = errors.splice(0); const r = reports.splice(0); return { e, r }; };
  const checked = new Set();
  const checkLinks = async (route) => {
    const links = await page.$$eval('a[href]', (els) => els.map((a) => a.href).filter((h) => /^https?:/.test(h) && !h.startsWith(location.origin)));
    for (const h of [...new Set(links)]) {
      if (checked.has(h) || /halo\.gcu\.edu|stripe\.com/.test(h)) continue;
      checked.add(h);
      const status = await fetch(h, { method: 'GET', redirect: 'follow' }).then((r) => r.status).catch((e) => `unreachable ${e.message}`);
      if (status !== 200) await finding(null, { kind: 'dead-link', persona: kind, route, what: `external link answers ${status}`, detail: h });
    }
  };
  const layout = async (route, where) => {
    const raw = await page.evaluate(AUDIT).catch(() => []);
    const issues = raw.filter((i) => !(i.kind === 'mono' && MONO_OK.test(i.cls ?? '')) && !/visually-hidden/.test(i.what ?? ''));
    if (issues.length) await finding(page, { kind: 'layout', persona: kind, route, what: `${issues.length} layout issue(s) ${where}`, detail: issues.slice(0, 4).map((i) => `${i.kind}: ${i.what}${i.by ? ` by ${i.by}` : ''}`).join(' | ') });
  };
  const settle = async (ms = 700) => { await page.waitForTimeout(ms); };
  const go = async (route) => {
    await page.goto(`${BASE}${route}`, { waitUntil: 'load' }).catch(() => undefined);
    await settle(2200);
    await page.click('.tour-tip button:has-text("Skip")', { timeout: 400 }).catch(() => undefined);
    await page.click('.levelup', { timeout: 300 }).catch(() => undefined);
  };
  const state = () => page.evaluate(() => ({ theme: (document.documentElement.getAttribute('data-theme') ?? '') + document.documentElement.className + (document.documentElement.getAttribute('style') ?? '') + (document.body.getAttribute('style') ?? ''), url: location.href, modals: document.querySelectorAll('.modal, [role="dialog"], [role="menu"]').length, failed: !!document.querySelector('.app-failed'), text: (document.querySelector('main, #root')?.innerText ?? '').length, sig: [...(document.querySelector('main, #root')?.innerText ?? '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7), focus: document.activeElement?.outerHTML.slice(0, 80) ?? '', opened: window.__opened.length, checked: [...document.querySelectorAll('input')].map((i) => (i.checked ? 1 : 0)).join(''), aria: [...document.querySelectorAll('[aria-expanded],[aria-pressed],[aria-selected],[aria-checked],[aria-current],[data-on],[data-active],[open]')].map((e) => (e.getAttribute('aria-expanded') ?? '') + (e.getAttribute('aria-pressed') ?? '') + (e.getAttribute('aria-selected') ?? '') + (e.getAttribute('aria-checked') ?? '') + (e.getAttribute('aria-current') ?? '') + (e.getAttribute('data-on') ?? '') + (e.getAttribute('data-active') ?? '') + (e.hasAttribute('open') ? 'o' : '')).join('') }));
  // Every clickable thing on the screen, keyed so it can be found again after the page re-renders.
  const enumerate = (withChrome) => page.evaluate(({ withChrome, skip }) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[aria-hidden="true"]'); };
    const scope = document.querySelector('.modal:last-of-type, [role="dialog"]:last-of-type') ?? document;
    const els = [...scope.querySelectorAll('button, a[href], [role="tab"], [role="button"], [role="menuitem"], [role="switch"], summary, input[type="checkbox"], input[type="radio"], select')]
      .filter((el) => vis(el) && !el.disabled && (withChrome || !el.closest('.topbar, .nav-bottom, .nav-top, nav[aria-label="Primary"]')));
    const counts = {};
    return els.map((el) => {
      const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const href = el.getAttribute('href') || '';
      const base = `${el.tagName.toLowerCase()}|${label}|${href}`;
      counts[base] = (counts[base] ?? 0) + 1;
      const key = `${base}|${counts[base]}`;
      el.setAttribute('data-audit-key', key);
      const external = /^https?:/.test(href) && !href.startsWith(location.origin);
      return { key, label, href, external, skip: skip.test(label), tag: el.tagName.toLowerCase(), type: el.type || '' };
    });
  }, { withChrome, skip: SKIP });

  const clickOne = async (route, item) => {
    const before = await state();
    drain();
    const loc = page.locator(`[data-audit-key="${item.key.replace(/"/g, '\\"')}"]`).first();
    const ok = await (item.tag === 'select' ? loc.selectOption({ index: 1 }).then(() => true) : loc.click({ timeout: 2500 }).then(() => true)).catch((e) => e.message.split('\n')[0]);
    await settle();
    const after = await state();
    const { e, r } = drain();
    const what = `clicking "${item.label || item.tag}"`;
    // A level up after marking work done covers the screen until tapped (Escape closes it since the audit).
    if (await page.$('.levelup')) { await page.keyboard.press('Escape'); await settle(300); if (await page.$('.levelup')) await finding(page, { kind: 'escape', persona: kind, route, what: 'Escape does not close the level-up' }); await page.click('.levelup', { timeout: 500 }).catch(() => undefined); return; }
    if (ok !== true) await finding(page, { kind: 'unclickable', persona: kind, route, what, detail: ok });
    if (e.length) await finding(page, { kind: 'console', persona: kind, route, what, detail: e.join(' | ') });
    for (const x of r) await finding(page, { kind: 'reported', persona: kind, route, what, detail: `${x.kind}: ${x.title} ${x.message ?? ''}` });
    if (after.failed) {
      await finding(page, { kind: 'crash', persona: kind, route, what, detail: await page.$eval('.app-failed code', (el) => el.textContent).catch(() => '') });
      await go(route);
      return;
    }
    if (after.modals > before.modals) {
      await layout(route, `in the sheet opened by ${what}`);
      await page.keyboard.press('Escape');
      await settle(500);
      const esc = await state();
      if (esc.modals > before.modals) {
        await finding(page, { kind: 'escape', persona: kind, route, what: `Escape does not close what ${what} opened` });
        await page.click('.modal-close, [aria-label="Close"]', { timeout: 1000 }).catch(() => undefined);
        await settle(400);
        if ((await state()).modals > before.modals) await go(route);
      }
      return;
    }
    if (after.url !== before.url) {
      const leftApp = !after.url.startsWith(ORIGIN);
      if (leftApp) { await go(route); return; }
      const sameScreen = after.url.split('#')[1]?.split('?')[0] === before.url.split('#')[1]?.split('?')[0];
      if (!sameScreen) await layout(after.url.split('#')[1], `after ${what}`);
      await page.goBack().catch(() => undefined);
      await settle(900);
      if ((await state()).url !== before.url) await go(route);
      return;
    }
    const changed = after.sig !== before.sig || after.text !== before.text || after.opened > before.opened || after.checked !== before.checked || after.aria !== before.aria || after.modals !== before.modals || after.theme !== before.theme || popups.length;
    popups.splice(0);
    if (!changed && ok === true && !/^a$/.test(item.tag)) await finding(page, { kind: 'no-effect', persona: kind, route, what: `${what} changed nothing visible` });
  };

  const tabThrough = async (route) => {
    await go(route);
    const trail = [];
    for (let k = 0; k < 45; k++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { body: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? 'outline' : cs.boxShadow !== 'none' ? 'shadow' : '';
        return { label: (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().slice(0, 40), zero: r.width === 0 || r.height === 0, hidden: cs.visibility === 'hidden' || !!el.closest('[hidden],[aria-hidden="true"]'), ring };
      });
      trail.push(f);
      if (f.zero || f.hidden) { await finding(page, { kind: 'keyboard', persona: kind, route, what: `Tab lands on something invisible ("${f.label}")` }); break; }
    }
    const noRing = trail.filter((f) => !f.body && !f.ring).map((f) => f.label);
    if (noRing.length > 3) await finding(page, { kind: 'keyboard', persona: kind, route, what: `${noRing.length} of ${trail.length} Tab stops show no focus ring`, detail: [...new Set(noRing)].slice(0, 6).join(', ') });
  };

  for (const route of ROUTES(p)) {
    await go(route);
    const first = drain();
    if (first.e.length) await finding(page, { kind: 'console', persona: kind, route, what: 'opening the screen', detail: first.e.join(' | ') });
    for (const x of first.r) await finding(page, { kind: 'reported', persona: kind, route, what: 'opening the screen', detail: `${x.kind}: ${x.title} ${x.message ?? ''}` });
    if (await page.$('.app-failed')) { await finding(page, { kind: 'crash', persona: kind, route, what: 'opening the screen' }); continue; }
    await layout(route, 'on open');
    await checkLinks(route);
    const unnamed = await page.$$eval('button, a[href], [role="button"], [role="tab"], summary', (els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.querySelector('img[alt]:not([alt=""])')).toString().trim(); }).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`));
    if (unnamed.length) await finding(page, { kind: 'a11y', persona: kind, route, what: `${unnamed.length} button(s) with no name for a screen reader`, detail: [...new Set(unnamed)].join(', ') });
    const done = new Set();
    for (let n = 0; n < MAX_CLICKS; n++) {
      const list = await enumerate(route === '#/now');
      const next = list.find((x) => !done.has(x.key) && !x.skip && !x.external);
      if (!next) break;
      done.add(next.key);
      const t0 = Date.now();
      await clickOne(route, next);
      if (process.env.DEBUG) console.log(`    ${Date.now() - t0}ms ${next.label || next.tag}`);
      // Anything the click left open (a sheet that did not close, a new route) is undone before the next.
      if (!(await page.url()).includes(route.replace(/^#/, '')) || (await page.$('.modal, [role="dialog"]'))) await go(route);
    }
    console.log(`  ${kind} ${route}: ${done.size} clicked`);
    await tabThrough(route);
  }
  console.log(`  ${kind}: blocked ${[...new Set(blocked)].join(', ') || 'nothing'}`);
  await ctx.close();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const kit = personaKit(env);
try {
  for (const kind of PERSONAS) await crawlPersona(browser, kit, kind).catch((e) => finding(null, { kind: 'harness', persona: kind, route: '', what: e.message.split('\n')[0] }));
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways; ${findings} findings → ${OUT}/findings.jsonl`);
}
