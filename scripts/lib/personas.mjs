// Throwaway accounts for the full audit (2026-09-30): one per kind of student, each signed in with a real session
// on the real backend and seeded with a made-up term (the reviewer's sample classes). Every account is
// @example.invalid and is removed by cleanup().
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DAY = 86_400_000;
const phxToday = () => new Date(Date.now() - 7 * 3_600_000).toISOString().slice(0, 10);
const due = (n, hhmm = '23:59') => new Date(Date.parse(`${phxToday()}T${hhmm}:00-07:00`) + n * DAY).toISOString();

const COURSES = [
  ['BIO-181', 'General Biology I', '#2E8B57', 'Dr. Elena Morales', [{ day: 1, start: '09:00', end: '10:15' }, { day: 3, start: '09:00', end: '10:15' }], false, 'MW900A'],
  ['BIO-181L', 'General Biology I Lab', '#3B7DD8', 'Dr. Elena Morales', [{ day: 4, start: '13:00', end: '15:50' }], false, 'R100P'],
  ['MAT-250', 'Calculus I', '#7A5AD0', 'Prof. James Whitaker', [{ day: 2, start: '10:30', end: '11:45' }, { day: 4, start: '10:30', end: '11:45' }], false, 'TR1030A'],
  ['PSY-102', 'General Psychology', '#D9663B', 'Dr. Priya Nair', [], true, 'O500'],
  ['COM-100', 'Introduction to Human Communication', '#C9459A', 'Prof. Hannah Lee', [], true, 'O510'],
  ['UNV-103', 'University Success', '#B8860B', 'Ms. Rachel Kim', [], true, 'O520'],
];
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
];

export function personaKit(env) {
  const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
  const made = [];
  const signIn = async (email) => {
    const { data: link } = await db.auth.admin.generateLink({ type: 'magiclink', email });
    const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    return { c, session: s.session };
  };
  const create = async (tag) => {
    const email = `e2e-audit-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.invalid`;
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    made.push(data.user.id);
    return { id: data.user.id, email };
  };
  /** A synced term: six classes, 40 assignments, grades, three announcements, the last sync an hour ago. */
  const seed = async (uid, extraSettings = {}) => {
    const iso = new Date().toISOString();
    const synced = new Date(Date.now() - 60 * 60_000).toISOString();
    const ids = Object.fromEntries(COURSES.map(([code]) => [code, randomUUID()]));
    const letter = (p) => (p >= 93 ? 'A' : p >= 90 ? 'A-' : p >= 87 ? 'B+' : p >= 83 ? 'B' : 'B-');
    await db.from('courses').insert(COURSES.map(([code, name, color, instructor, meetings, online, section]) => {
      const done = ITEMS.filter((x) => x[0] === code && x[5] === 'done');
      const points = done.reduce((a, x) => a + x[6], 0);
      const maxPoints = done.reduce((a, x) => a + x[3], 0);
      const percent = Math.round((points / maxPoints) * 1000) / 10;
      return { id: ids[code], user_id: uid, updated_at: iso, data: { id: ids[code], code, name, color, credits: 3, instructors: [{ name: instructor, email: '' }], meetings, meetingsFrom: meetings.length ? 'section' : null, online, haloClassId: `aud-${code}`, haloSlugId: `${code}-${section}-20260908`, haloGrade: { letter: letter(percent), percent, points, maxPoints, at: iso }, termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: iso } };
    }));
    await db.from('items').insert(ITEMS.map(([code, title, type, points, n, status, score], i) => {
      const id = randomUUID();
      return { id, user_id: uid, updated_at: iso, data: { id, courseId: ids[code], title, label: title, labelOverridden: false, type, points, opensAt: null, dueAt: due(n), estimatedMinutes: { exam: 240, paper: 200, project: 180, lab: 110, quiz: 60, homework: 60, discussion: 30, participation: 15 }[type] ?? 45, estimateOverridden: false, startByOverride: null, status, completedAt: status === 'done' ? due(n - 1, '20:00') : null, score: status === 'done' ? score : null, notes: '', topic: null, flags: { inClass: type === 'lab', group: false, lopesWrite: type === 'paper', timed: type === 'quiz' || type === 'exam', practice: false }, source: 'halo', haloId: `aud-${code}-${i}`, award: null, updatedAt: iso, ...(status === 'done' ? { halo: { status: 'GRADED', submittedAt: due(n - 1, '20:00'), checkedAt: synced } } : {}) } };
    }));
    await db.from('announcements').insert(ANN.map(([code, title, content, ago], i) => {
      const id = `aud-post-${uid.slice(0, 8)}-${i}`;
      const publishedAt = new Date(Date.now() - ago * DAY).toISOString();
      return { id, user_id: uid, course_id: ids[code], published_at: publishedAt, updated_at: iso, data: { id, forumId: `aud-forum-${code}`, title, content, publishedAt, modifiedAt: null, author: COURSES.find((c) => c[0] === code)[3], mustAcknowledge: false, acknowledged: false, resources: [], courseId: ids[code], text: content.replace(/<[^>]+>/g, ''), pulledAt: iso, readAt: null, processedAt: null, findings: null, review: {}, actionsAt: null, actionsModifiedAt: null, actionsSummary: null, actionCount: null } };
    }));
    await settings(uid, { lastPull: { at: synced, build: null, counts: { classes: COURSES.length, assessments: ITEMS.length }, via: 'extension' }, haloPulls: Object.fromEntries(Object.values(ids).map((id) => [id, { assessments: synced, grades: synced, announcements: synced }])), ...extraSettings });
    return ids;
  };
  const settings = async (uid, extra = {}) => {
    const iso = new Date().toISOString();
    const s = { timezone: 'America/Phoenix', syncHow: 'desktop', onboarding: { startedAt: iso, step: 'done', doneAt: iso, skippedAt: null, tourDoneAt: iso }, maxOnboarding: { startedAt: iso, step: 'done', doneAt: iso }, upgradeSeen: { plus: iso, max: iso }, notifyAsk: { askedAt: iso, answer: 'no' }, weekdayMinutes: 180, weekendMinutes: 300, updatedAt: iso, ...extra };
    await db.from('settings').upsert({ user_id: uid, updated_at: iso, data: s });
  };
  const profile = (uid, patch) => db.from('profiles').update(patch).eq('user_id', uid);
  const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
  const ahead = (d) => new Date(Date.now() + d * DAY).toISOString();

  /** kind: new | synced | trial-1d | ended | free | plus | max | friend | invited | admin */
  const persona = async (kind) => {
    const u = await create(kind);
    let ids = null;
    if (kind !== 'new' && kind !== 'free') ids = await seed(u.id);
    if (kind === 'free') await settings(u.id);
    if (kind === 'trial-1d') await profile(u.id, { trial_started_at: ago(6.2), trial_ends_at: ahead(0.8) });
    if (kind === 'ended' || kind === 'free') await profile(u.id, { trial_started_at: ago(9), trial_ends_at: ago(2) });
    if (kind === 'plus' || kind === 'max') {
      await profile(u.id, { tier: kind, trial_started_at: ago(30), trial_ends_at: ago(23) });
      await db.from('subscriptions').insert({ user_id: u.id, stripe_subscription_id: `sub_audit_${Date.now()}_${kind}`, tier: kind, interval: 'month', status: 'active', current_period_end: ahead(20), cancel_at_period_end: false });
    }
    if (kind === 'friend') await profile(u.id, { reward_tier: 'max', reward_until: ahead(60), friend_from: 'George', friend_joined_at: ago(1), trial_started_at: ago(1), trial_ends_at: ago(1) });
    if (kind === 'invited') {
      const inviter = await create('inviter');
      const { data: p } = await db.from('profiles').select('referral_code').eq('user_id', inviter.id).single();
      const { c } = await signIn(u.email);
      await c.rpc('claim_referral', { p_code: p.referral_code });
    }
    if (kind === 'admin') await profile(u.id, { is_admin: true });
    const { session } = await signIn(u.email);
    return { kind, id: u.id, email: u.email, session, courseIds: ids };
  };
  const cleanup = async () => {
    for (const id of made) {
      for (const t of ['pending_syncs', 'sync_keys', 'reward_grants', 'subscriptions', 'courses', 'items', 'settings', 'announcements', 'read_ledger', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan', 'notification_prefs', 'push_subscriptions', 'feedback', 'winback_sends', 'calendar_feeds']) await db.from(t).delete().eq('user_id', id);
      await db.from('referrals').delete().or(`inviter.eq.${id},invitee.eq.${id}`);
      await db.auth.admin.deleteUser(id);
    }
    return made.length;
  };
  return { db, persona, cleanup, signIn };
}
