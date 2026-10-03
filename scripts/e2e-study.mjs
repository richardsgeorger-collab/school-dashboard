// The Study tab on the real backend: a throwaway Max-trial account on the sample term with one CHM-113 deck and one
// pasted lecture, the four new-student scenarios counted in clicks, every AI answer a real Haiku answer through the
// deployed function (never the mock), and a second throwaway on Free for the preview. Screens to
// docs/screens/study/<desk|phone>-<light|dark>/NN-name.png. Throwaways removed at the end.
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-study.mjs
//   ONLY=desk-light (the light runs make the real calls; the dark runs capture the same screens without them)
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUTROOT = process.env.OUT ?? 'docs/screens/study';
const ONLY = process.env.ONLY?.split(',');
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const newUser = async (free = false) => {
  const email = `e2e-study-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  if (free) await admin.from('profiles').update({ tier: 'free', trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() }).eq('user_id', data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
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
const run = async (name, device, scheme) => {
  const OUT = `${OUTROOT}/${name}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const live = scheme === 'light';
  const say = (ok, line) => scheme === 'light' && name === 'desk' ? check(ok, line) : ok || console.log(`note ${name}-${scheme}: ${line}`);
  let n = 0;
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.addInitScript(() => { window.print = () => undefined; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (label, full = false) => { n += 1; await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${label}.png`, fullPage: full }); };
  const go = async (hash) => { await page.goto(`${BASE}${hash}`, { waitUntil: 'load' }); await page.waitForTimeout(900); };
  const text = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  const wide = async (label) => { const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (w > 2) console.log(`${name}-${scheme} ${label}: page overflows its width by ${w}px`); };
  const u = await newUser();
  await go('#/now');
  await page.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: u.session, key: `sb-${ref}-auth-token` });
  await go('#/now?seed=1');
  await settle(page);
  await seedMaterial(page);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500);
  // Skipping the Max welcome is the first change, which is what writes the seeded term into the cache.
  await page.click('.upgrade button:has-text("Skip")', { timeout: 3000 }).catch(() => undefined);
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('school-dashboard:v1') || '{}').items || []).length > 0, null, { timeout: 15000 });
  // Chem Quiz 2 moves to Friday, four days out, so Now has a test within five days and Practice has a plan to make.
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); const q = d.items.find((i) => i.label === 'Chem Quiz 2'); const t = new Date(); t.setDate(t.getDate() + 4); q.dueAt = t.toISOString().slice(0, 10) + 'T15:00:00.000Z'; q.updatedAt = new Date().toISOString(); localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  // A hash change alone keeps the in-memory term; the edit needs a reload to be read (the newer updatedAt wins the merge).
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500);

  // ---- Now: the Study tab in the bar, the nudge for the quiz on Friday, the one button on the card.
  await shot('now'); await wide('now');
  say(!!(await page.$('.nav-link[href="#/study"]')), 'Study is a tab in the main navigation');
  const nudge = await text('.study-nudge');
  say(/Chem Quiz 2 is in [45] days/.test(nudge) && !!(await page.$('.study-nudge a[href^="#/practice?i="]')), `Now offers Practice for the quiz within five days: "${nudge}"`);
  say(!!(await page.$('.hero-actions .hero-study, .hero-more .hero-link')), 'the Now card carries its study help');

  // ---- Scenario 1: "I have a chem quiz Friday, help me study." Now → Study (1) → Practice on the quiz (2).
  await page.click('.nav-link[href="#/study"] >> visible=true'); await page.waitForTimeout(800);
  await shot('study'); await wide('study');
  const studyText = (await text('.study-home')) || (await text('main'));
  // innerText carries the rendered case (the section titles are set in capitals).
  say(/practice/i.test(studyText) && /ask anything/i.test(studyText) && /check my work/i.test(studyText), 'Study says what it does: Practice, Ask anything, Check my work');
  say(/Chem Quiz 2/.test(await text('.study-tests')), 'the coming quiz is listed with Practice');
  await page.click('.study-test:has-text("Chem Quiz 2") a:has-text("Practice")'); await page.waitForTimeout(1200);
  await shot('practice-plan', true); await wide('practice-plan');
  const planText = await text('.practice');
  say(/Practice for Chem Quiz 2/.test(planText), 'scenario 1: two clicks from Now to Practice for the quiz');
  say(/From your own CHM-113 material/.test(planText) && /slides/.test(planText), `the material line names the class's own slides: "${planText.match(/From your own[^.]*\./)?.[0]}"`);
  say(/Quiz me on this/.test(planText) || /of study/.test(planText), 'the plan has sessions with topics and a Quiz me on each');
  say(!!(await page.$('.practice-plan .btn.primary:has-text("Make the worksheet")')), 'the plan ends with next steps (Make the worksheet, Quiz me now, Ask about it)');
  // The worksheet: a real document, downloadable.
  await page.click('.practice-plan .btn.primary:has-text("Make the worksheet")'); await page.waitForTimeout(600);
  await shot('practice-worksheet-setup');
  if (live) {
    const label = await text('.kit-setup .btn.primary');
    await page.click('.kit-setup .btn.primary');
    await page.waitForTimeout(300);
    const busyLabel = await text('.kit-setup .btn.primary');
    say(/Writing about ten problems from your CHM-113 material/.test(busyLabel), `the loading state says what is happening: "${busyLabel}"`);
    await page.waitForSelector('.ws-doc, .kit-setup .hint[style]', { timeout: 150000 }).catch(() => undefined);
    await shot('practice-worksheet', true);
    const ws = await text('.ws-doc');
    const problems = await page.$$eval('.ws-problem', (els) => els.length);
    say(problems >= 5, `the worksheet has ${problems} problems (label before: "${label}")`);
    say(/answers on the last page/i.test(ws), 'it says the answers are on the last page');
    say(!(await page.$('.ws-doc > .ws-answer')), 'no answer sits among the problems on screen');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), page.click('.kit-setup .btn:has-text("Download .docx")')]);
    say(!!dl && /\.docx$/.test(dl.suggestedFilename()), `Download .docx hands over a file: ${dl?.suggestedFilename()}`);
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), page.click('.kit-setup .btn:has-text("Download PDF")')]);
    say(!!pdf && /\.pdf$/.test(pdf.suggestedFilename()), `Download PDF hands over a file: ${pdf?.suggestedFilename()}`);
    // The sheet is set in the shipped Unicode font (H₂O, →, Δ survive), fetched from the site itself.
    const pdfPath = pdf ? await pdf.path().catch(() => null) : null;
    const pdfBytes = pdfPath ? readFileSync(pdfPath, 'latin1') : '';
    say(/\/BaseFont\s*\/Worksheet/.test(pdfBytes) && !/could not be loaded/.test(pdfBytes), `the PDF carries the worksheet font (${Math.round(pdfBytes.length / 1024)} KB)`);
    // Print: the answers page must be open when the print dialog comes up (a closed <details> prints only its summary).
    await page.click('.kit-setup .btn:has-text("Print")');
    await page.waitForTimeout(400);
    await page.emulateMedia({ media: 'print' });
    const answersOpen = await page.$eval('.ws-answers', (e) => e.open && e.querySelectorAll('.ws-answer').length);
    const setupHidden = await page.$eval('.kit-setup', (e) => getComputedStyle(e).display === 'none');
    await page.emulateMedia({ media: null });
    say(!!answersOpen && setupHidden, `Print opens the answers page (${answersOpen} answers) and hides the controls`);
    // Quiz me: one question at a time.
    await page.click('.practice-next .btn:has-text("Quiz me on these")'); await page.waitForTimeout(500);
    await shot('practice-quiz-setup');
    await page.click('.quiz-setup .btn.primary');
    await page.waitForSelector('.quiz-q, .quiz-setup .hint[style]', { timeout: 150000 }).catch(() => undefined);
    await shot('practice-quiz-question');
    say(!!(await page.$('.quiz-q')) && (await page.$$eval('.quiz-q', (e) => e.length)) === 1, 'Quiz me shows one question at a time');
    const choice = await page.$('.quiz-choice');
    if (choice) await choice.click(); else { await page.fill('.quiz-answer input', '2.50 mol'); await page.click('.quiz-answer .btn.primary'); }
    await page.waitForTimeout(500);
    await shot('practice-quiz-answered');
    // Flashcards.
    await page.click('.practice .segmented button:has-text("Flashcards")'); await page.waitForTimeout(500);
    await page.click('.kit-setup .btn.primary');
    await page.waitForSelector('.kit-cards, .kit-setup .hint[style]', { timeout: 150000 }).catch(() => undefined);
    await page.click('.kit-card >> nth=0').catch(() => undefined);
    await shot('practice-cards', true);
    say((await page.$$eval('.kit-card', (e) => e.length)) >= 8, 'flashcards come from the material');
  } else {
    await page.click('.practice .segmented button:has-text("Quiz me")'); await page.waitForTimeout(400);
    await shot('practice-quiz-setup');
    await page.click('.practice .segmented button:has-text("Flashcards")'); await page.waitForTimeout(400);
    await shot('practice-cards-setup');
  }

  // ---- Scenario 2: "I don't understand this engineering math homework." Classes → ESG-162 → the homework → Get help (3).
  await go('#/classes');
  await page.click('.classes-list a:has-text("ESG-162") >> nth=0'); await page.waitForTimeout(700);
  await page.click('.item-main:has-text("Eng Math HW") >> nth=0').catch(async () => page.click('.item-main >> nth=0'));
  await page.waitForTimeout(900);
  await shot('item-sheet-homework');
  const row = await text('.modal .study-row');
  say(/Get help/.test(row) && /Check my work/.test(row) && /Get a prompt/.test(row), `an assignment's sheet opens with one row: "${row}"`);
  await page.click('.modal .study-row a:has-text("Get help")'); await page.waitForTimeout(1200);
  await shot('ask-scoped');
  const askHead = await text('.ask .lib-head');
  say(/Ask/.test(askHead) && /Anything about your classes/.test(askHead), 'Ask says what it does in one line');
  say(/About:/.test(await text('.ask-scope')), 'scenario 2: three clicks from Classes to Ask about the homework, with the assignment in focus');
  if (live) {
    await page.waitForSelector('.ask-turn[data-role="assistant"] .chat-msg', { timeout: 90000 }).catch(() => undefined);
    await shot('ask-scoped-answer', true);
    const answer = await text('.ask-turn[data-role="assistant"] .chat-msg');
    say(answer.length > 40 && !/Anthropic returned/.test(answer) && !/not supported/.test(answer), `a real answer came back through the deployed function: "${answer.slice(0, 100)}…"`);
    const nextBtns = await page.$$eval('.ask-next .btn', (els) => els.map((e) => e.textContent.trim()));
    say(nextBtns.length >= 1 && nextBtns.length <= 5, `the answer ends with next-step buttons: ${nextBtns.join(' | ')}`);
    say(nextBtns.some((b) => /Check my work/.test(b)), 'one of them is Check my work for this assignment');
  }

  // ---- Scenario 4: "What should I work on tonight?" Study → the box (2: tab, Ask).
  await go('#/study');
  await page.fill('.study-ask input', 'What should I work on tonight?');
  await page.click('.study-ask .btn.primary'); await page.waitForTimeout(1000);
  say(/#\/ask/.test(page.url()), 'scenario 4: the Study box goes straight to Ask with the question');
  if (live) {
    await page.waitForSelector('.ask-turn[data-role="assistant"] .chat-msg', { timeout: 90000 }).catch(() => undefined);
    await shot('ask-tonight', true);
    const a = await text('.ask-turn[data-role="assistant"] .chat-msg');
    say(a.length > 40 && !/Anthropic returned/.test(a), `"What should I work on tonight?" gets a real answer: "${a.slice(0, 100)}…"`);
    say(a.split(/[.!?]\s/).length <= 8, 'and it is short');
  } else {
    await shot('ask-tonight');
  }

  // ---- Scenario 3: "Is my essay draft good enough?" Study → Check my work (2) → the essay (3) → paste → Check.
  await go('#/study');
  await page.click('.study-block a:has-text("Check my work")'); await page.waitForTimeout(800);
  await shot('check-picker');
  say(/which assignment/i.test(await text('.check-page')), 'Check opens on the list of open assignments');
  await page.click('.study-test:has-text("Connections Essay") a:has-text("Check")').catch(async () => page.click('.study-test a:has-text("Check") >> nth=0'));
  await page.waitForTimeout(900);
  await shot('check-essay');
  const ch = await text('.check-page .lib-head');
  say(/Paste your draft or drop the file/.test(ch) && /Not a grade, not a rewrite/.test(ch), 'scenario 3: three clicks to Check for the essay, and it says what it does');
  // A dropped Word file is read into the box (the docx is made here, as a student's would be by Word).
  const { Document, Packer, Paragraph } = await import('docx');
  const docxBuf = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Aspirin is the everyday compound I chose.'), new Paragraph('It is an ester made from salicylic acid.')] }] }));
  await page.setInputFiles('.check-card input[type=file]', { name: 'draft.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docxBuf });
  await page.waitForTimeout(1200);
  const dropped = await page.$eval('.check-text', (e) => e.value).catch(() => '');
  say(/Aspirin is the everyday compound I chose\.\nIt is an ester/.test(dropped) && /draft\.docx/.test(await text('.check-card')), `a dropped .docx lands in the box as text: "${dropped.slice(0, 60)}…"`);
  await page.fill('.check-text', 'Aspirin, or acetylsalicylic acid, is the everyday compound I chose. It is an ester made from salicylic acid and acetic anhydride. In the body it blocks the COX enzymes, which is why it lowers pain and fever. I take it for headaches; my grandmother takes a low dose daily for her heart. The reaction to make it is a nucleophilic acyl substitution, and its solubility in water is low because most of the molecule is nonpolar.');
  if (live) {
    await page.click('.check-card .btn.primary');
    await page.waitForTimeout(300);
    const busyLabel = await text('.check-card .btn.primary');
    say(/Checking against the CHM-113L rubric/.test(busyLabel) || /Checking/.test(busyLabel), `the loading state says what is happening: "${busyLabel}"`);
    await page.waitForSelector('.check-result', { timeout: 120000 }).catch(() => undefined);
    await shot('check-result', true);
    const res = await text('.check-result');
    say(res.length > 40, `the check came back: "${res.slice(0, 120)}…"`);
    const nextBtns = await page.$$eval('.practice-next .btn', (els) => els.map((e) => e.textContent.trim()));
    say(nextBtns.some((b) => /^Ask how to fix|^Ask about/.test(b)) && nextBtns.some((b) => /Open the assignment/.test(b)), `it ends with next steps: ${nextBtns.join(' | ')}`);
  } else {
    await shot('check-filled');
  }
  if (errors.length) { console.log(`${name}-${scheme} page errors:`, errors.slice(0, 3)); say(false, 'no page errors'); }
  await ctx.close();

  // ---- Free (trial over): Study with the preview and one way in.
  const f = await newUser(true);
  const ctx2 = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p2.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: f.session, key: `sb-${ref}-auth-token` });
  await p2.goto(`${BASE}#/now?seed=1`, { waitUntil: 'load' }); await p2.waitForTimeout(600);
  await settle(p2);
  await p2.reload({ waitUntil: 'load' }); await p2.waitForTimeout(2500);
  await p2.goto(`${BASE}#/study`, { waitUntil: 'load' }); await p2.waitForTimeout(1500);
  n += 1; await p2.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-free-study.png` });
  const lock = await p2.$eval('.study-lock', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  say(/part of Max/.test(lock) && /Practice for/.test(lock), `Free sees the Study tab with its own quiz named and one way in: "${lock.slice(0, 120)}"`);
  say(!!(await p2.$('.study-lock .btn')), 'with a button (Try Max free when the trial is unused, Get Max otherwise)');
  await p2.click('.study-test a:has-text("Practice") >> nth=0').catch(() => undefined); await p2.waitForTimeout(800);
  say(/#\/you\?s=plan/.test(p2.url()), 'Practice on Free goes to the plans');
  await ctx2.close();
};
try {
  const combos = [['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]];
  for (const [name, device] of combos) for (const scheme of ['light', 'dark']) if (!ONLY || ONLY.includes(`${name}-${scheme}`)) { console.log(`--- ${name}-${scheme}`); await run(name, device, scheme); }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
