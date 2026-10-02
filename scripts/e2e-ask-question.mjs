// "Ask a question" on an assignment (George, 2026-10-02), on the real backend with a throwaway Max account and the
// real Haiku answer through the deployed function (never the mock): the button next to Get help on the Now card's
// details and the assignment sheet, the chat opens scoped with an empty focused box and sends nothing by itself, the
// three chips fill the box, a due date is answered from the data, a word count that is not listed is said to be
// missing with Open in Halo, and Free sees the plan wall. Screens: desktop and phone, light and dark.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-ask-question.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/ask-question';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const DEV = { desk: { viewport: { width: 1280, height: 900 } }, phone: { ...devices['iPhone 14'], deviceScaleFactor: 2 } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });

/** One real assignment for the test: due Oct 4 11:59 PM, 100 pts, a rubric, an announcement to-do, and NO length anywhere. */
async function seed(who) {
  const { data: rows } = await db.from('items').select('id, data').eq('user_id', who.id);
  const { data: cs } = await db.from('courses').select('id, data').eq('user_id', who.id);
  const eng = cs.find((c) => c.data.code === 'COM-100') ?? cs[0];
  const row = rows.find((r) => r.data.courseId === eng.id && r.data.status !== 'done');
  const due = '2099-10-04T23:59:00-07:00';
  await db.from('items').update({ data: { ...row.data, title: 'Informative Speech Outline', label: 'Speech outline', type: 'homework', points: 100, dueAt: due, status: 'todo', startedAt: null, snoozedUntil: null,
    notes: 'Write an outline for your informative speech. Include a thesis, three main points and your sources.',
    rubric: { id: 'r1', name: 'Outline rubric', at: new Date().toISOString(), criteria: [{ id: 'k1', name: 'Thesis', description: 'A clear one-sentence thesis', points: 30, levels: [] }, { id: 'k2', name: 'Main points', description: 'Three supported main points', points: 50, levels: [] }, { id: 'k3', name: 'Sources', description: 'At least three credible sources', points: 20, levels: [] }] },
    requirements: [{ id: randomUUID(), text: 'Bring a printed copy to class', dueAt: null, done: false, doneAt: null, gradedOn: false, scope: 'instance', source: { kind: 'announcement', id: 'p1', title: 'Speech week', quote: 'Bring a printed copy of your outline to class.', at: new Date().toISOString() }, addedAt: new Date().toISOString() }] }, updated_at: new Date().toISOString() }).eq('id', row.id);
  return { id: row.id, courseId: eng.id };
}
const open = async (who, dev, scheme, route) => {
  const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}${route}`, { waitUntil: 'load' });
  return { ctx, p };
};
try {
  const max = await kit.persona('max');
  const a = await seed(max);
  const route = `#/ask?c=${a.courseId}&i=${a.id}&m=question`;

  // The button, on the assignment sheet and (via the class page) the same sheet.
  {
    const { ctx, p } = await open(max, 'desk', 'light', '#/now');
    await p.waitForSelector('.hero', { timeout: 20000 });
    await p.waitForTimeout(2500);
    await p.evaluate((h) => { window.location.hash = h; }, `#/class?c=${a.courseId}&i=${a.id}`);
    await p.waitForSelector('.study-row', { timeout: 20000 }).catch(async () => { console.log('     page:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)); throw new Error('no study row'); });
    const row = p.locator('.study-row');
    const names = (await row.locator('a, button').allInnerTexts()).map((t) => t.trim());
    check(names.includes('Get help') && names.includes('Ask a question') && names.indexOf('Ask a question') === names.indexOf('Get help') + 1, `assignment sheet: Ask a question sits right after Get help (${names.join(' | ')})`);
    const href = await row.locator('a:has-text("Ask a question")').getAttribute('href');
    check(href === `#/ask?c=${a.courseId}&i=${a.id}&m=question`, 'its link is the scoped chat');
    await row.screenshot({ path: `${OUT}/button-sheet-desk-light.png` });
    await ctx.close();
  }
  // On Now: the card's details.
  for (const [dev, scheme] of [['desk', 'light'], ['desk', 'dark'], ['phone', 'light'], ['phone', 'dark']]) {
    const { ctx, p } = await open(max, dev, scheme, '#/now');
    await p.waitForSelector('.hero', { timeout: 20000 });
    await p.waitForTimeout(1500);
    // Make the seeded assignment the hero if it is not, by opening it from the list is not needed: use the button on whichever hero is shown.
    const hero = p.locator('.hero').first();
    const det = hero.locator('button:has-text("Details")');
    if (await det.count()) await det.first().click();
    await p.waitForTimeout(500);
    const both = (await hero.locator('button:has-text("Get help")').count()) > 0 && (await hero.locator('button:has-text("Ask a question")').count()) > 0;
    const isTest = (await hero.locator('a:has-text("Practice")').count()) > 0;
    check(both || isTest, `Now (${dev} ${scheme}): the hero shows Get help and Ask a question${isTest ? ' (this hero is a test: Practice)' : ''}`);
    if (both) await hero.screenshot({ path: `${OUT}/button-now-${dev}-${scheme}.png` });
    await ctx.close();
  }

  // The chat: empty focused box, nothing sent, chips fill it.
  {
    const { ctx, p } = await open(max, 'desk', 'light', route);
    await p.waitForSelector('.ask-chips', { timeout: 20000 });
    await p.waitForFunction(() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'Your question', null, { timeout: 15000 }).catch(() => undefined);
    const focused = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(focused === 'Your question' && (await p.inputValue('input[aria-label="Your question"]')) === '', 'the chat opens with an empty, focused box');
    check((await p.locator('.ask-turn').count()) === 0 && (await p.locator('.chat-dots').count()) === 0, 'nothing was sent by itself');
    check(/About: Speech outline/.test(await p.locator('.ask-about').innerText()), 'scoped to that one assignment');
    const chips = (await p.locator('.ask-chips .btn').allInnerTexts()).map((t) => t.trim());
    check(JSON.stringify(chips) === JSON.stringify(['When is it due?', 'How long does it need to be?', 'What does the rubric want?']), `the three chips: ${chips.join(' | ')}`);
    await p.click('.ask-chips .btn:has-text("When is it due?")');
    check((await p.inputValue('input[aria-label="Your question"]')) === 'When is it due?' && (await p.locator('.ask-turn').count()) === 0, 'a chip fills the box and still waits for send');
    await p.click('button[type=submit]:has-text("Ask")');
    await p.waitForSelector('.chat-msg[data-role=assistant]', { timeout: 90000 });
    await p.waitForFunction(() => !document.querySelector('.chat-dots'), null, { timeout: 90000 });
    const due = await p.locator('.chat-msg[data-role=assistant]').last().innerText();
    console.log(`     due answer: ${due.replace(/\s+/g, ' ').slice(0, 220)}`);
    check(/Oct(ober)?\.? 4|Sun/i.test(due) && /11:59/.test(due) && !/Oct(ober)?\.? (3|5)\b/.test(due), 'a due date answered from the data (Sun, Oct 4, 11:59 PM)');
    // Length is not listed anywhere.
    await p.fill('input[aria-label="Your question"]', 'How long does it need to be?');
    await p.click('button[type=submit]:has-text("Ask")');
    await p.waitForFunction(() => document.querySelectorAll('.chat-msg[data-role=assistant]').length >= 2 && !document.querySelector('.chat-dots'), null, { timeout: 90000 });
    const len = await p.locator('.chat-msg[data-role=assistant]').last().innerText();
    console.log(`     length answer: ${len.replace(/\s+/g, ' ').slice(0, 260)}`);
    check(/not (listed|given|stated|specified|included|mentioned)|doesn'?t (say|list|specify|give)|no (word|page|length)/i.test(len) && !/\b\d{2,4}[- ]?(words?|pages?)\b/i.test(len) && !/\b(one|two|three|five|\d)[- ]pages?\b/i.test(len), 'a length that is not listed is said to be missing, no number made up');
    check((await p.locator('.ask-next a:has-text("Open in Halo")').count()) === 1 && /^https:\/\/halo\.gcu\.edu\//.test((await p.locator('.ask-next a:has-text("Open in Halo")').getAttribute('href')) ?? ''), 'Open in Halo is offered under the answer, to a real Halo address');
    await p.fill('input[aria-label="Your question"]', 'What does the rubric want?');
    await p.click('button[type=submit]:has-text("Ask")');
    await p.waitForFunction(() => document.querySelectorAll('.chat-msg[data-role=assistant]').length >= 3 && !document.querySelector('.chat-dots'), null, { timeout: 90000 });
    const rub = await p.locator('.chat-msg[data-role=assistant]').last().innerText();
    console.log(`     rubric answer: ${rub.replace(/\s+/g, ' ').slice(0, 260)}`);
    check(/thesis/i.test(rub) && /sources/i.test(rub), 'the rubric question is answered from the rubric');
    await ctx.close();
  }
  // Screens of the opened chat, empty and with an answer.
  for (const [dev, scheme] of [['desk', 'light'], ['desk', 'dark'], ['phone', 'light'], ['phone', 'dark']]) {
    const { ctx, p } = await open(max, dev, scheme, route);
    await p.waitForSelector('.ask-chips', { timeout: 20000 });
    await p.waitForTimeout(2500);
    await p.locator('.ask-card').scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/chat-${dev}-${scheme}.png` });
    await ctx.close();
  }
  // Same gating as Ask: Free sees the plan wall.
  const free = await kit.persona('ended');
  {
    const { ctx, p } = await open(free, 'desk', 'light', `#/ask?c=${a.courseId}&i=${a.id}&m=question`);
    await p.waitForTimeout(6000);
    const t = await p.locator('.ask').innerText().catch(() => '');
    check(/part of Max|Max/i.test(t) && (await p.locator('input[aria-label="Your question"]:not([disabled])').count()) === 0, 'Free: the same plan wall as Ask, no open box');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
