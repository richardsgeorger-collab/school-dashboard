// The demo student (Maya Torres, made up) as Halo would report her, for the Halo+-on-Halo tests (extension 0.12.0):
// the snapshot Halo+ hands the extension, a sync export in Halo's shape (classes, topics, assessments with Halo's
// types and statuses, discussions with their forums, announcements, files, the participation rule), and the index the
// extension builds from that export. Prints JSON { snap, payload, index, now }.
//   npx tsx scripts/onhalo-fixture.ts
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dateOf } from '../src/domain/dates';
import { computeSchedule } from '../src/domain/schedule';
import { demoStudent } from '../src/demo/student';
import { classCodeOf, haloSnap } from '../src/halo/haloSnap';

const now = new Date().toISOString();
const d = demoStudent(now).data;
const schedule = computeSchedule(d.items, d.settings, dateOf(now, d.settings.timezone), { start: '2026-08-31', end: '2026-12-20' }, now);
const snap = haloSnap({ courses: d.courses, items: d.items, settings: d.settings, schedule, canSync: true, now });

const TYPE: Record<string, string> = { quiz: 'QUIZ', exam: 'QUIZ', discussion: 'DISCUSSION_QUESTION', participation: 'PARTICIPATION' };
const TERM = Date.parse('2026-09-07T07:00:00Z');
const WEEK = 7 * 86_400_000;
const TOPICS = ['Foundations', 'Structure', 'Energy', 'Systems', 'Change', 'Evidence', 'Practice', 'Review'];
const topicOf = (title: string, due: string) => {
  const m = /Topic (\d+)/.exec(title);
  // GCU's traditional classes run a topic every two weeks.
  return m ? Number(m[1]) : Math.max(1, Math.floor((Date.parse(due) - TERM) / (2 * WEEK)) + 1);
};
const iso = (s: string) => new Date(s).toISOString();

const classes = d.courses.map((c, k) => {
  const slug = c.haloSlugId as string;
  const items = d.items.filter((i) => i.courseId === c.id && i.haloId && i.dueAt);
  const assessments = items.map((i) => {
    const n = topicOf(i.title, i.dueAt as string);
    const type = TYPE[i.type] ?? 'ASSIGNMENT';
    const done = i.status === 'done';
    const graded = done && typeof i.score === 'number';
    return {
      id: i.haloId,
      title: i.title,
      description: `<p>${i.title}. Read the topic materials, then complete this ${type === 'QUIZ' ? 'quiz' : type === 'DISCUSSION_QUESTION' ? 'discussion' : 'assignment'}.</p>`,
      unit: `Topic ${n}: ${TOPICS[(n - 1) % TOPICS.length]}`,
      unitId: `u-${c.code}-${n}`,
      unitSequence: n,
      sequence: 1,
      startDate: iso(new Date(Date.parse(i.dueAt as string) - 6 * 86_400_000).toISOString()),
      dueDate: iso(i.dueAt as string),
      classDueDate: iso(i.dueAt as string),
      points: i.points ?? 0,
      type,
      tags: [],
      inPerson: false,
      isGroupEnabled: false,
      status: graded ? 'PUBLISHED' : done ? 'SUBMITTED' : Date.parse(i.dueAt as string) < Date.parse(now) ? 'OVERDUE' : 'ACTIVE',
      submittedAt: done ? iso(new Date(Date.parse(i.dueAt as string) - 26 * 3_600_000).toISOString()) : null,
      score: graded ? i.score : null,
    };
  });
  const dqs = assessments.filter((a) => a.type === 'DISCUSSION_QUESTION').map((a) => ({ forumId: `f-${a.id}`, contextId: a.id, title: a.title, description: a.description, startDate: a.startDate, dueDate: a.dueDate, totalPosts: 12 }));
  return {
    id: c.haloClassId,
    slugId: slug,
    classCode: classCodeOf(slug),
    courseCode: c.code,
    name: c.name,
    startDate: '2026-09-08T07:00:00Z',
    endDate: '2026-12-20T07:00:00Z',
    assessments,
    discussions: dqs,
    announcements: [
      { id: `ann-${c.code}-1`, forumId: `ann-forum-${c.code}`, title: `${c.code}: study guide posted`, content: `<p>The study guide is up. The review session link is https://gcu.zoom.us/j/555${k}0101 and the practice set is at www.gcu.edu/library.</p>`, publishedAt: '2026-10-26T17:05:00Z', author: 'Instructor', mustAcknowledge: true, acknowledged: false, resources: [{ id: `ann-file-${c.code}`, name: 'Study guide.pdf', kind: 'FILE', type: 'forum_resource' }] },
      { id: `ann-${c.code}-2`, forumId: `ann-forum-${c.code}`, title: 'Welcome to the class', content: '<p>Welcome! Office hours are on the syllabus. <a href="https://www.gcu.edu">GCU</a></p>', publishedAt: '2026-09-08T15:00:00Z', author: 'Instructor', mustAcknowledge: false, acknowledged: true, resources: [] },
    ],
    resources: [{ id: `ccr-${c.code}`, title: 'Course readings', description: null, instructorAdded: false, unit: null, files: [{ id: `file-${c.code}-1`, name: `${c.code} reading packet.pdf`, kind: 'FILE', type: 'course_class_resource' }] }],
    participation: c.code === 'COM-100' || c.code === 'UNV-103' ? { description: '<p>Post substantively on three separate days each topic.</p>', days: 3, posts: 1 } : undefined,
    holidays: [{ title: 'Thanksgiving Break', description: null, startDate: '2026-11-26T07:00:00Z', duration: 4 }],
  };
});
const payload = { kind: 'halo-export', version: 1, exportedAt: now, classes };

const ctx: { globalThis?: unknown; HaloPlusOnLogic?: { buildIndex: (p: unknown, at?: string) => unknown }; URL: typeof URL; Intl: typeof Intl; Date: typeof Date } = { URL, Intl, Date };
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), ctx);
const index = ctx.HaloPlusOnLogic?.buildIndex(payload, now);
process.stdout.write(JSON.stringify({ snap, payload, index, now }));
