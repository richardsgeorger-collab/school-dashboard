// The calendar feed on the real backend (2026-10-01): throwaway students, their private link, the deployed calendar
// function read with no sign-in (as Google or Apple Calendar reads it), a new link retiring the old, Free getting the
// paused event, and the Add to my calendar app sheet on desktop and phone, light and dark. Throwaways removed.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-calendar-feed.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/calendar-feed';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const FN = `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/calendar`;
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const events = (ics) => (ics.match(/BEGIN:VEVENT/g) ?? []).length;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const plus = await kit.persona('plus');
  const free = await kit.persona('ended');
  // The trial-ended screen is seen once; seen already here, so the Calendar is what shows.
  const { data: fs } = await kit.db.from('settings').select('data').eq('user_id', free.id).single();
  await kit.db.from('settings').update({ data: { ...fs.data, trialEndSeen: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('user_id', free.id);
  const c = (await kit.signIn(plus.email)).c;
  const { data: f1 } = await c.rpc('my_calendar_feed', { rotate: false });
  check(/^[a-f0-9]{48}$/.test(f1?.token ?? ''), 'a Plus student gets a private calendar link');
  const { data: again } = await c.rpc('my_calendar_feed', { rotate: false });
  check(again.token === f1.token, 'asking again gives the same link');
  // Read the way a calendar app does: no apikey, no sign-in.
  const r = await fetch(`${FN}/${f1.token}.ics`);
  const ics = await r.text();
  check(r.status === 200 && /text\/calendar/.test(r.headers.get('content-type') ?? ''), `the feed answers 200 text/calendar with no sign-in (${r.status} ${r.headers.get('content-type')})`);
  const { count } = await kit.db.from('items').select('id', { count: 'exact', head: true }).eq('user_id', plus.id);
  check(events(ics) > 0 && events(ics) <= count && /SUMMARY:(✓ )?BIO-181: /.test(ics), `${events(ics)} events of ${count} items, titled with the class code`);
  check(/X-WR-CALNAME:Halo\+ deadlines/.test(ics) && ics.endsWith('END:VCALENDAR\r\n'), 'a well-formed calendar named Halo+ deadlines');
  const { data: seen } = await c.rpc('my_calendar_feed', { rotate: false });
  check(!!seen.last_fetched_at, 'Halo+ knows a calendar app read it');
  // Someone else's token never reads this account: the token is the only key.
  check((await fetch(`${FN}/${'0'.repeat(48)}.ics`)).status === 404 && (await fetch(`${FN}/not-a-token.ics`)).status === 404, 'an unknown or malformed link is 404');
  // A new link retires the old one.
  const { data: f2 } = await c.rpc('my_calendar_feed', { rotate: true });
  check(f2.token !== f1.token && (await fetch(`${FN}/${f1.token}.ics`)).status === 404 && (await fetch(`${FN}/${f2.token}.ics`)).status === 200, 'Make a new link: the old one stops, the new one works');
  // Free: the paused event.
  const cf = (await kit.signIn(free.email)).c;
  const { data: ff } = await cf.rpc('my_calendar_feed', { rotate: false });
  const paused = await (await fetch(`${FN}/${ff.token}.ics`)).text();
  check(events(paused) === 1 && /SUMMARY:Halo\+ calendar is paused/.test(paused) && !/BIO-181/.test(paused), 'on Free the feed shows one "paused" event and no deadlines');

  // The sheet.
  for (const [dev, opts] of [['desk', { viewport: { width: 1280, height: 860 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    for (const scheme of ['light', 'dark']) {
      for (const who of [plus, free]) {
        const ctx = await browser.newContext({ ...opts, colorScheme: scheme });
        await ctx.addInitScript(({ s, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, { s: who.session, key: `sb-${ref}-auth-token` });
        await ctx.route('**/functions/v1/report', (rt) => rt.fulfill({ status: 200, body: '{}' }));
        const p = await ctx.newPage();
        await p.goto(`${BASE}#/calendar`, { waitUntil: 'load' });
        const btn = p.locator('button[aria-label="Add to my calendar app"]');
        await btn.waitFor({ timeout: 20000 }).catch(() => undefined);
        const tag = `${dev} ${scheme} ${who === plus ? 'Plus' : 'Free'}`;
        if (who === plus) {
          await p.screenshot({ path: `${OUT}/calendar-button-${dev}-${scheme}.png` });
          // The toolbar fits: its last button stays inside the 16px gutter.
          const right = await p.evaluate(() => Math.max(...[...document.querySelectorAll('.cal-filter-row button')].map((b) => b.getBoundingClientRect().right)));
          check(right <= (dev === 'phone' ? 390 - 12 : 1280), `${tag}: the calendar toolbar fits (${Math.round(right)}px)`);
        }
        await btn.click();
        await p.waitForSelector('.feed', { timeout: 10000 });
        await p.waitForTimeout(1500);
        if (who === plus) {
          const g = await p.locator('a:has-text("Add to Google Calendar")').getAttribute('href');
          const a = await p.locator('a:has-text("Add to Apple Calendar")').getAttribute('href');
          check(/^https:\/\/calendar\.google\.com\/calendar\/r\?cid=webcal%3A%2F%2F/.test(g ?? '') && /^webcal:\/\/.+\/functions\/v1\/calendar\/[a-f0-9]{48}\.ics$/.test(a ?? ''), `${tag}: Google and Apple buttons point at the feed`);
          check(/Google Calendar checks on its own schedule/.test(await p.locator('.feed').innerText()), `${tag}: says honestly how often each app checks`);
        } else {
          check((await p.locator('a:has-text("Add to Google Calendar")').count()) === 0 && /part of Plus/.test(await p.locator('.feed').innerText()), `${tag}: Free sees it is part of Plus, no link`);
        }
        const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        check(!wide, `${tag}: no sideways scroll`);
        await p.screenshot({ path: `${OUT}/sheet-${who === plus ? 'plus' : 'free'}-${dev}-${scheme}.png` });
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
