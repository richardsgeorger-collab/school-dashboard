// The full sweep (George, 2026-09-30): every screen, sheet, menu and onboarding step on desktop, phone and iPad, light
// and dark, audited in the page for text cut off or running off the edge, monospace where it should not be, sheets
// that do not scroll, buttons covered by something else, and text clipped vertically. Screens to
// docs/screens/sweep/<device>-<scheme>/<scene>.png and the findings to docs/screens/sweep/report.json. Real backend,
// throwaway accounts: one synced account (six classes, as George's test account) and one brand-new one per device
// for onboarding.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ [ONLY=desk-light] [SCENES=now,you] node scripts/e2e-sweep.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BUILD = await currentBuild(BASE);
const ONLY = process.env.ONLY?.split(',');
const SCENES_ONLY = process.env.SCENES?.split(',');
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const OUT = 'docs/screens/sweep';
const DAY = 86_400_000;
const made = [];
const report = [];

const newUser = async () => {
  const email = `e2e-sweep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};

// ---- A synced term: six classes as George's test account, a spread of work.
const due = (n, hhmm = '23:59') => `${new Date(Date.now() - 7 * 3_600_000 + n * DAY).toISOString().slice(0, 10)}T${hhmm}:00-07:00`;
const COURSES = [
  { code: 'CHM-113', name: 'General Chemistry I-Lecture', color: '#D95D39', halo: 'hc-chm', slug: 'CHM-113-WF700A-20260908', meetings: [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }], online: false, grade: { letter: 'A', percent: 95, points: 190, maxPoints: 200 } },
  { code: 'CHM-113L', name: 'General Chemistry I-Lab', color: '#2F6FDB', halo: 'hc-chml', slug: 'CHM-113L-M600A-20260908', meetings: [{ day: 1, start: '18:00', end: '20:50' }], online: false, grade: { letter: 'B-', percent: 82.02, points: 176.34, maxPoints: 215 } },
  { code: 'ENG-105', name: 'English Composition I', color: '#1F9E89', halo: 'hc-eng', slug: 'ENG-105-ONL4-20260914', meetings: [], online: true, grade: { letter: 'B', percent: 85, points: 127.5, maxPoints: 150 } },
  { code: 'ESG-162', name: 'Engineering Math', color: '#7A5AD0', halo: 'hc-esg', slug: 'ESG-162-MW100A-20260908', meetings: [{ day: 1, start: '13:00', end: '14:15' }, { day: 3, start: '13:00', end: '14:15' }], online: false, grade: { letter: 'A', percent: 97.7, points: 127, maxPoints: 130 } },
  { code: 'ESG-162L', name: 'Engineering Math Lab', color: '#C9459A', halo: 'hc-esgl', slug: 'ESG-162L-T1230A-20260908', meetings: [{ day: 2, start: '12:30', end: '15:20' }], online: false, grade: { letter: 'A-', percent: 92.6, points: 88, maxPoints: 95 } },
  { code: 'UNV-106', name: 'University On-Campus Success', color: '#B8860B', halo: 'hc-unv', slug: 'UNV-106-TOENGN05-20260908', meetings: [], online: true, grade: { letter: 'B+', percent: 88.1, points: 264.19, maxPoints: 300 } },
];
const ITEMS = [
  ['CHM-113', 'Topic 5 Homework', 'homework', 20, 2, 'todo'], ['CHM-113', 'Quiz 2', 'quiz', 50, 4, 'todo'], ['CHM-113', 'Topic 4 Homework', 'homework', 20, -3, 'done'], ['CHM-113', 'Week 5 Participation', 'participation', 5, 3, 'todo'],
  ['CHM-113L', 'Stoichiometry Lab', 'lab', 30, 1, 'todo'], ['CHM-113L', 'Formal Lab Report on Thermochemistry and Calorimetry', 'paper', 75, 9, 'todo'], ['CHM-113L', 'Solutions Lab', 'lab', 30, -6, 'done'],
  ['ENG-105', 'Final Draft of an Op-Ed Assignment (Online)', 'paper', 100, 6, 'in_progress'], ['ENG-105', 'Topic 4 DQ 1: Rhetorical Situation', 'discussion', 10, 0, 'todo'], ['ENG-105', 'Topic 3 Participation', 'participation', 5, -1, 'todo'],
  ['ESG-162', 'MATLAB: Vectors', 'homework', 20, 3, 'todo'], ['ESG-162', 'Excel: Microchip Manufacturing', 'homework', 20, -8, 'done'],
  ['ESG-162L', 'CLC – Sensor Lab 1', 'project', 40, 7, 'todo'],
  ['UNV-106', 'Topic 1 Quiz', 'quiz', 10, 1, 'todo'], ['UNV-106', 'AI-Assisted Career Reflection', 'homework', 25, 12, 'todo'],
];
const ANN = [
  ['CHM-113', 'Quiz 2 moved to Friday', '<p>Quiz 2 is moved to Friday. Bring a calculator and submit your practice set by Thursday at midnight.</p>'],
  ['ENG-105', 'Op-ed drafts', '<p>Reply to two classmates on the Topic 4 DQ by Sunday. Great work on the rhetorical analyses so far.</p>'],
];
const seedSynced = async (u) => {
  const now = new Date().toISOString();
  const ids = Object.fromEntries(COURSES.map((c) => [c.code, randomUUID()]));
  await admin.from('courses').insert(COURSES.map((c) => ({ id: ids[c.code], user_id: u.id, updated_at: now, data: { id: ids[c.code], code: c.code, name: c.name, color: c.color, credits: 3, instructors: [{ name: 'Dr. Example', email: '' }], meetings: c.meetings, meetingsFrom: c.meetings.length ? 'section' : null, online: c.online, haloClassId: c.halo, haloSlugId: c.slug, haloGrade: { ...c.grade, at: now }, termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: now } })));
  const items = ITEMS.map(([code, title, type, points, n, status], i) => { const id = randomUUID(); return { id, user_id: u.id, updated_at: now, data: { id, courseId: ids[code], title, label: title, labelOverridden: false, type, points, opensAt: null, dueAt: due(n), estimatedMinutes: type === 'paper' ? 180 : type === 'lab' ? 100 : 45, estimateOverridden: false, startByOverride: null, status, completedAt: status === 'done' ? due(n - 1) : null, score: status === 'done' ? Math.round(points * 0.9) : null, notes: '', topic: null, flags: { inClass: type === 'lab', group: false, lopesWrite: false, timed: type === 'quiz', practice: false }, source: 'halo', haloId: `a-${i}`, award: null, updatedAt: now } }; });
  await admin.from('items').insert(items);
  await admin.from('announcements').insert(ANN.map(([code, title, content], i) => { const id = `sweep-post-${i}`; const publishedAt = new Date(Date.now() - (i + 1) * DAY).toISOString(); return { id, user_id: u.id, course_id: ids[code], published_at: publishedAt, updated_at: now, data: { id, forumId: `f-${code}`, title, content, publishedAt, modifiedAt: null, author: 'Dr. Example', mustAcknowledge: false, acknowledged: false, resources: [], courseId: ids[code], text: content.replace(/<[^>]+>/g, ''), pulledAt: now, readAt: null, processedAt: null, findings: null, review: {}, actionsAt: null, actionsModifiedAt: null, actionsSummary: null, actionCount: null } }; }));
  const settings = { timezone: 'America/Phoenix', syncHow: 'desktop', lastPull: { at: new Date(Date.now() - 3_600_000).toISOString(), build: BUILD, counts: { classes: 6, assessments: 15, announcements: 2 } }, onboarding: { startedAt: new Date(Date.now() - 2 * DAY).toISOString(), step: 'done', doneAt: new Date(Date.now() - 2 * DAY).toISOString(), skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' }, reminders: { pushEnabled: false } };
  await admin.from('settings').upsert({ user_id: u.id, updated_at: now, data: settings });
  await admin.from('profiles').update({ trial_started_at: new Date(Date.now() - 2 * DAY).toISOString(), trial_ends_at: new Date(Date.now() + 5 * DAY).toISOString() }).eq('user_id', u.id);
  return { settings, ids };
};
const payload = () => ({ kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'], classes: COURSES.map((c) => ({ id: c.halo, slugId: c.slug, classCode: c.slug.replace(/-\d{8}$/, ''), courseCode: c.code, name: c.name, instructors: ['Dr. Example'], startDate: '2026-09-08', endDate: '2026-12-20', stage: 'CURRENT', modality: c.online ? 'ONLINE' : 'ONGROUND', credits: 3, finalGrade: { letter: c.grade.letter, points: c.grade.points, maxPoints: c.grade.maxPoints, published: true }, assessments: ITEMS.filter((i) => i[0] === c.code).map(([, title, type, points, n], i) => ({ id: `${c.halo}-${i}`, title, dueDate: new Date(due(n)).toISOString(), points, type: type === 'quiz' ? 'QUIZ' : type === 'discussion' ? 'DISCUSSION_QUESTION' : type === 'participation' ? 'PARTICIPATION' : 'ASSIGNMENT', status: null, score: null, description: '' })), announcements: ANN.filter((a) => a[0] === c.code).map(([, title, content], i) => ({ id: `${c.halo}-p${i}`, forumId: `f-${c.code}`, title, content, publishedAt: new Date(Date.now() - DAY).toISOString(), modifiedAt: null, author: 'Dr. Example', mustAcknowledge: false, acknowledged: false, resources: [] })), resources: [], discussions: [], messages: [] })) });

// ---- The audit, run inside the page. Scoped to the topmost sheet when one is open, else the onboarding screen, else the page.
const AUDIT = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const issues = [];
  const desc = (el) => { const cls = [...el.classList].slice(0, 3).join('.'); const t = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60); return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (el.id ? '#' + el.id : '') + ' "' + t + '"'; };
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const scrollsX = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll)/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1) return true; } return false; };
  const clipsX = (el) => { for (let a = el; a; a = a.parentElement) { const cs = getComputedStyle(a); if (/(hidden|clip)/.test(cs.overflowX)) return a; } return null; };
  const modals = [...document.querySelectorAll('.modal')];
  const modal = modals.length ? modals[modals.length - 1] : null;
  const pop = document.querySelector('[role="menu"], .notnow-pop, .palette');
  const onboard = document.querySelector('.onboard');
  const scope = modal || onboard || document.body;
  if (!modal && document.documentElement.scrollWidth > vw + 1) issues.push({ kind: 'page-overflow', what: 'the page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + vw });
  for (const el of scope.querySelectorAll('*')) {
    if (el instanceof SVGElement && el.tagName !== 'svg') continue;
    if (!visible(el)) continue;
    if (el.closest('details:not([open])') && !el.matches('summary, summary *')) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const text = hasText(el);
    if (r.right > vw + 1 && r.left < vw && !scrollsX(el) && (text || /^(BUTTON|A|INPUT|SELECT)$/.test(el.tagName))) issues.push({ kind: 'off-edge', what: desc(el), by: Math.round(r.right - vw) });
    if (text && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && (/(hidden|clip)/.test(cs.overflowX) || (cs.whiteSpace === 'nowrap' && clipsX(el)))) issues.push({ kind: 'cut-off', what: desc(el), by: el.scrollWidth - el.clientWidth });
    if (text && /mono|Menlo|Courier/i.test(cs.fontFamily)) issues.push({ kind: 'mono', what: desc(el), cls: String(el.className) || String(el.parentElement && el.parentElement.className || '') });
    if (text && /(hidden|clip)/.test(cs.overflowY) && cs.webkitLineClamp === 'none' && el.scrollHeight > el.clientHeight + 4) issues.push({ kind: 'clipped-vertical', what: desc(el), by: el.scrollHeight - el.clientHeight });
    if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw && !(pop && !pop.contains(el))) {
      let hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !modal) {
        // Under a fixed bar: only covered if it stays covered once scrolled into view.
        const y = window.scrollY; el.scrollIntoView({ block: 'center' }); const r2 = el.getBoundingClientRect();
        hit = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2); window.scrollTo(0, y);
      }
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) issues.push({ kind: 'covered', what: desc(el), by: desc(hit) });
    }
  }
  for (const m of modals) { const cs = getComputedStyle(m); if (m.scrollHeight > m.clientHeight + 2 && !/(auto|scroll)/.test(cs.overflowY)) issues.push({ kind: 'no-scroll', what: desc(m).slice(0, 40) }); }
  return issues;
})()`;
// Monospace on purpose: codes, chips, counts and dates in the top bar, the ledger, raw Halo lines.
const MONO_OK = /(^|\s)(mono|chip|grade-stats|quiz-chip|hb-url|course-chip|item-meta|flag|status-pill|ledger-\w+|day-group-head|count|topbar-date|diff-raw|raw|kbd|code|pre|class-card-basis|mock-meta|kb-key|kb-hint|pill|meta)(\s|$)/;

const nav = async (p, hash) => { const same = p.url() === `${BASE}${hash}`; await p.goto(`${BASE}${hash}`, { waitUntil: 'load' }); if (same) await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2200); await p.click('.upgrade button:has-text("Skip")', { timeout: 800 }).catch(() => undefined); await p.click('.tour-tip button:has-text("Skip")', { timeout: 500 }).catch(() => undefined); };
const tap = async (p, sel, ms = 900) => { const ok = await p.click(sel, { timeout: 4000 }).then(() => true).catch(() => false); await p.waitForTimeout(ms); return ok; };
const SCENES = [
  { name: 'now', go: (p) => nav(p, '#/now') },
  { name: 'now-details', go: async (p) => { await nav(p, '#/now'); await tap(p, 'button[aria-expanded]:has-text("Details")'); } },
  { name: 'now-notnow', go: async (p) => { await nav(p, '#/now'); await tap(p, 'button:has-text("Not now")'); } },
  { name: 'item-sheet', go: async (p) => { await nav(p, '#/now'); await tap(p, '.row >> nth=0'); } },
  { name: 'calendar', go: (p) => nav(p, '#/calendar') },
  { name: 'calendar-month', go: (p) => nav(p, '#/calendar?v=month') },
  { name: 'classes', go: (p) => nav(p, '#/classes') },
  { name: 'class', go: async (p) => { await nav(p, '#/classes'); await tap(p, '.class-card >> nth=0', 1500); } },
  { name: 'class-editor', go: async (p) => { await nav(p, '#/classes'); await tap(p, '.class-card >> nth=0', 1200); await tap(p, 'button:has-text("Edit class")'); } },
  { name: 'inbox', go: (p) => nav(p, '#/inbox') },
  { name: 'inbox-post', go: async (p) => { await nav(p, '#/inbox'); await tap(p, '.news-item >> nth=0 >> button, .news-item >> nth=0 >> a, .news-item >> nth=0', 1200); } },
  ...['profile', 'plan', 'progress', 'grades', 'workload', 'halo', 'study', 'display', 'classes', 'notifications', 'invite', 'feedback', 'advanced'].map((s) => ({ name: `you-${s}`, go: (p) => nav(p, s === 'profile' ? '#/you' : `#/you?s=${s}`) })),
  { name: 'study', go: (p) => nav(p, '#/study') },
  { name: 'ask', go: (p) => nav(p, '#/ask') },
  { name: 'practice', go: (p) => nav(p, '#/practice') },
  { name: 'check', go: (p) => nav(p, '#/check') },
  { name: 'grades', go: (p) => nav(p, '#/grades') },
  { name: 'library', go: (p) => nav(p, '#/library') },
  { name: 'load', go: (p) => nav(p, '#/load') },
  { name: 'looks', go: (p) => nav(p, '#/looks') },
  { name: 'sync-sheet', go: async (p) => { await nav(p, '#/now'); await tap(p, '[aria-label="Sync Halo"]'); } },
  { name: 'add-sheet', go: async (p) => { await nav(p, '#/now'); await tap(p, '[aria-label^="Add someth"]'); } },
  { name: 'palette', go: async (p) => { await nav(p, '#/now'); await p.keyboard.press('Meta+K'); await p.waitForTimeout(800); } },
  { name: 'trial-sheet', go: async (p) => { await nav(p, '#/now'); await tap(p, '.trial-chip'); } },
  { name: 'account-menu', go: async (p) => { await nav(p, '#/now'); await tap(p, '.topbar [aria-haspopup], .topbar-avatar, button.avatar'); } },
];

const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DEVICES = {
  desk: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 },
  phone: { ...devices['iPhone 14'], deviceScaleFactor: 2 },
  'ipad-portrait': { ...devices['iPad Pro 11'], userAgent: IPAD_SAFARI, viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  'ipad-landscape': { ...devices['iPad Pro 11'], userAgent: IPAD_SAFARI, viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = async (name, scheme, u, settings) => {
  const ctx = await browser.newContext({ ...DEVICES[name], colorScheme: scheme, reducedMotion: 'reduce' });
  if (name.startsWith('ipad')) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); });
  await ctx.addInitScript(() => { window.open = () => null; });
  if (u) await ctx.addInitScript(({ s, key, settings }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: u.session, key: `sb-${ref}-auth-token`, settings });
  return ctx;
};
const audit = async (page, device, scheme, scene) => {
  const raw = await page.evaluate(AUDIT).catch((e) => [{ kind: 'audit-error', what: e.message }]);
  const seen = new Set();
  const issues = raw.filter((i) => !(i.kind === 'mono' && MONO_OK.test(i.cls ?? ''))).filter((i) => { const k = i.kind + i.what; if (seen.has(k)) return false; seen.add(k); return true; });
  const dir = `${OUT}/${device}-${scheme}`;
  mkdirSync(dir, { recursive: true });
  const modal = await page.$('.modal, .onboard, [role="menu"]');
  await page.screenshot({ path: `${dir}/${scene}.png`, fullPage: !modal }).catch(() => undefined);
  report.push({ device, scheme, scene, issues });
  const line = issues.slice(0, 6).map((i) => `${i.kind}: ${i.what}${i.by ? ` (${typeof i.by === 'number' ? i.by + 'px' : 'by ' + i.by})` : ''}`).join(' | ');
  console.log(`${issues.length ? 'FIND' : 'ok  '} ${device}-${scheme} ${scene}${issues.length ? ` [${issues.length}] ${line}` : ''}`);
};

const sweepApp = async (device, scheme, u, settings) => {
  const ctx = await context(device, scheme, u, settings);
  const page = await ctx.newPage();
  for (const s of SCENES) {
    if (SCENES_ONLY && !SCENES_ONLY.includes(s.name)) continue;
    try { await s.go(page); } catch (e) { console.log(`skip ${device}-${scheme} ${s.name}: ${e.message.split('\n')[0]}`); }
    await audit(page, device, scheme, s.name);
  }
  await ctx.close();
};

const sweepOnboarding = async (device, scheme) => {
  const u = await newUser();
  const ctx = await context(device, scheme, null, null);
  const page = await ctx.newPage();
  const step = (name) => audit(page, device, scheme, `onboard-${name}`);
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.setItem('school-dashboard:onboard-wait-ms', '1500'));
  await step('welcome');
  await tap(page, '.onboard button:has-text("Start")');
  await page.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: u.session, key: `sb-${ref}-auth-token` });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.story', { timeout: 15000 }).catch(() => undefined);
  for (let i = 0; i < 3; i++) { await tap(page, `.story-tabs button:nth-child(${i + 1})`, 1400); await step(`story-${i}`); }
  await tap(page, '.story-skip');
  await page.waitForSelector('.gift', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await step('gift');
  await tap(page, '.gift .offer-go', 1200);
  const path = device === 'phone' ? 'phone' : device.startsWith('ipad') ? 'ipad' : 'desktop';
  if (path === 'desktop') {
    await step('bar');
    await tap(page, '.bar-already'); await step('drag');
    await tap(page, 'button:has-text("It\'s in my bookmarks bar")'); await step('open');
    await tap(page, '.onboard button:has-text("Open Halo")'); await step('wait');
    await page.waitForSelector('.fixes', { timeout: 6000 }).catch(() => undefined); await step('wait-fixes');
  } else if (path === 'phone') {
    await step('p-copy');
    await tap(page, '.onboard button:has-text("Copy it")'); await step('p-save');
    await tap(page, '.onboard button:has-text("Done")'); await step('p-edit');
    await tap(page, '.onboard button:has-text("Done")'); await step('p-open');
    await tap(page, '.onboard button:has-text("Open Halo")'); await step('p-wait');
    await page.waitForSelector('.fixes', { timeout: 6000 }).catch(() => undefined); await step('p-wait-fixes');
  } else {
    await step('i-safari');
    await tap(page, '.onboard-big:has-text("Stay in Chrome"), .onboard-big:has-text("It\'s on")'); await step('i-bar');
    await tap(page, '.onboard-big:has-text("It\'s on")'); await step('i-copy');
    await tap(page, '.onboard-big:has-text("Copy bookmark code")'); await step('i-copied');
    for (const b of ['Next', 'Next', 'Next', 'Next']) { if (!(await tap(page, `.onboard-big:has-text("${b}")`))) break; await step(`i-step-${b}-${Math.random().toString(36).slice(2, 5)}`); }
    await tap(page, '.onboard-big:has-text("Open Halo")'); await step('i-wait');
    await page.waitForSelector('.fixes', { timeout: 6000 }).catch(() => undefined); await step('i-wait-fixes');
  }
  await page.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
  await page.waitForSelector('.onboard-payoff', { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await step('payoff');
  await tap(page, '.onboard button:has-text("Start here")');
  await page.waitForSelector('.comeback', { timeout: 6000 }).catch(() => undefined);
  await step('notify-ask');
  await tap(page, '.comeback button:has-text("Not now")');
  if (path !== 'desktop') { await step('home-screen'); await tap(page, '.comeback .onboard-big'); }
  await page.waitForSelector('.tour-tip', { timeout: 6000 }).catch(() => undefined);
  await step('tour');
  await tap(page, '.tour-tip button:has-text("Skip")');
  await page.waitForSelector('.upgrade', { timeout: 6000 }).catch(() => undefined);
  await step('upgrade');
  await ctx.close();
};

try {
  const u = await newUser();
  const { settings } = await seedSynced(u);
  for (const device of Object.keys(DEVICES)) for (const scheme of ['light', 'dark']) {
    if (ONLY && !ONLY.includes(`${device}-${scheme}`)) continue;
    console.log(`--- ${device}-${scheme}`);
    if (!process.env.ONBOARD_ONLY) await sweepApp(device, scheme, u, settings);
    if (!SCENES_ONLY || process.env.ONBOARD_ONLY) await sweepOnboarding(device, scheme);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/report-${process.env.ONLY ?? 'all'}.json`, JSON.stringify(report, null, 1));
  const n = report.reduce((a, r) => a + r.issues.length, 0);
  console.log(`\n${report.length} scenes, ${n} findings; report at ${OUT}/report-${process.env.ONLY ?? 'all'}.json`);
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['reward_grants', 'courses', 'items', 'settings', 'announcements', 'read_ledger', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan', 'notification_prefs', 'winback_sends']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
