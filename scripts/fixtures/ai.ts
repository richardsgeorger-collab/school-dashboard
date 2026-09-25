// Fixtures for the AI before/after harness: real-shaped GCU announcements with what a correct read must find, and
// one lecture transcript. Each expectation is a plain check on the shaped output, so the report can count passes.
import type { Action } from '../../src/halo/actions';
import type { StoredAnnouncement } from '../../src/halo/announce';
import type { LectureNotes } from '../../src/record/notes';
import type { Course, Item } from '../../src/domain/types';

export const TZ = 'America/Phoenix';

export const COURSES: Course[] = [
  { id: 'c-chm', code: 'CHM-113', name: 'General Chemistry I', color: '#1f4fb0', credits: 4, instructors: [{ name: 'Dr. Awad', email: null }], meetings: [{ day: 2, start: '07:00', end: '08:15' }, { day: 4, start: '07:00', end: '08:15' }], online: false, termStart: '2026-08-31', termEnd: '2026-12-13', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'c-eng', code: 'ENG-105', name: 'English Composition I', color: '#a15a00', credits: 3, instructors: [{ name: 'Prof. Lane', email: null }], meetings: [], online: true, termStart: '2026-08-31', termEnd: '2026-12-13', updatedAt: '2026-09-01T00:00:00.000Z' },
] as unknown as Course[];

const item = (id: string, courseId: string, title: string, label: string, due: string, points: number, type: string): Item =>
  ({ id, courseId, title, label, dueAt: `${due}T23:59:00-07:00`, points, type, status: 'todo', source: 'halo', estimatedMinutes: 60, score: null, updatedAt: '2026-09-01T00:00:00.000Z' }) as unknown as Item;

export const ITEMS: Item[] = [
  item('i-lab3', 'c-chm', 'Lab 3: Titration', 'Chem Lab 3', '2026-10-02', 50, 'lab'),
  item('i-quiz2', 'c-chm', 'Quiz 2: Stoichiometry', 'Chem Quiz 2', '2026-10-06', 30, 'quiz'),
  item('i-exam1', 'c-chm', 'Exam 1', 'Chem Exam 1', '2026-10-09', 150, 'exam'),
  item('i-dq3', 'c-eng', 'Topic 3 DQ 1', 'Eng DQ 3.1', '2026-09-30', 5, 'discussion'),
  item('i-ra', 'c-eng', 'Rhetorical Analysis: First Draft', 'Eng RA Draft', '2026-10-04', 100, 'paper'),
];

const post = (id: string, courseId: string, title: string, text: string, publishedAt: string): StoredAnnouncement =>
  ({ id, classId: `h-${courseId}`, courseId, title, text, body: text, author: 'Instructor', publishedAt, modifiedAt: null, pulledAt: '2026-09-24T00:00:00.000Z', readAt: null, processedAt: null, findings: null, review: {} }) as unknown as StoredAnnouncement;

export interface ActionFixture {
  name: string;
  post: StoredAnnouncement;
  /** Each returns a failure message, or null when the expectation holds. */
  expect: ((actions: Action[], summary: string) => string | null)[];
}

const has = (actions: Action[], f: (a: Action) => boolean) => actions.some(f);
const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : null);

export const ACTION_FIXTURES: ActionFixture[] = [
  {
    name: 'lab moved and goggles required',
    post: post('p1', 'c-chm', 'Week 5 lab', 'Hi all. Because of the room change, Lab 3 (titration) will now be due Friday October 9 instead of the 2nd. Also, starting this week you must bring your own splash goggles to lab. No goggles, no lab, no points. See you Tuesday.', '2026-09-28T15:00:00.000Z'),
    expect: [
      (a) => (has(a, (x) => x.kind === 'date_change' && x.itemId === 'i-lab3' && dayOf(x.dueAt) === '2026-10-09') ? null : 'missed: Lab 3 moved to Oct 9'),
      (a) => (has(a, (x) => x.kind === 'requirement' && /goggle/i.test(x.text)) ? null : 'missed: goggles required'),
      (a) => (a.every((x) => (x.source.quote ?? '').length > 0) ? null : 'an action has no quote'),
    ],
  },
  {
    name: 'DQ reply rule',
    post: post('p2', 'c-eng', 'Discussion expectations', 'A reminder on discussion forums: your initial post is due by Wednesday, and you need to reply to at least two classmates by Sunday with substantive replies of 100 words or more. Replies like "great post" do not count. This applies every week.', '2026-09-22T14:00:00.000Z'),
    expect: [
      (a) => (has(a, (x) => x.kind === 'requirement' && /two classmates|2 classmates/i.test(x.text)) ? null : 'missed: reply to two classmates'),
      (a) => (has(a, (x) => /100 words|100-word/i.test(x.text) || /100 words/i.test(x.source.quote ?? '')) ? null : 'missed: 100 words'),
    ],
  },
  {
    name: 'exam coverage and what to bring',
    post: post('p3', 'c-chm', 'Exam 1 details', 'Exam 1 on October 9 covers chapters 1 through 4, with an emphasis on stoichiometry and limiting reagents. Bring a non-programmable calculator and your student ID. Formula sheet will be provided. No phones.', '2026-10-01T16:00:00.000Z'),
    expect: [
      (a) => (has(a, (x) => x.itemId === 'i-exam1') ? null : 'nothing attached to Exam 1'),
      (a) => (has(a, (x) => /calculator/i.test(x.text)) ? null : 'missed: bring a calculator'),
      (a) => (has(a, (x) => /chapters? 1/i.test(x.text) || /1 through 4/i.test(x.text)) ? null : 'missed: chapters 1 to 4'),
    ],
  },
  {
    name: 'new work not in Halo',
    post: post('p4', 'c-eng', 'Topic 4 heads up', 'Before Monday, everyone should claim an artifact for the rhetorical analysis in the Topic 4 forum. First come, first served, one per student. I also uploaded the sample paper to Class Resources.', '2026-09-25T18:00:00.000Z'),
    expect: [
      (a) => (has(a, (x) => (x.kind === 'new_work' || x.kind === 'requirement') && /artifact/i.test(x.text)) ? null : 'missed: claim an artifact'),
      (a) => (has(a, (x) => dayOf(x.dueAt) === '2026-09-28') ? null : 'did not resolve "before Monday" to Sep 28'),
    ],
  },
  {
    name: 'pure news, nothing to do',
    post: post('p5', 'c-chm', 'Office hours', 'Office hours move to Thursdays 2 to 3 in the science building, room 214, starting next week. Come by with questions. Have a good weekend.', '2026-09-26T20:00:00.000Z'),
    expect: [(a) => (a.filter((x) => x.kind !== 'note').length === 0 ? null : `invented ${a.filter((x) => x.kind !== 'note').length} action(s) from plain news`)],
  },
  {
    name: 'points changed',
    post: post('p6', 'c-chm', 'Quiz 2', 'Quick note: Quiz 2 will be worth 50 points, not 30, since it now includes the limiting reagent section. Same day, October 6.', '2026-10-02T13:00:00.000Z'),
    expect: [(a) => (has(a, (x) => x.kind === 'points_change' && x.itemId === 'i-quiz2' && x.points === 50) ? null : 'missed: Quiz 2 now 50 points')],
  },
];

export interface LectureFixture {
  name: string;
  transcript: string;
  lectureDate: string;
  course: Course;
  expect: ((n: LectureNotes) => string | null)[];
}

export const LECTURE_FIXTURES: LectureFixture[] = [
  {
    name: 'stoichiometry lecture with an exam flag and a date',
    course: COURSES[0],
    lectureDate: '2026-09-29',
    transcript: [
      'Okay, so today we are doing stoichiometry. Mole ratios come from the balanced equation, always convert to moles first before you compare anything.',
      'The limiting reagent is the reactant that runs out first. And yes, this is on the exam. I will say it again: limiting reagent, on the exam.',
      'Percent yield is actual over theoretical times one hundred. People mix these up every year.',
      'One more thing, the quiz that was going to be next Tuesday is now next Thursday, October 8, because of the room change.',
      'For the lab on Friday bring your own goggles. Alright, let us do an example. Two moles of hydrogen react with one mole of oxygen...',
    ].join(' '),
    expect: [
      (n) => (n.knowledge?.examFlags.some((f) => /limiting reagent/i.test(f.point)) ? null : 'missed: limiting reagent flagged for the exam'),
      (n) => (n.mentions.some((m) => m.kind === 'date_change' && m.date === '2026-10-08') ? null : 'missed: quiz moved to Oct 8'),
      (n) => (n.concepts.some((c) => /percent yield/i.test(c)) || n.summary.join(' ').toLowerCase().includes('yield') ? null : 'missed: percent yield'),
    ],
  },
];
