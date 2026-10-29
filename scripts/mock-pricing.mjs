// Mockups for the Free + Max plan (2026-10-29, for George's OK; nothing here is built): pictures only, drawn onto Halo's
// saved page copies (with the real extension) and in the app's own look. Demo student Maya Torres (made up).
//   node scripts/mock-pricing.mjs   → docs/screens/pricing-mockups/
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { gradesGateway, topicGateway, topicPage } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const OUT = 'docs/screens/pricing-mockups';
const MARK = '<svg viewBox="5 3 56 56" width="1em" height="1em" style="vertical-align:-.14em"><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="#c98a17" stroke-width="7.5" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" fill="none" stroke="currentColor" stroke-width="7.5" stroke-linecap="round"/></svg>';
const LOCK = '<svg viewBox="0 0 16 16" width="13" height="13" style="vertical-align:-2px"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

const b = await openBench({ label: 'mock-pricing', pages: { '^/courses/[^/]+/course-units/[^/]+$': topicPage } });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx), topicGateway(b.fx));
try {
  // Drawn as Free will look after the change (everything on Halo's pages on Free): rendered with those features on.
  await b.seed({ lastAttemptAt: new Date().toISOString(), tier: 'max' });
  // 6a. The locked heads-up on an assignment, in Halo's own row under its due date: once per item.
  const row = b.fx.index.rows.find((r) => r.kind === 'assignment' && r.unit && Date.parse(r.cdue) > Date.now() + 864e5);
  const cls = b.fx.index.classes[row.c];
  b.bench.state.grades = Object.fromEntries(b.fx.index.rows.map((r) => [r.id, { status: 'ACTIVE' }]));
  let p = await b.page(`https://halo.gcu.edu/courses/${cls.slug}/course-units/${row.unit}`, { width: 1366, height: 760 });
  await sleep(2500);
  const target = p.locator('[data-testid="assessment_card"]', { has: p.locator(`[data-testid="assessment_title"]:text-is("${row.title}")`) });
  if ((await target.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await target.locator('button[data-toggle]').click();
  await sleep(500);
  await p.evaluate(([title, MARK, LOCK]) => {
    const card = [...document.querySelectorAll('[data-testid="assessment_card"]')].find((c) => c.querySelector('[data-testid="assessment_title"]')?.textContent.trim() === title) || document.querySelector('[data-testid="assessment_card"]');
    const due = card.querySelector('[data-testid="date_time_data_due_date"]')?.closest('[class*="grid"], .flex') || card.firstElementChild;
    const el = document.createElement('div');
    el.style.cssText = 'margin:10px 20px 4px;padding:9px 12px;border-radius:6px;background:#fbf4e3;border:1px solid #efd9a3;font:14px/1.4 "Open Sans",sans-serif;color:#3d3420;display:flex;align-items:center;gap:8px';
    el.innerHTML = `<span style="color:#9a6a08">${LOCK}</span><span><b>An announcement changed this due date</b> · <a href="#" style="color:#5a2d82;font-weight:600;text-decoration:underline">Unlock with Max</a></span><span style="margin-left:auto;opacity:.75">${MARK}</span>`;
    due.after(el);
    card.scrollIntoView({ block: 'center' });
  }, [row.title, MARK, LOCK]);
  await sleep(400);
  await p.screenshot({ path: `${OUT}/6a-locked-heads-up.png` });
  await p.close();

  // 6b. The one note when the trial ends: on Halo's Student Home, in Halo's own alert style, once, never again.
  p = await b.page('https://halo.gcu.edu/', { width: 1366, height: 760 });
  await until(async () => (await p.locator('[data-haloplus="week"]').count()) === 1, 15000, 200);
  await sleep(1500);
  await p.evaluate(([MARK]) => {
    const wk = document.querySelector('[data-haloplus="week"]');
    const el = document.createElement('div');
    el.style.cssText = 'margin:0 0 16px;padding:14px 18px;border-radius:4px;border-left:5px solid var(--lms-alertInfoColor,#2f6fb3);background:var(--lms-alertInfoBackgroundColor,#eef4fb);box-shadow:0 10px 15px -3px #0000001a;font:14px/1.45 var(--lms-fontFamily,"Open Sans"),sans-serif;color:var(--lms-textPrimaryColor,#212121);display:flex;gap:18px;align-items:center';
    el.innerHTML = `<div style="flex:1"><div style="font-weight:700;font-size:15px;margin-bottom:2px">${MARK}&nbsp; Your Max trial has ended</div><div>You keep everything on Halo's pages, syncing when you're on Halo, your grades and GPA. <b>Max</b> adds announcements read for you (moved and hidden due dates), auto-sync every 3 hours, reminders and your calendar feed.</div></div>
      <div style="display:flex;gap:10px;align-items:center;flex:none"><button style="all:unset;cursor:pointer;background:#5a2d82;color:#fff;font-weight:700;padding:9px 16px;border-radius:4px">Keep Max · $0.99/mo</button><button style="all:unset;cursor:pointer;color:#5a2d82;font-weight:600;padding:9px 6px">Not now</button></div>`;
    wk.before(el);
  }, [MARK]);
  await sleep(300);
  await p.screenshot({ path: `${OUT}/6b-trial-end-note-on-halo.png` });
  await p.close();

  // 6c. One quiet line in the popup.
  const id = new URL(b.worker.url()).host;
  p = await b.ctx.newPage();
  await p.setViewportSize({ width: 360, height: 520 });
  await p.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' });
  await sleep(1500);
  await p.evaluate(() => {
    const el = document.createElement('a');
    el.href = '#';
    el.textContent = 'Max: $0.99/mo ›';
    el.style.cssText = 'display:block;margin:10px 16px 0;font:600 13px/1.4 Inter,system-ui,sans-serif;color:#b77f10;text-decoration:none';
    (document.querySelector('#status') || document.body.firstElementChild).after(el);
    // The popup's old Plus line goes with Plus.
    [...document.querySelectorAll('body *')].filter((e) => /Plus also syncs/.test(e.textContent) && e.children.length < 4).forEach((e) => e.remove());
  });
  await p.screenshot({ path: `${OUT}/6c-popup-line.png` });
  await p.close();
} finally {
  await b.close();
}

// 7. The trial-end screen in the app: two cards. A = Managed Payments kept (Stripe's page, Apple Pay and Google Pay at
// its top); B = Managed Payments off (the official wallet buttons right on the card).
const font = (f) => `data:font/woff2;base64,${readFileSync(`extension/fonts/${f}`).toString('base64')}`;
const FONTS = `@font-face{font-family:'Plus Jakarta Sans';src:url('${font('PlusJakartaSans.woff2')}') format('woff2');font-weight:200 800}@font-face{font-family:Inter;src:url('${font('Inter.woff2')}') format('woff2');font-weight:100 900}`;
const html = (variant, phone) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;font:15px/1.45 Inter,system-ui,sans-serif;color:#15181d}
.w{max-width:${phone ? 390 : 760}px;margin:0 auto;padding:${phone ? '28px 18px' : '44px 24px'}}
.k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;font-weight:600}
h1{font:800 ${phone ? 30 : 42}px/1.05 'Plus Jakarta Sans',sans-serif;letter-spacing:-.03em;margin:8px 0 22px}
.cards{display:grid;grid-template-columns:${phone ? '1fr' : '1.35fr 1fr'};gap:16px;align-items:start}
.c{background:#fff;border:1px solid #e3e5ea;border-radius:16px;padding:22px}
.max{border:2px solid #dfa321;box-shadow:0 18px 40px -18px rgb(223 163 33 / .55);position:relative}
.tag{position:absolute;top:-12px;left:20px;background:#dfa321;color:#1d1503;font:700 12px/1 Inter,sans-serif;padding:6px 10px;border-radius:999px}
.p{font:800 26px/1.1 'Plus Jakarta Sans',sans-serif;letter-spacing:-.02em}.p small{font:500 14px Inter,sans-serif;color:#6b7280}
.wk{margin:14px 0 18px;display:grid;gap:8px}.wk div{display:flex;gap:10px;align-items:baseline;font-weight:500}
.wk b{font:800 22px/1 'Plus Jakarta Sans',sans-serif;color:#b77f10;min-width:28px;text-align:right}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:12px;font-weight:700;font-size:16px;margin-top:10px;border:0;width:100%}
.gold{background:#dfa321;color:#1d1503}.ap{background:#000;color:#fff;font-weight:500}.gp{background:#202124;color:#fff;font-weight:500}
.ghost{background:#fff;border:1.5px solid #c9ccd3;color:#15181d}
ul{margin:10px 0 0;padding-left:18px;color:#4b5260}li{margin:4px 0}
.n{font-size:13px;color:#6b7280;margin-top:10px}.fine{font-size:13px;color:#6b7280;margin-top:16px}
.ph{font-size:11px;color:#9aa0aa;text-align:center;margin-top:4px}
</style></head><body><div class="w">
<div class="k">Your free week · Oct 22 to Oct 29</div>
<h1>Max caught 4 things this week you'd have missed.</h1>
<div class="cards">
<div class="c max"><span class="tag">What you have now</span>
<div class="p">Max <small>· $0.99 a month</small></div>
<div class="wk"><div><b>4</b> things only in announcements, read and put on the right assignment</div><div><b>1</b> due date moved, Oct 22 → Oct 24, before it mattered</div><div><b>18</b> times Halo+ synced on its own, so Now was never out of date</div></div>
${variant === 'B' ? `<button class="btn ap"> Buy with Apple Pay</button><div class="ph">official Apple Pay button, shown only where Apple Pay works</div><button class="btn gp">Buy with G Pay</button><div class="ph">official Google Pay button, shown only where Google Pay works</div><button class="btn gold">Keep Max · $0.99/mo</button>` : `<button class="btn gold">Keep Max · $0.99/mo</button><div class="n">Opens Stripe's checkout at once, Apple Pay and Google Pay at the top, your email filled in.</div>`}
</div>
<div class="c"><div class="p" style="font-size:22px">Free <small>· $0</small></div>
<ul><li>Everything on Halo's pages: search, the all-classes calendar, what's next, rubrics</li><li>Syncs whenever you're on Halo</li><li>Grades, GPA, Now, Calendar, Classes</li></ul>
<button class="btn ghost">Stay on Free</button></div>
</div>
<div class="fine">Cancel anytime · plus tax where applicable · nothing charges unless you choose Max</div>
</div></body></html>`;
const br = await chromium.launch({ channel: 'chrome', headless: true });
for (const [name, variant, w, h, phone] of [['7-trial-end-desktop-A', 'A', 1280, 720, false], ['7-trial-end-desktop-B', 'B', 1280, 860, false], ['7-trial-end-phone-A', 'A', 390, 1100, true], ['7-trial-end-phone-B', 'B', 390, 1280, true]]) {
  const pg = await br.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1 });
  await pg.setContent(html(variant, phone), { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await pg.close();
}
await br.close();
console.log('mockups written');
