// Friend-link students and the AI tools (2026-09-28): they have Max, and the AI function used to refuse them.
// A real friend link, claimed the real way, then Ask, Practice (a worksheet), Check and Get a prompt through the
// screens, every answer a real Haiku answer through the deployed function. Throwaways removed at the end.
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-friend-ai.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/friend-ai';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const user = async (tag) => {
  const email = `e2e-friendai-${tag}-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, email, c, session: s.session };
};
const CHM = '3d1d0b61-2b14-6d9e-ee6d-aed16fff8ab1';
const SLIDES = [
  "Stoichiometry. The mole is the bridge between mass on a balance and the number of particles. One mole = 6.022 × 10^23 particles (Avogadro's number). Molar mass in g/mol converts grams to moles: n = m / M.",
  'Mole ratios come from the balanced equation. 2 H2 + O2 → 2 H2O means 2 mol H2 react with 1 mol O2 to make 2 mol H2O. The coefficients ARE the ratio; nothing else is.',
  'Mass-to-mass problems: grams of A → moles of A (divide by molar mass) → moles of B (mole ratio) → grams of B (multiply by molar mass). Always write the units at each step.',
  'Limiting reagent: the reactant that runs out first. Convert each reactant to moles of product; the one that gives LESS product is limiting and sets the theoretical yield. The other is in excess.',
  'Example: 10.0 g H2 and 64.0 g O2. H2: 10.0 g / 2.016 g/mol = 4.96 mol → 4.96 mol H2O. O2: 64.0 g / 32.00 g/mol = 2.00 mol → 4.00 mol H2O. O2 is limiting; theoretical yield 4.00 mol H2O = 72.1 g.',
  'Percent yield = (actual yield / theoretical yield) × 100. Actual comes from the lab; theoretical comes from the limiting reagent calculation. Yields above 100% mean the product was wet or impure.',
  'Molarity M = moles of solute / liters of solution. 0.250 mol NaCl in 0.500 L is 0.500 M. Dilution: M1 V1 = M2 V2. Moles of solute do not change when you add water.',
  'Common mistakes on Quiz 2: using grams in a mole ratio, forgetting to balance first, rounding molar masses too early, dropping units. Show every conversion factor on the quiz for credit.',
];
const TRANSCRIPT = [
  "Okay, let's get started. Today we're moving into stoichiometry, which is really the heart of this course. The mole is the bridge between what you can weigh on a balance and how many particles you actually have.",
  'A balanced equation gives you mole ratios. If two moles of hydrogen react with one mole of oxygen, then four moles of hydrogen need two moles of oxygen. The coefficients are the ratio; that is all they are.',
  'When one reactant runs out first, that is the limiting reagent, and it decides how much product you can make. This will be on Quiz 2 and on the exam, so make sure you can do a limiting reagent problem cold.',
  'Percent yield is the actual over the theoretical, times one hundred. In lab your yields will come out under a hundred. If you ever get over a hundred, your product was wet.',
];
const seedMaterial = (page) =>
  page.evaluate(async ({ CHM, SLIDES, TRANSCRIPT }) => {
    const openDb = (name, make) => new Promise((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => make(r.result); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const lib = await openDb('school-dashboard-library', (db) => {
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: ['deckId', 'n'] }).createIndex('byDeck', 'deckId');
    });
    await new Promise((res, rej) => {
      const t = lib.transaction(['decks', 'pages'], 'readwrite');
      t.objectStore('decks').put({ id: 'deck-stoich', courseId: CHM, title: 'Topic 4: Stoichiometry', tag: 'Topic 4', date: '2026-09-23', fileName: 'Topic4_Stoichiometry.pdf', kind: 'pdf', mimeType: 'application/pdf', bytes: 120000, pages: SLIDES.length, chars: SLIDES.join('').length, addedAt: new Date().toISOString(), recordingId: null, fileDeleted: true });
      SLIDES.forEach((text, i) => t.objectStore('pages').put({ deckId: 'deck-stoich', n: i + 1, text }));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    lib.close();
    const rec = await openDb('school-dashboard-recordings', (db) => {
      if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' }).createIndex('byCourse', 'courseId');
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['recordingId', 'seq'] }).createIndex('byRecording', 'recordingId');
      if (!db.objectStoreNames.contains('segments')) db.createObjectStore('segments', { keyPath: ['recordingId', 'seq'] }).createIndex('byRecording', 'recordingId');
    });
    await new Promise((res, rej) => {
      const t = rec.transaction(['recordings', 'segments'], 'readwrite');
      t.objectStore('recordings').put({ id: 'rec-stoich', courseId: CHM, title: 'Lecture: stoichiometry', startedAt: '2026-09-23T15:05:00.000Z', endedAt: '2026-09-23T15:55:00.000Z', status: 'done', durationMs: 3_000_000, bytes: 0, mimeType: 'text/plain', chunkCount: 0, segmentCount: TRANSCRIPT.length, audioDeleted: true, notes: null, processedAt: null, review: {}, kind: 'imported', transcriptSource: 'pasted' });
      TRANSCRIPT.forEach((text, i) => t.objectStore('segments').put({ recordingId: 'rec-stoich', seq: i + 1, at: i * 600_000, text }));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    rec.close();
  }, { CHM, SLIDES, TRANSCRIPT });
// The seeded term must carry the backend address, or the app runs "on this device only" and the account (and its trial) never loads.
const settle = (page) => page.evaluate(({ url, key }) => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.supabaseUrl = url; d.settings.supabaseAnonKey = key; d.settings.theme = 'system'; d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); localStorage.setItem('school-dashboard:home-screen-nudge', 'done'); }, { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY });


const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const george = await user('admin');
  await admin.from('profiles').update({ is_admin: true }).eq('user_id', george.id);
  const { data: code } = await george.c.rpc('create_friend_link', { p_label: 'e2e', p_max_uses: 2, p_until: '2026-12-21T06:59:00.000Z', p_from_name: 'George' });
  const friend = await user('friend');
  const { data: claim } = await friend.c.rpc('claim_friend_link', { p_code: code });
  check(!!claim?.ok, 'the friend claims the link');
  const { data: plan } = await friend.c.rpc('my_plan');
  check(plan === 'max', `the server's one plan answer for the friend: ${plan}`);
  const { data: gplan } = await george.c.rpc('my_plan');
  check(gplan === 'max', `and for an admin: ${gplan}`);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const text = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: friend.session, key: `sb-${ref}-auth-token` });
  await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'load' });
  await settle(page);
  await seedMaterial(page);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000);
  await page.click('.upgrade button:has-text("Skip")', { timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(1000);

  // Ask
  await page.goto(`${BASE}#/ask?q=${encodeURIComponent('What should I work on tonight?')}`, { waitUntil: 'load' });
  await page.waitForSelector('.ask-turn[data-role="assistant"] .chat-msg', { timeout: 90000 }).catch(() => undefined);
  await page.screenshot({ path: `${OUT}/ask.png` });
  const ans = await text('.ask-turn[data-role="assistant"] .chat-msg');
  check(ans.length > 40 && !/plan|Max|upgrade|higher/i.test(ans.slice(0, 60)) && !(await page.$('.chat-msg[data-failed="true"]')), `Ask answers the friend: "${ans.slice(0, 90)}…"`);
  // Practice: a worksheet
  const quiz = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.label === 'Chem Quiz 2').id);
  await page.goto(`${BASE}#/practice?i=${quiz}&k=worksheet`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.click('.kit-setup .btn.primary');
  await page.waitForSelector('.ws-doc, .kit-setup .hint[style]', { timeout: 150000 }).catch(() => undefined);
  await page.screenshot({ path: `${OUT}/practice.png` });
  check((await page.$$eval('.ws-problem', (e) => e.length)) >= 5, 'Practice makes the friend a worksheet');
  // Check
  const essay = await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.label === 'Chem Lab Connections Essay').id);
  await page.goto(`${BASE}#/check?i=${essay}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.fill('.check-text', 'Aspirin is the everyday compound I chose. It is an ester made from salicylic acid and acetic anhydride, and it blocks COX enzymes, which is why it lowers pain and fever.');
  await page.click('.check-card .btn.primary');
  await page.waitForSelector('.check-result, .check-drop .hint[style]', { timeout: 120000 }).catch(() => undefined);
  await page.screenshot({ path: `${OUT}/check.png` });
  check(!!(await page.$('.check-result')), 'Check checks the friend\'s draft');
  // Get a prompt
  await page.click('button:has-text("Get a prompt")').catch(() => undefined);
  await page.waitForFunction(() => (document.querySelector('.panel-prompt')?.textContent ?? '').length > 100, null, { timeout: 30000 }).catch(() => undefined);
  await page.screenshot({ path: `${OUT}/prompt.png` });
  check((await text('.panel-prompt')).length > 100, 'Get a prompt builds the friend a prompt');
  await ctx.close();
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.from('friend_links').delete().eq('created_by', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
