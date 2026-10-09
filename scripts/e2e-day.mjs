// A normal day with Halo+ (George, 2026-10-08, the quality-of-life loop): a synced Max student opens it in the
// morning, looks at what is due, checks something off, reads an announcement, asks a question, checks grades, looks at
// the Calendar, changes a setting, and comes back after a sync. Desktop and phone. Screens to docs/screens/day/ for a
// look by eye, plus what a script can measure: how long each screen takes to draw, layout shifts after the first
// paint, sideways scroll, and whether choices are remembered after a reload.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-day.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/day';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const notes = [];
const note = (line) => { notes.push(line); console.log(`note ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const DEV = { desk: { viewport: { width: 1280, height: 860 } }, phone: { ...devices['iPhone 14'] } };

/** Draw time for a screen, and the layout shift that happened after it first drew. */
async function screen(p, dev, name, hash, ready) {
  const t0 = Date.now();
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: false }); });
  await p.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await p.waitForSelector(ready, { timeout: 30000 });
  const drawn = Date.now() - t0;
  await sleep(2500);
  const cls = await p.evaluate(() => Number((window.__cls ?? 0).toFixed(3)));
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup', '.ext-setup-sheet button.btn:has-text("Skip for now")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  console.log(`${dev} ${name}: drawn in ${drawn} ms, layout shift ${cls}${wide ? ', SIDEWAYS SCROLL' : ''}`);
  if (drawn > 2500) note(`${dev} ${name} took ${drawn} ms to draw`);
  if (cls > 0.1) note(`${dev} ${name} shifts after drawing (CLS ${cls})`);
  if (wide) note(`${dev} ${name} scrolls sideways`);
  await p.screenshot({ path: `${OUT}/${dev}-${name}.png` });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const dev of ['desk', 'phone']) {
    const s = await kit.persona('max');
    const ctx = await browser.newContext({ ...DEV[dev], colorScheme: 'light' });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    // Morning: Now.
    await screen(p, dev, '1-now', '#/now', '.now-head');
    // What is due: the hero and Then; open the hero's details.
    await p.locator('.hero').locator('text=Details').first().click().catch(() => undefined);
    await sleep(1200);
    await p.screenshot({ path: `${OUT}/${dev}-2-item-detail.png` });
    // Details is a fold on the card itself; fold it back.
    await p.locator('.hero').locator('text=Details').first().click().catch(() => undefined);
    await sleep(300);
    // Check something off from Then (a small thing).
    const thenRow = p.locator('.then .item-list li').first();
    if (await thenRow.count()) {
      const before = await text(p, '.now-title');
      await thenRow.locator('button, [role="button"], a').first().click().catch(() => undefined);
      await sleep(1200);
      await p.screenshot({ path: `${OUT}/${dev}-3-then-open.png` });
      const done = p.locator('.modal button:has-text("Done"), .modal button:has-text("Mark done")').first();
      if (await done.count()) {
        await done.click();
        await sleep(1800);
        await p.screenshot({ path: `${OUT}/${dev}-4-checked-off.png` });
        if ((await p.locator('.modal').count()) > 0) note(`${dev}: the item stays open after Done (a tap to close it)`);
        const ask = await text(p, '.time-ask');
        if (!ask) note(`${dev}: no reward line after a check-off from Then`);
        if ((await p.locator('button:has-text("Undo")').count()) === 0) note(`${dev}: no Undo offered after the check-off`);
      } else note(`${dev}: opening a Then row shows no Done button (${before})`);
      if (await p.locator('.modal-close').count()) await p.locator('.modal-close').first().click();
      await sleep(400);
    }
    // Announcements.
    await screen(p, dev, '5-inbox', '#/inbox', 'main');
    const first = p.locator('.inbox-list li, .post, .announcement').first();
    if (await first.count()) {
      await first.click().catch(() => undefined);
      await sleep(1200);
      await p.screenshot({ path: `${OUT}/${dev}-6-announcement.png` });
    }
    // Ask.
    await screen(p, dev, '7-ask', '#/ask', '.ask-card, .chat-log');
    // Grades.
    await screen(p, dev, '8-grades', '#/grades', 'main');
    // Calendar, then switch to the week view and reload: is the view remembered?
    await screen(p, dev, '9-calendar', '#/calendar', 'main');
    // Agenda or Month: the one chosen last is the one that opens next time.
    const month = p.locator('button:has-text("Month")').first();
    if (await month.count()) {
      await month.click();
      await sleep(800);
      await p.goto('about:blank');
      await p.goto(`${BASE}#/calendar`, { waitUntil: 'load' });
      await sleep(2500);
      const sel = await p.locator('button:has-text("Month")').first().getAttribute('aria-selected').catch(() => null);
      const pressed = await p.locator('button:has-text("Month")').first().getAttribute('aria-pressed').catch(() => null);
      console.log(`${dev} calendar after a fresh open: Month aria-selected=${sel} aria-pressed=${pressed}`);
      if (sel !== 'true' && pressed !== 'true') note(`${dev}: the Calendar forgets the Month view`);
      await p.screenshot({ path: `${OUT}/${dev}-10-calendar-month.png` });
      await p.locator('button:has-text("Agenda")').first().click().catch(() => undefined);
    }
    // A setting: You → Display.
    await screen(p, dev, '11-you', '#/you?s=display', 'main');
    // Back after a sync: a sync lands (a new assignment), then Now again.
    const { data: items } = await db.from('items').select('id, data').eq('user_id', s.id).limit(1);
    const base = items[0].data;
    const fresh = { ...base, id: randomUUID(), haloId: `day-new-${Date.now()}`, title: 'Topic 5 Reading Check', label: 'Topic 5 Reading Check', status: 'todo', score: null, completedAt: null, dueAt: new Date(Date.now() + 4 * 864e5).toISOString() };
    const ins = await db.from('items').insert({ id: fresh.id, user_id: s.id, data: fresh, updated_at: new Date().toISOString() });
    if (ins.error) note(`${dev}: the test's sync insert failed: ${ins.error.message}`);
    // Coming back later: a fresh open (the account pulls on load), not a hash change inside the same page.
    await p.goto('about:blank');
    await screen(p, dev, '12-now-after-sync', '#/now', '.now-head');
    const since = await text(p, '.since-looked-line');
    console.log(`${dev} since you last looked: "${since}"`);
    const probe = await p.evaluate(() => ({ snapshots: Object.keys(localStorage).filter((k) => k.includes('now-snapshot')).map((k) => `${k.slice(-12)}:${Object.keys(JSON.parse(localStorage.getItem(k) || '{"items":{}}').items).length}`), items: JSON.parse(localStorage.getItem('school-dashboard:v1') || '{"items":[]}').items.length, fresh: document.body.innerText.includes('Topic 5 Reading Check') }));
    console.log(`${dev} probe: ${JSON.stringify(probe)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(`\n${notes.length} notes:\n${notes.map((n) => `- ${n}`).join('\n')}`);
