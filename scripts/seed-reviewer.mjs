// The Chrome Web Store reviewer's account (George, 2026-09-30): a made-up student, nothing from a real account.
// Six sample classes with a term's worth of work, scores on what is done, grades that match them, a few
// announcements for the reader to go through, and a sync "via extension" 35 minutes ago. The account keeps the Max
// George gave it (a friend link). Refuses to write if the account already has classes, unless FORCE=1, which first
// removes only this account's own sample rows.
//   KEYS_ENV=... [EMAIL=richards.georger+review@gmail.com] [FORCE=1] node scripts/seed-reviewer.mjs
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const EMAIL = process.env.EMAIL ?? 'richards.georger+review@gmail.com';
const BUILD = (readFileSync('extension/config.js', 'utf8').match(/BUILD = "([^"]+)"/) ?? [])[1] ?? null;
const DAY = 86_400_000;
const now = new Date();
const iso = now.toISOString();
// A due date n days from today at hh:mm in Phoenix (UTC-7, no daylight saving).
const phxToday = new Date(now.getTime() - 7 * 3_600_000).toISOString().slice(0, 10);
const due = (n, hhmm = '23:59') => new Date(Date.parse(`${phxToday}T${hhmm}:00-07:00`) + n * DAY).toISOString();

let user = null;
for (let page = 1; page < 50 && !user; page++) {
  const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (!data.users.length) break;
  user = data.users.find((x) => x.email === EMAIL);
}
if (!user) throw new Error(`no account ${EMAIL}`);
const uid = user.id;
const { count } = await db.from('courses').select('id', { count: 'exact', head: true }).eq('user_id', uid);
if (count && !process.env.FORCE) throw new Error(`${EMAIL} already has ${count} classes; FORCE=1 replaces this account's sample data`);
if (process.env.FORCE) for (const t of ['items', 'courses', 'announcements', 'read_ledger']) await db.from(t).delete().eq('user_id', uid);

// [code, name, color, instructor, meetings, online, slug section]
const COURSES = [
  ['BIO-181', 'General Biology I', '#2E8B57', 'Dr. Elena Morales', [{ day: 1, start: '09:00', end: '10:15' }, { day: 3, start: '09:00', end: '10:15' }], false, 'MW900A'],
  ['BIO-181L', 'General Biology I Lab', '#3B7DD8', 'Dr. Elena Morales', [{ day: 4, start: '13:00', end: '15:50' }], false, 'R100P'],
  ['MAT-250', 'Calculus I', '#7A5AD0', 'Prof. James Whitaker', [{ day: 2, start: '10:30', end: '11:45' }, { day: 4, start: '10:30', end: '11:45' }], false, 'TR1030A'],
  ['PSY-102', 'General Psychology', '#D9663B', 'Dr. Priya Nair', [], true, 'O500'],
  ['COM-100', 'Introduction to Human Communication', '#C9459A', 'Prof. Hannah Lee', [], true, 'O510'],
  ['UNV-103', 'University Success', '#B8860B', 'Ms. Rachel Kim', [], true, 'O520'],
];
// [code, title, type, points, days from today, status, score if done]
const ITEMS = [
  ['BIO-181', 'Topic 1 Homework: Chemistry of Life', 'homework', 20, -20, 'done', 19], ['BIO-181', 'Quiz 1: Cells and Membranes', 'quiz', 50, -13, 'done', 44], ['BIO-181', 'Topic 2 Homework: Cell Energy', 'homework', 20, -6, 'done', 18],
  ['BIO-181', 'Topic 3 Homework: Cell Division', 'homework', 20, 2, 'todo'], ['BIO-181', 'Quiz 2: Cellular Respiration', 'quiz', 50, 5, 'todo'], ['BIO-181', 'Midterm Exam', 'exam', 150, 16, 'todo'], ['BIO-181', 'Topic 4 Homework: Genetics', 'homework', 20, 9, 'todo'],
  ['BIO-181L', 'Lab 1: Microscopy', 'lab', 30, -15, 'done', 28], ['BIO-181L', 'Lab 2: Diffusion and Osmosis', 'lab', 30, -8, 'done', 27], ['BIO-181L', 'Lab 3: Enzyme Activity', 'lab', 30, -1, 'done', 26],
  ['BIO-181L', 'Lab 4 Prelab Quiz', 'quiz', 10, 1, 'todo'], ['BIO-181L', 'Lab 4: Photosynthesis', 'lab', 30, 1, 'todo'], ['BIO-181L', 'Formal Lab Report: Enzyme Kinetics', 'paper', 100, 12, 'todo'],
  ['MAT-250', 'Homework 2.1: Limits', 'homework', 15, -18, 'done', 15], ['MAT-250', 'Homework 2.3: Continuity', 'homework', 15, -11, 'done', 13], ['MAT-250', 'Quiz 1: Limits and Continuity', 'quiz', 40, -9, 'done', 34],
  ['MAT-250', 'Homework 3.1: The Derivative', 'homework', 15, -4, 'done', 14], ['MAT-250', 'Homework 3.3: Product and Quotient Rules', 'homework', 15, 3, 'in_progress'], ['MAT-250', 'Quiz 2: Derivatives', 'quiz', 40, 4, 'todo'], ['MAT-250', 'Exam 1', 'exam', 120, 14, 'todo'],
  ['PSY-102', 'Topic 1 DQ 1', 'discussion', 10, -16, 'done', 10], ['PSY-102', 'Topic 2 DQ 1', 'discussion', 10, -9, 'done', 9], ['PSY-102', 'Topic 2 Quiz', 'quiz', 30, -7, 'done', 25],
  ['PSY-102', 'Topic 3 DQ 1: Memory', 'discussion', 10, 0, 'todo'], ['PSY-102', 'Research Methods Worksheet', 'homework', 50, 3, 'todo'], ['PSY-102', 'Topic 3 Participation', 'participation', 5, 4, 'todo'], ['PSY-102', 'Case Study Analysis', 'paper', 100, 11, 'todo'],
  ['COM-100', 'Topic 1 DQ 1', 'discussion', 10, -14, 'done', 9], ['COM-100', 'Personal Communication Inventory', 'homework', 40, -7, 'done', 36], ['COM-100', 'Topic 2 DQ 1', 'discussion', 10, -2, 'done', 10],
  ['COM-100', 'Informative Speech Outline', 'homework', 50, 6, 'todo'], ['COM-100', 'Topic 3 DQ 1: Listening', 'discussion', 10, 1, 'todo'], ['COM-100', 'Informative Speech Video', 'project', 100, 13, 'todo'],
  ['UNV-103', 'Academic Integrity Quiz', 'quiz', 20, -19, 'done', 20], ['UNV-103', 'Topic 1 Reflection', 'homework', 25, -12, 'done', 23], ['UNV-103', 'Time Management Plan', 'homework', 40, -5, 'done', 35],
  ['UNV-103', 'Topic 3 Reflection: Study Strategies', 'homework', 25, 2, 'todo'], ['UNV-103', 'Career Exploration Assignment', 'homework', 50, 8, 'todo'], ['UNV-103', 'Topic 3 Participation', 'participation', 5, 3, 'todo'],
];
const ANN = [
  ['BIO-181L', 'Lab 4 this Thursday', '<p>Reminder: Lab 4 (Photosynthesis) is this Thursday. Wear closed-toe shoes and bring your lab coat and goggles, or you will not be allowed in. Complete the Lab 4 prelab quiz on Halo before you arrive.</p>', 1],
  ['MAT-250', 'Quiz 2 moved', '<p>Quiz 2 on derivatives is moved from Tuesday to Thursday this week. You may use a scientific calculator (no graphing calculators). Homework 3.3 is still due Tuesday.</p>', 2],
  ['PSY-102', 'Topic 3 discussion expectations', '<p>For the Topic 3 discussion, post your main response by Wednesday and reply to at least two classmates by Sunday. Cite the textbook in APA format in your main post.</p>', 2],
  ['COM-100', 'Speech outline template', '<p>Use the outline template in the Resources tab for the Informative Speech Outline. Include at least three credible sources and a references page. Outlines without a references page lose 10 points.</p>', 4],
  ['UNV-103', 'Welcome to Topic 3', '<p>This week is about study strategies. Read the chapter before starting the reflection, and schedule a 15-minute check-in with your success counselor before the Career Exploration Assignment is due.</p>', 5],
];

const ids = Object.fromEntries(COURSES.map(([code]) => [code, randomUUID()]));
// The last sync, 35 minutes ago, by the extension; what Halo said about finished work is as of then.
const synced = new Date(now.getTime() - 35 * 60_000).toISOString();
const itemRows = ITEMS.map(([code, title, type, points, n, status, score], i) => {
  const id = randomUUID();
  const est = { exam: 240, paper: 200, project: 180, lab: 110, quiz: 60, homework: 60, discussion: 30, participation: 15 }[type] ?? 45;
  return { id, user_id: uid, updated_at: iso, data: { id, courseId: ids[code], title, label: title, labelOverridden: false, type, points, opensAt: null, dueAt: due(n), estimatedMinutes: est, estimateOverridden: false, startByOverride: null, status, completedAt: status === 'done' ? due(n - 1, '20:00') : null, score: status === 'done' ? score : null, scoreSource: status === 'done' ? 'halo' : undefined, notes: '', topic: null, flags: { inClass: type === 'lab', group: false, lopesWrite: type === 'paper', timed: type === 'quiz' || type === 'exam', practice: false }, source: 'halo', haloId: `rv-${code}-${i}`, award: null, updatedAt: iso, ...(status === 'done' ? { halo: { status: 'GRADED', submittedAt: due(n - 1, '20:00'), checkedAt: synced } } : {}) } };
});
const letter = (p) => (p >= 93 ? 'A' : p >= 90 ? 'A-' : p >= 87 ? 'B+' : p >= 83 ? 'B' : p >= 80 ? 'B-' : p >= 77 ? 'C+' : p >= 73 ? 'C' : 'C-');
const courseRows = COURSES.map(([code, name, color, instructor, meetings, online, section]) => {
  const done = ITEMS.filter((x) => x[0] === code && x[5] === 'done');
  const points = done.reduce((a, x) => a + x[6], 0);
  const maxPoints = done.reduce((a, x) => a + x[3], 0);
  const percent = Math.round((points / maxPoints) * 1000) / 10;
  const id = ids[code];
  return { id, user_id: uid, updated_at: iso, data: { id, code, name, color, credits: code.endsWith('L') ? 1 : 3, instructors: [{ name: instructor, email: '' }], meetings, meetingsFrom: meetings.length ? 'section' : null, online, haloClassId: `rv-class-${code}`, haloSlugId: `${code}-${section}-20260908`, haloGrade: { letter: letter(percent), percent, points, maxPoints, at: iso }, termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: iso } };
});
const annRows = ANN.map(([code, title, content, ago], i) => {
  const id = `rv-post-${code}-${i}`;
  const publishedAt = new Date(now.getTime() - ago * DAY).toISOString();
  return { id, user_id: uid, course_id: ids[code], published_at: publishedAt, updated_at: iso, data: { id, forumId: `rv-forum-${code}`, title, content, publishedAt, modifiedAt: null, author: COURSES.find((c) => c[0] === code)[3], mustAcknowledge: false, acknowledged: false, resources: [], courseId: ids[code], text: content.replace(/<[^>]+>/g, ''), pulledAt: iso, readAt: null, processedAt: null, findings: null, review: {}, actionsAt: null, actionsModifiedAt: null, actionsSummary: null, actionCount: null } };
});

const { data: srow } = await db.from('settings').select('data').eq('user_id', uid).maybeSingle();
const prev = srow?.data ?? {};
const settings = {
  ...prev,
  timezone: prev.timezone ?? 'America/Phoenix',
  syncHow: 'desktop',
  // Set up already: the reviewer lands on Now, with the short tour once.
  onboarding: { ...(prev.onboarding ?? {}), path: 'desktop', step: 'done', doneAt: iso, skippedAt: null, startedAt: prev.onboarding?.startedAt ?? iso, tourDoneAt: null },
  notifyAsk: prev.notifyAsk ?? { askedAt: iso, answer: 'no' },
  // The Max welcome (three screens) seen too, so the reviewer starts on Now.
  maxOnboarding: { startedAt: iso, step: 'done', doneAt: iso },
  upgradeSeen: { ...(prev.upgradeSeen ?? {}), plus: prev.upgradeSeen?.plus ?? iso, max: prev.upgradeSeen?.max ?? iso },
  lastPull: { at: synced, build: BUILD, counts: { classes: COURSES.length, assessments: ITEMS.length, grades: ITEMS.filter((x) => x[5] === 'done').length, announcements: ANN.length }, via: 'extension' },
  haloPulls: Object.fromEntries(Object.values(ids).map((id) => [id, { assessments: synced, grades: synced, announcements: synced, rubrics: null, feedback: null, resources: null }])),
  updatedAt: iso,
};
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };
must(await db.from('courses').insert(courseRows), 'courses');
must(await db.from('items').insert(itemRows), 'items');
must(await db.from('announcements').insert(annRows), 'announcements');
must(await db.from('settings').upsert({ user_id: uid, updated_at: iso, data: settings }), 'settings');
console.log(`${EMAIL}: ${courseRows.length} classes, ${itemRows.length} assignments (${ITEMS.filter((x) => x[5] === 'done').length} graded), ${annRows.length} announcements, synced via extension at ${synced}`);
for (const c of courseRows) console.log(`  ${c.data.code.padEnd(9)} ${c.data.name.padEnd(38)} ${c.data.haloGrade.letter.padEnd(3)} ${c.data.haloGrade.percent}%`);
