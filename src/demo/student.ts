import { dateOf } from '../domain/dates';
import { snapshotOf, type Snapshot } from '../domain/changes';
import { GCU_SCALE } from '../domain/floor';
import { letterFor } from '../domain/grades';
import { DEFAULT_SETTINGS, type AppData, type Course, type Item, type ItemType, type Requirement } from '../domain/types';
import type { StoredAnnouncement } from '../halo/announce';
import { classProgress, milestoneOf } from '../joy/joy';
import { alreadyDone } from '../onboarding/state';

/**
 * Maya Torres, a made-up GCU freshman, for the demo (demo/demo.ts). Six classes a week into Topic 3, built relative
 * to today so the screens always read as "now":
 * - Now: the PSY-102 discussion due tonight, with the three parts its professor's announcement asked for attached;
 * - a due date change found in an announcement (MAT-250 Quiz 2, Tuesday to Thursday) and the post it came from;
 * - MAT-250 in the red on the Cooked meter: a quiz, two problem sets and a project inside seven days (Exam 1 is
 *   twelve days out, so Now is not in exam mode);
 * - a grade that went up in the last sync (BIO-181 to 91%, an A-), celebrated on the next open;
 * - participation this week in two classes;
 * - "Since you last looked": one new assignment, one moved date, one new grade.
 * Every person here is invented; no name belongs to anyone at GCU.
 */
export interface DemoStudent {
  data: AppData;
  announcements: StoredAnnouncement[];
  /** Now's picture from "the last visit", so the line has something to compare with. */
  snapshot: Snapshot;
}

const TZ = 'America/Phoenix';
const DAY = 86_400_000;
const MINUTES: Record<ItemType, number> = { exam: 240, paper: 200, project: 180, lab: 110, quiz: 60, homework: 60, discussion: 30, participation: 15, other: 45 };

type CourseRow = [code: string, name: string, color: string, instructor: string, meetings: Course['meetings'], online: boolean, section: string];
const COURSES: CourseRow[] = [
  ['BIO-181', 'General Biology I', '#2E8B57', 'Dr. Elena Morales', [{ day: 1, start: '09:00', end: '10:15' }, { day: 3, start: '09:00', end: '10:15' }], false, 'MW900A'],
  ['BIO-181L', 'General Biology I Lab', '#3B7DD8', 'Dr. Elena Morales', [{ day: 4, start: '13:00', end: '15:50' }], false, 'R100P'],
  ['MAT-250', 'Calculus I', '#7A5AD0', 'Prof. James Whitaker', [{ day: 2, start: '10:30', end: '11:45' }, { day: 4, start: '10:30', end: '11:45' }], false, 'TR1030A'],
  ['PSY-102', 'General Psychology', '#D9534F', 'Dr. Priya Raman', [{ day: 1, start: '13:00', end: '14:15' }, { day: 3, start: '13:00', end: '14:15' }], false, 'MW100P'],
  ['COM-100', 'Communication as a Critical Inquiry', '#E07B39', 'Prof. Daniel Okafor', [{ day: 2, start: '14:00', end: '15:15' }], false, 'T200P'],
  ['UNV-103', 'University Success', '#5B8C5A', 'Prof. Hannah Lindqvist', [], true, 'ONL1'],
];

/** [class, title, type, points, days from today, status, score?, due time] */
type ItemRow = [string, string, ItemType, number, number, 'todo' | 'in_progress' | 'done', number?, string?];
const ITEMS: ItemRow[] = [
  ['BIO-181', 'Topic 1 Homework: Chemistry of Life', 'homework', 20, -20, 'done', 19],
  ['BIO-181', 'Quiz 1: Cells and Membranes', 'quiz', 50, -13, 'done', 44],
  ['BIO-181', 'Topic 2 Homework: Cell Energy', 'homework', 20, -6, 'done', 18],
  ['BIO-181', 'Topic 3 Homework: Cell Division', 'homework', 20, 2, 'todo'],
  ['BIO-181', 'Quiz 2: Cellular Respiration', 'quiz', 50, 5, 'todo'],
  ['BIO-181', 'Topic 4 Homework: Genetics', 'homework', 20, 9, 'todo'],
  ['BIO-181', 'Midterm Exam', 'exam', 150, 16, 'todo'],
  ['BIO-181L', 'Lab 1: Microscopy', 'lab', 30, -15, 'done', 28],
  ['BIO-181L', 'Lab 2: Diffusion and Osmosis', 'lab', 30, -8, 'done', 27],
  ['BIO-181L', 'Lab 3: Enzyme Activity', 'lab', 30, -1, 'done', 26],
  ['BIO-181L', 'Lab 4 Prelab Quiz', 'quiz', 10, 1, 'todo', undefined, '12:00'],
  ['BIO-181L', 'Lab 4: Photosynthesis', 'lab', 30, 1, 'todo'],
  ['BIO-181L', 'Formal Lab Report: Enzyme Kinetics', 'paper', 100, 12, 'todo'],
  ['MAT-250', 'Homework 2.1: Limits', 'homework', 15, -18, 'done', 15],
  ['MAT-250', 'Homework 2.3: Continuity', 'homework', 15, -11, 'done', 13],
  ['MAT-250', 'Quiz 1: Limits and Continuity', 'quiz', 40, -9, 'done', 34],
  ['MAT-250', 'Homework 3.1: The Derivative', 'homework', 15, -4, 'done', 14],
  ['MAT-250', 'Homework 3.3: Product and Quotient Rules', 'homework', 15, 3, 'in_progress'],
  ['MAT-250', 'Quiz 2: Derivatives', 'quiz', 40, 4, 'todo', undefined, '10:30'],
  ['MAT-250', 'Section 3.5 Problem Set', 'homework', 20, 5, 'todo'],
  ['MAT-250', 'Project 1: Related Rates', 'project', 50, 5, 'todo'],
  ['MAT-250', 'Section 3.6 Problem Set', 'homework', 20, 6, 'todo'],
  ['MAT-250', 'Exam 1', 'exam', 120, 12, 'todo', undefined, '10:30'],
  ['PSY-102', 'Topic 1 DQ 1', 'discussion', 10, -16, 'done', 10],
  ['PSY-102', 'Topic 2 DQ 1', 'discussion', 10, -9, 'done', 9],
  ['PSY-102', 'Topic 2 Quiz', 'quiz', 30, -7, 'done', 25],
  ['PSY-102', 'Topic 3 DQ 1: Memory', 'discussion', 10, 0, 'todo'],
  ['PSY-102', 'Research Methods Worksheet', 'homework', 50, 3, 'todo'],
  ['PSY-102', 'Topic 3 Participation', 'participation', 5, 4, 'todo'],
  ['PSY-102', 'Case Study Analysis', 'paper', 100, 11, 'todo'],
  ['COM-100', 'Topic 1 DQ 1', 'discussion', 10, -14, 'done', 9],
  ['COM-100', 'Personal Communication Inventory', 'homework', 40, -7, 'done', 36],
  ['COM-100', 'Topic 2 DQ 1', 'discussion', 10, -2, 'done', 10],
  ['COM-100', 'Informative Speech Outline', 'homework', 50, 6, 'todo'],
  ['COM-100', 'Topic 3 DQ 1: Listening', 'discussion', 10, 1, 'todo'],
  ['COM-100', 'Informative Speech Video', 'project', 100, 13, 'todo'],
  ['UNV-103', 'Academic Integrity Quiz', 'quiz', 20, -19, 'done', 20],
  ['UNV-103', 'Topic 1 Reflection', 'homework', 25, -12, 'done', 23],
  ['UNV-103', 'Time Management Plan', 'homework', 40, -5, 'done', 35],
  ['UNV-103', 'Topic 3 Reflection: Study Strategies', 'homework', 25, 2, 'todo'],
  ['UNV-103', 'Topic 3 Participation', 'participation', 5, 3, 'todo'],
  ['UNV-103', 'Career Exploration Assignment', 'homework', 50, 8, 'todo'],
];

/** [class, title, body, days ago, what the reader found, how many things] */
const POSTS: [string, string, string, number, string, number][] = [
  ['PSY-102', 'Topic 3 discussion expectations', '<p>For the Topic 3 discussion on memory, post your main response by Wednesday. It should be at least 250 words and cite the textbook in APA format. Then reply to at least two classmates by Sunday night.</p>', 2, 'Three parts for Topic 3 DQ 1: a 250-word main post by Wednesday with an APA citation, and two replies by Sunday.', 3],
  ['MAT-250', 'Quiz 2 moved to Thursday', '<p>Quiz 2 on derivatives is moved from Tuesday to Thursday this week so we can finish 3.4. You may use a scientific calculator (no graphing calculators). Homework 3.3 is still due Tuesday.</p>', 2, 'Quiz 2 moved from Tuesday to Thursday; scientific calculator only.', 2],
  ['BIO-181L', 'Lab 4 this Thursday', '<p>Reminder: Lab 4 (Photosynthesis) is this Thursday. Wear closed-toe shoes and bring your lab coat and goggles, or you will not be allowed in. Complete the Lab 4 prelab quiz on Halo before you arrive.</p>', 1, 'Lab 4 needs closed-toe shoes, a lab coat and goggles; the prelab quiz first.', 2],
  ['PSY-102', 'Case study length', '<p>A few of you asked: the Case Study Analysis should be 1,200 to 1,500 words, APA format, with at least three peer-reviewed sources. The rubric is attached.</p>', 3, 'The Case Study Analysis is 1,200 to 1,500 words, APA, three peer-reviewed sources.', 1],
  ['BIO-181', 'Midterm study guide posted', '<p>The study guide for the midterm is in Course Materials. It covers Topics 1 through 4. Office hours are extended next week.</p>', 3, 'A midterm study guide is posted; office hours extended next week.', 0],
];

export function demoStudent(now: string): DemoStudent {
  const nowMs = Date.parse(now);
  const today = dateOf(now, TZ);
  const at = (days: number, hm = '23:59') => `${dateOf(new Date(nowMs + days * DAY).toISOString(), TZ)}T${hm}:00-07:00`;
  const ago = (hours: number) => new Date(nowMs - hours * 3_600_000).toISOString();
  const synced = ago(0.4);
  const ids = Object.fromEntries(COURSES.map(([code]) => [code, `demo-course-${code}`]));
  const post = (code: string, title: string): StoredAnnouncement | undefined => announcements.find((a) => a.courseId === ids[code] && a.title === title);

  const announcements: StoredAnnouncement[] = POSTS.map(([code, title, content, daysAgo, summary, count], i) => {
    const publishedAt = ago(daysAgo * 24 + 3);
    return {
      id: `demo-post-${i + 1}`,
      forumId: `demo-forum-${code}`,
      title,
      content,
      publishedAt,
      modifiedAt: null,
      author: COURSES.find((c) => c[0] === code)![3],
      mustAcknowledge: false,
      acknowledged: false,
      resources: title === 'Case study length' ? [{ id: 'demo-res-1', name: 'Case Study Rubric.pdf', kind: 'file', type: 'application/pdf' }] : [],
      courseId: ids[code],
      text: content.replace(/<[^>]+>/g, ''),
      pulledAt: synced,
      readAt: i < 2 ? null : publishedAt,
      processedAt: synced,
      findings: [],
      review: {},
      actionsAt: synced,
      actionsModifiedAt: null,
      actionsSummary: summary,
      actionCount: count,
    };
  });

  const src = (a: StoredAnnouncement, quote: string) => ({ kind: 'announcement' as const, id: a.id, title: a.title, quote, at: a.publishedAt });
  const req = (id: string, text: string, a: StoredAnnouncement, quote: string, extra: Partial<Requirement> = {}): Requirement => ({ id, text, dueAt: null, done: false, doneAt: null, gradedOn: true, source: src(a, quote), addedAt: a.publishedAt ?? synced, ...extra });

  const items: Item[] = ITEMS.map(([code, title, type, points, days, status, score, hm], i) => {
    const id = `demo-item-${i + 1}`;
    const dueAt = at(days, hm);
    const done = status === 'done';
    return {
      id,
      courseId: ids[code],
      title,
      label: title,
      labelOverridden: false,
      type,
      points,
      opensAt: at(days - 7, '00:00'),
      dueAt,
      estimatedMinutes: MINUTES[type],
      estimateOverridden: false,
      startByOverride: null,
      status,
      completedAt: done ? at(days - 1, '20:00') : null,
      score: done ? (score ?? null) : null,
      scoreSource: done ? 'halo' : null,
      notes: '',
      topic: null,
      flags: { inClass: type === 'lab', group: false, lopesWrite: type === 'paper', timed: type === 'quiz' || type === 'exam', practice: false },
      source: 'halo',
      haloId: `demo-halo-${i + 1}`,
      haloType: type === 'participation' ? 'PARTICIPATION' : type === 'discussion' ? 'DISCUSSION_QUESTION' : 'ASSIGNMENT',
      url: 'https://halo.gcu.edu/',
      award: null,
      updatedAt: synced,
      halo: { status: done ? 'GRADED' : 'UPCOMING', submittedAt: done ? at(days - 1, '20:00') : null, checkedAt: synced },
      ...(status === 'in_progress' ? { startedAt: ago(26) } : {}),
    } as Item;
  });
  const find = (code: string, title: string) => items.find((i) => i.courseId === ids[code] && i.title === title)!;

  // What the announcements attached.
  const dq = find('PSY-102', 'Topic 3 DQ 1: Memory');
  const dqPost = post('PSY-102', 'Topic 3 discussion expectations')!;
  dq.requirements = [
    req('demo-req-1', 'Post your main response by Wednesday, at least 250 words', dqPost, 'post your main response by Wednesday. It should be at least 250 words', { dueAt: at(2, '23:59') }),
    req('demo-req-2', 'Cite the textbook in APA format in the main post', dqPost, 'cite the textbook in APA format'),
    req('demo-req-3', 'Reply to at least two classmates by Sunday', dqPost, 'reply to at least two classmates by Sunday night', { dueAt: at(5, '23:59') }),
  ];
  const quiz2 = find('MAT-250', 'Quiz 2: Derivatives');
  const quizPost = post('MAT-250', 'Quiz 2 moved to Thursday')!;
  quiz2.dateChange = { from: at(2, '10:30'), at: quizPost.publishedAt!, source: src(quizPost, 'Quiz 2 on derivatives is moved from Tuesday to Thursday this week') };
  quiz2.requirements = [req('demo-req-4', 'Scientific calculator only, no graphing calculators', quizPost, 'You may use a scientific calculator (no graphing calculators)', { gradedOn: false, scope: 'reference' })];
  const lab4 = find('BIO-181L', 'Lab 4: Photosynthesis');
  const labPost = post('BIO-181L', 'Lab 4 this Thursday')!;
  lab4.requirements = [
    req('demo-req-5', 'Closed-toe shoes, lab coat and goggles, or no entry', labPost, 'Wear closed-toe shoes and bring your lab coat and goggles, or you will not be allowed in'),
    req('demo-req-6', 'Finish the Lab 4 prelab quiz before arriving', labPost, 'Complete the Lab 4 prelab quiz on Halo before you arrive'),
  ];
  const caseStudy = find('PSY-102', 'Case Study Analysis');
  const casePost = post('PSY-102', 'Case study length')!;
  caseStudy.requirements = [req('demo-req-7', '1,200 to 1,500 words, APA, at least three peer-reviewed sources', casePost, 'the Case Study Analysis should be 1,200 to 1,500 words, APA format, with at least three peer-reviewed sources')];

  const courses: Course[] = COURSES.map(([code, name, color, instructor, meetings, online, section]) => {
    const mine = items.filter((i) => i.courseId === ids[code] && i.status === 'done' && i.score !== null);
    const points = mine.reduce((a, i) => a + (i.score ?? 0), 0);
    const maxPoints = mine.reduce((a, i) => a + i.points, 0);
    // BIO-181's grade went up in the last sync: 91%, an A-.
    const percent = code === 'BIO-181' ? 91 : Math.round((points / maxPoints) * 1000) / 10;
    const pts = code === 'BIO-181' ? { points: 182, maxPoints: 200 } : { points, maxPoints };
    return {
      id: ids[code],
      code,
      name,
      color,
      credits: online ? 2 : code.endsWith('L') ? 1 : 4,
      instructors: [{ name: instructor, email: `${instructor.split(' ').pop()!.toLowerCase()}@example.edu` }],
      meetings,
      meetingsFrom: meetings.length ? 'section' : null,
      online,
      haloClassId: `demo-halo-${code}`,
      haloSlugId: `${code}-${section}-20260908`,
      haloGrade: { letter: letterFor(percent, GCU_SCALE), percent, ...pts, at: synced },
      gradeScale: GCU_SCALE,
      termStart: '2026-09-08',
      termEnd: '2026-12-20',
      updatedAt: synced,
    } as Course;
  });

  const settings: AppData['settings'] = {
    ...DEFAULT_SETTINGS,
    timezone: TZ,
    syncHow: 'desktop',
    onboarding: alreadyDone(ago(24 * 20)),
    maxOnboarding: { startedAt: ago(24 * 20), step: 'done', doneAt: ago(24 * 20) },
    upgradeSeen: { plus: ago(24 * 20), max: ago(24 * 20) },
    notifyAsk: { declinedAt: ago(24 * 19), asks: 2 },
    extSetup: { shownAt: ago(24 * 20), doneAt: ago(24 * 20) },
    lastPull: { at: synced, build: null, counts: { classes: courses.length, assessments: items.length }, via: 'extension' },
    haloPulls: Object.fromEntries(courses.map((c) => [c.id, { assessments: synced, grades: synced, announcements: synced }])),
    // Each class's milestone is already seen, except PSY-102's: tonight's check-off carries it past a quarter done.
    joy: { pending: { turnedIn: 0, gradeUps: [{ courseId: ids['BIO-181'], code: 'BIO-181', percent: 91, letter: 'A-' }], graded: [], at: synced }, classSeen: Object.fromEntries(courses.map((c) => [c.id, c.code === 'PSY-102' ? 0 : milestoneOf(classProgress(c.id, items)?.pct ?? 0)])) },
    updatedAt: synced,
  };

  // The picture from the last visit: before the sync that brought the Genetics homework, moved Quiz 2 and graded Lab 3.
  const before = items.filter((i) => i.title !== 'Topic 4 Homework: Genetics').map((i) => (i.id === quiz2.id ? { ...i, dueAt: quiz2.dateChange!.from } : i.title === 'Lab 3: Enzyme Activity' ? { ...i, score: null } : i));
  const snapshot = snapshotOf(before, TZ, ago(20));
  void today;
  return { data: { courses, items, settings }, announcements, snapshot };
}
