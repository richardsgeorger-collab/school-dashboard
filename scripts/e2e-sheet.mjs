// The assignment sheet (George, 2026-10-08 redesign), on the real backend with a throwaway Max student, desktop and
// phone, light and dark: a big assignment with parts from an announcement and a syllabus prerequisite, a participation
// item, and a hand-added item. Checks: the header's one line and nudge, Done at the top (closes, celebrates, Undo),
// ticking a part writes the same requirement the Now card shows, the folds remember being opened, a hand-added item
// has no empty sections, and on a phone the header, checklist and main action fit without scrolling.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-sheet.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/sheet';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const DEV = { desk: { viewport: { width: 1280, height: 860 } }, phone: { ...devices['iPhone 14'] } };

/** Opens an item's sheet from the Calendar agenda (where participation lives) by its title. */
async function openFromAgenda(p, title) {
  await p.goto(`${BASE}#/calendar?v=agenda`, { waitUntil: 'load' });
  await p.waitForSelector('main', { timeout: 30000 });
  await sleep(1500);
  const row = p.locator('.agenda-item', { hasText: title }).first();
  // The row's title opens its parts (the circle beside it marks it done); then Open.
  await row.getByText(title).first().click();
  await sleep(400);
  await row.locator('.agenda-open').first().click();
  await p.waitForSelector('.modal .sheet', { timeout: 15000 });
  await sleep(900);
}

/** Opens an item's sheet from the class page by its title. */
async function openSheet(p, courseId, title) {
  await p.goto(`${BASE}#/class?c=${courseId}`, { waitUntil: 'load' });
  await p.waitForSelector('main', { timeout: 30000 });
  await sleep(1500);
  for (const sel of ['.ext-setup-sheet button.btn:has-text("Skip for now")', '.joy-card button:has-text("Nice")']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  await p.locator(`main button:has-text("${title}"), main a:has-text("${title}"), main [role="button"]:has-text("${title}")`).first().click();
  await p.waitForSelector('.modal .sheet', { timeout: 15000 });
  await sleep(900);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const s = await kit.persona('max');
  const psy = s.courseIds['PSY-102'];
  const rows = (await db.from('items').select('id, data').eq('user_id', s.id)).data;
  const paper = rows.find((r) => r.data.title === 'Case Study Analysis');
  const part = rows.find((r) => r.data.title === 'Topic 3 Participation' && r.data.courseId === psy);
  // The big assignment: a 100-point paper with what Halo asks, two parts from an announcement, a run-on prerequisite from the syllabus.
  const src = { kind: 'announcement', id: 'sheet-post-1', title: 'Case study details', quote: 'at least three peer-reviewed sources, APA', at: new Date(Date.now() - 2 * 864e5).toISOString() };
  const big = {
    ...paper.data,
    notes: 'Write a 1,200 to 1,500 word analysis of one of the three cases in Topic 3. Use APA format. Identify the research method, its strengths and weaknesses, and one ethical concern. Submit through LopesWrite.',
    requirements: [
      { id: 'sheet-r1', text: 'Cite at least three peer-reviewed sources', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: src.at },
      { id: 'sheet-r2', text: 'Post your chosen case in the forum by Wednesday', dueAt: null, done: true, doneAt: src.at, gradedOn: true, source: src, addedAt: src.at },
    ],
    plan: { asks: 'Write a 1,200 to 1,500 word analysis in APA format. Identify the research method and one ethical concern.', startBy: null, minutes: null, milestones: [], prerequisites: [{ text: 'Claim a case in the Topic 3 forum (syllabus). Read the two assigned articles (syllabus).', source: 'syllabus', itemId: null }], flags: { lopesWrite: true, timed: false, group: false, inPerson: false }, topics: [], feeds: null, sources: [], citations: [], model: 'test', at: src.at, inputHash: 'test' },
    rubric: { criteria: [{ id: 'c1', name: 'Analysis of the method', points: 60, description: 'Strengths, weaknesses, and fit to the question.', levels: [] }, { id: 'c2', name: 'APA and sources', points: 40, description: null, levels: [] }] },
  };
  await db.from('items').update({ data: big, updated_at: new Date().toISOString() }).eq('id', paper.id);
  // The participation item: a line from the week's announcement, so it is on the agenda (attendance-only ones are not).
  await db.from('items').update({ data: { ...part.data, requirements: [{ id: 'sheet-p1', text: 'Reply to two classmates on two different days', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: src.at }] }, updated_at: new Date().toISOString() }).eq('id', part.id);
  // A hand-added item.
  const mine = { id: randomUUID(), courseId: psy, title: 'Email Dr. Raman about office hours', label: 'Email Dr. Raman', labelOverridden: false, type: 'other', points: 0, opensAt: null, dueAt: new Date(Date.now() + 2 * 864e5).toISOString(), estimatedMinutes: 10, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'manual', award: null, updatedAt: new Date().toISOString() };
  await db.from('items').insert({ id: mine.id, user_id: s.id, data: mine, updated_at: new Date().toISOString() });

  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    const tag = `${dev}-${scheme}`;
    const first = dev === 'desk' && scheme === 'light';
    const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    // 1. The big assignment.
    await openSheet(p, psy, 'Case Study Analysis');
    const head = await text(p, '.sheet-head');
    if (first) {
      check(/PSY-102 Paper Due \w{3}, \w{3} \d+ · 100 pts · ~\d+(\.\d)?h/.test(head), `header: "${head.slice(0, 80)}"`);
      check(/Start (today|tomorrow|by)/.test(await text(p, '.sheet-nudge')), `nudge: "${await text(p, '.sheet-nudge')}"`);
      check((await p.locator('.sheet-head .sheet-done.primary').count()) === 1, 'Done is at the top');
      const lines = await p.locator('.sheet-line').allInnerTexts();
      const flat = lines.map((l) => l.replace(/\s+/g, ' ').trim());
      check(flat.some((l) => /1,200 to 1,500 word/.test(l) && /HALO/.test(l)), `what Halo asks, tagged Halo: "${flat.find((l) => /1,200/.test(l))}"`);
      check(flat.some((l) => /Cite at least three peer-reviewed sources/.test(l) && /ANNOUNCEMENT/.test(l)), 'a part from the announcement, tagged');
      check(flat.some((l) => /^Claim a case in the Topic 3 forum SYLLABUS$/.test(l)) && flat.some((l) => /^Read the two assigned articles SYLLABUS$/.test(l)), 'the run-on prerequisite is two short items, no "(syllabus)"');
      check(!flat.some((l) => /\(syllabus\)/.test(l)), 'no "(syllabus)" anywhere');
      check(/1 of [3-7]$/.test(await text(p, '.sheet-todo-head')), `count, a short list: "${await text(p, '.sheet-todo-head')}"`);
      check((await p.locator('.sheet-actions .btn.primary:has-text("Get help")').count()) === 1 && (await p.locator('.sheet-actions-quiet .btn').allInnerTexts()).join('|') === 'Ask a question|Check my work|Get a prompt', 'Get help in gold, the three quiet buttons under it');
      const folds = await p.locator('.fold-head .fold-title').allInnerTexts();
      check(folds.join('|') === 'Steps|Rubric|Full instructions from Halo|Grade impact|Edit details' || folds.join('|') === 'Rubric|Full instructions from Halo|Grade impact|Edit details', `folds, closed: ${folds.join(' | ')}`);
      check((await p.locator('.fold[open]').count()) === 0, 'all folds closed by default');
      check(/2 criteria, 100 pts/.test(await text(p, '.fold[data-fold="rubric"] .fold-meta')), `rubric line: "${await text(p, '.fold[data-fold="rubric"] .fold-meta')}"`);
      check(/skip it: \d+% to \d+%/.test(await text(p, '.fold[data-fold="impact"] .fold-meta')), `grade impact line: "${await text(p, '.fold[data-fold="impact"] .fold-meta')}"`);
      check((await p.locator('.modal .pill').count()) === 0 && (await p.locator('.modal [role="radiogroup"], .modal .segmented').count()) === 0, 'no chips, no three-way status control');
    }
    await p.screenshot({ path: `${OUT}/1-big-${tag}.png` });
    if (dev === 'phone' && scheme === 'light') {
      const fit = await p.evaluate(() => { const a = document.querySelector('.sheet-actions'); const m = document.querySelector('.modal'); return a && m ? a.getBoundingClientRect().bottom <= m.getBoundingClientRect().bottom + 1 && a.getBoundingClientRect().bottom <= window.innerHeight : false; });
      check(fit, 'phone: header, checklist and the main action fit without scrolling');
    }
    if (first) {
      // Tick the announcement part: the same requirement the Now card shows.
      await p.locator('.sheet-line', { hasText: 'Cite at least three' }).locator('input').check();
      await sleep(2500);
      const after = (await db.from('items').select('data').eq('id', paper.id).single()).data.data;
      check(after.requirements.find((r) => r.id === 'sheet-r1').done === true, 'ticking a part writes the requirement (the Now card reads the same)');
      check(/2 of [3-7]$/.test(await text(p, '.sheet-todo-head')), `count moves: "${await text(p, '.sheet-todo-head')}"`);
      // Tick what Halo asks (a line without a requirement behind it).
      await p.locator('.sheet-line', { hasText: '1,200 to 1,500' }).locator('input').check();
      await sleep(2500);
      check(((await db.from('items').select('data').eq('id', paper.id).single()).data.data.askDone ?? []).length === 1, 'ticking what Halo asks is kept too');
      // Open two folds, close the sheet, reopen: remembered.
      await p.locator('.fold[data-fold="rubric"] .fold-head').click();
      await p.locator('.fold[data-fold="impact"] .fold-head').click();
      await sleep(400);
      await p.screenshot({ path: `${OUT}/1b-big-folds-open-${tag}.png` });
      await p.locator('.modal-close').click();
      await sleep(500);
      await openSheet(p, psy, 'Case Study Analysis');
      const openNow = await p.locator('.fold[open]').evaluateAll((els) => els.map((e) => e.dataset.fold));
      check(openNow.join('|') === 'rubric|impact', `reopened: the folds opened last time are open (${openNow.join(', ')})`);
      // In progress is a small option; Done at the top closes and celebrates.
      await p.locator('.sheet-quiet button:has-text("Mark in progress")').click();
      await sleep(800);
      check(/In progress/.test(await text(p, '.sheet-quiet')), 'Mark in progress is one small tap');
      await p.locator('.sheet-head .sheet-done').click();
      await sleep(1800);
      check((await p.locator('.modal .sheet').count()) === 0, 'Done closes the sheet');
      const reward = await text(p, '.time-ask');
      check(/\+100 pts done/.test(reward) && (await p.locator('.time-ask button:has-text("undo")').count()) === 1, `the reward line and Undo: "${reward.slice(0, 60)}"`);
      // A 100-point check-off can bring a level-up card over everything; it goes with a tap.
      if (await p.locator('.levelup').count()) await p.locator('.levelup').click().catch(() => undefined);
      await sleep(600);
      await p.locator('.time-ask button:has-text("undo")').first().click();
      await sleep(1500);
      check((await db.from('items').select('data').eq('id', paper.id).single()).data.data.status !== 'done', 'Undo brings it back');
    }
    // 2. Participation.
    await openFromAgenda(p, 'Topic 3 Participation');
    if (first) {
      check(/What earns the points/.test(await text(p, '.sheet-todo-head')), `participation: "${await text(p, '.sheet-todo-head')}"`);
      check(/Reply to two classmates/.test(await text(p, '.sheet-todo')) && (await p.locator('.sheet-todo input[type="checkbox"]').count()) >= 1, 'participation: its lines are the checklist');
      check(['Grade impact|Edit details', 'Edit details'].includes((await p.locator('.fold-head .fold-title').allInnerTexts()).join('|')), `participation folds, nothing empty: ${(await p.locator('.fold-head .fold-title').allInnerTexts()).join(' | ')}`);
    }
    await p.screenshot({ path: `${OUT}/2-participation-${tag}.png` });
    await p.locator('.modal-close').click();
    // 3. The hand-added item.
    await openSheet(p, psy, 'Email Dr');
    if (first) {
      check((await p.locator('.sheet-todo').count()) === 0, 'hand-added: no empty "What to do"');
      check((await p.locator('.fold-head .fold-title').allInnerTexts()).join('|') === 'Edit details', `hand-added folds: ${(await p.locator('.fold-head .fold-title').allInnerTexts()).join(' | ')}`);
      check(/PSY-102 Other Due \w{3}, \w{3} \d+( \d+:\d\d [AP]M)? · ~10m/.test(await text(p, '.sheet-head')), `hand-added header: "${(await text(p, '.sheet-head')).slice(0, 60)}"`);
      // Edit details still saves.
      await p.locator('.fold[data-fold="edit"] .fold-head').click();
      await p.fill('.sheet-form input[required]', 'Email Dr. Raman about office hours this week');
      await p.locator('.sheet-form button:has-text("Save changes")').click();
      await sleep(4000);
      const savedRow = (await db.from('items').select('data').eq('id', mine.id).single()).data.data;
      check(savedRow.title === 'Email Dr. Raman about office hours this week', `Edit details → Save changes still writes (title now "${savedRow.title}", label "${savedRow.label}", sheet open: ${await p.locator('.modal .sheet').count()})`);
      await openSheet(p, psy, 'Email Dr');
    }
    await p.screenshot({ path: `${OUT}/3-hand-added-${tag}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
