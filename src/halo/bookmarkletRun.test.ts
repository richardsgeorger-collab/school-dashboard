import { describe, expect, it } from 'vitest';
import { bookmarkletSource } from './bookmarklet';
import { runBookmarklet, type Halo, type Reply } from './bookmarkletHarness';

/** The assessment id shape that crashed the real sync: a bare UUID used as a lookup key. */
const A1 = '1fa35237-4200-449f-98ab-be13a3b00001';
const A2 = '1fa35237-4200-449f-98ab-be13a3b00002';
const A3 = '1fa35237-4200-449f-98ab-be13a3b00003';

const CLASSES = {
  getCourseClassesForUser: {
    courseClasses: [
      {
        id: 'C1', slugId: 'S1', classCode: 'CHM-113-101', courseCode: 'CHM-113', name: 'General Chemistry I',
        startDate: '2026-08-24', endDate: '2026-12-11', stage: 'CURRENT', modality: 'ONGROUND', credits: 4,
        units: [
          { id: 'U1', title: 'Topic 1', sequence: 1, assessments: [
            { id: A1, sequence: 1, title: 'Lab Safety Quiz', description: 'Ten questions.', startDate: null, dueDate: '2026-09-19 06:59:00', points: 10, type: 'QUIZ', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false },
            { id: A2, sequence: 2, title: 'Topic 1 DQ 1', description: 'Post and reply twice.', startDate: null, dueDate: '2026-09-18 06:59:00', points: 5, type: 'DISCUSSION_QUESTION', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false },
          ] },
          { id: 'U2', title: 'Topic 2', sequence: 2, assessments: [
            { id: A3, sequence: 1, title: 'Flame Test Lab Report', description: 'Full report.', startDate: null, dueDate: '2026-09-25 06:59:00', points: 50, type: 'ASSIGNMENT', tags: ['IN_PERSON'], requiresLopesWrite: true, isGroupEnabled: false, inPerson: true },
          ] },
        ],
      },
    ],
  },
};

const OK: Record<string, unknown> = {
  GetUserAlerts: { getUserAlerts: { nextToken: null, alerts: [{ id: 'al1', classId: 'C1', isRead: false, timestamp: '2026-09-17T15:00:00Z', type: 'GRADED', data: { assignmentTitle: 'Lab Safety Quiz', assessmentId: A1, announcementTitle: null, senderName: 'Dr. Reyes' } }] } },
  GetInboxLeftPanel: { getInboxLeftPanel: [{ courseClassId: 'C1', forums: [{ forumId: 'f9', posts: [{ id: 'm1', content: 'Focus on the conclusion.', publishDate: '2026-09-16T18:00:00Z', postStatus: 'ACTIVE', createdBy: { baseRoleName: 'INSTRUCTOR', user: { firstName: 'Ana', lastName: 'Reyes', preferredFirstName: null } } }] }] }] },
  AllAssessmentGrades: { assessmentGrades: [{ grades: [
    { id: 'g1', status: 'SUBMITTED', dueDate: '2026-09-19 06:59:00', accommodatedDueDate: null, assessment: { id: A1 }, assignmentSubmission: { submissionDate: '2026-09-18T20:00:00Z' }, history: [{ status: 'PUBLISHED', points: 7 }] },
    { id: 'g2', status: 'ACTIVE', dueDate: '2026-09-18 06:59:00', accommodatedDueDate: null, assessment: { id: A2 }, assignmentSubmission: null, history: [] },
  ] }] },
  CurrentClass: { currentClass: {
    id: 'C1',
    gradeScale: { entries: [{ label: 'A', minPercent: 90, maxPercent: 100 }, { label: 'B', minPercent: 80, maxPercent: 89.99 }] },
    holidays: [{ title: 'Fall break', description: null, startDate: '2026-10-12', duration: 2, active: true }],
    participationPolicy: { description: 'Post on three separate days.', numDays: 3, numPosts: 1 },
    units: [{ id: 'U2', title: 'Topic 2', assessments: [{ id: A3, rubric: { id: 'R1', name: 'Lab Report Rubric' }, attachments: [{ id: 'at1', resourceId: 'res-1', title: 'LabRubric.pdf' }] }] }],
  } },
  AssessmentFeedback: { assessmentGrades: [{ grades: [
    { id: 'g3', gradedDate: '2026-09-17T12:00:00Z', assessment: { id: A3 }, finalComment: { comment: 'Good setup. Watch your significant figures.', commentResources: [{ resource: { id: 'fr1', name: 'marked-up.pdf' } }] }, rubricScores: [{ comment: null, criteriaId: 'c1', rubricCellId: 'l2' }], userQuizAssessment: null, post: null },
    { id: 'g4', gradedDate: null, assessment: { id: A1 }, finalComment: null, rubricScores: [], userQuizAssessment: { userQuizId: 'uq1', submissionDate: '2026-09-18T20:00:00Z' }, post: null },
    { id: 'g5', gradedDate: null, assessment: { id: A2 }, finalComment: null, rubricScores: [], userQuizAssessment: null, post: { id: 'p1', publishDate: '2026-09-16T18:00:00Z', wordCount: 180, postStatus: 'ACTIVE' } },
  ] }] },
  courseClassResources: { courseClassResources: {
    id: 'C1',
    resources: [{ id: 'cr1', title: 'Lab safety contract', description: null, instructorAdded: false, instructorOnly: false, sequence: 1, resources: [{ id: 'x1', resource: { id: 'f1', kind: 'FILE', name: 'safety.pdf', type: 'PDF' } }] }],
    units: [{ id: 'U2', title: 'Topic 2', resources: [{ id: 'cr2', title: 'Extra worked examples', description: null, instructorAdded: true, instructorOnly: false, sequence: 1, resources: [] }] }],
  } },
  AllDQForCourseClass: { allDQForCourseClass: [{ forumId: 'dq1', title: 'Topic 1 DQ 1', description: 'Prompt', startDate: null, dueDate: '2026-09-18 06:59:00', totalPosts: 24, active: true }] },
  GetForumNotifications: { classes: { forumTypes: { ANNOUNCEMENTS: { classes: [{ classId: 'C1', count: 2, forums: [{ count: 2, forumId: 'AF1', posts: 2 }] }] } } } },
  getDiscussionForumPosts: { Posts: [
    { id: 'po1', forumId: 'AF1', content: '<p>Week 4: goggles. Bring your goggles Thursday.</p>', postStatus: 'ACTIVE', parentPostId: null, hasChildren: false, pinOrder: null, publishDate: '2026-09-17T14:00:00Z', modifiedDate: null, isAcknowledge: false, flagType: null, countOfAcknowledgements: 0, createdBy: { id: 'u9', baseRoleName: 'INSTRUCTOR', user: { firstName: 'Ana', lastName: 'Reyes', preferredFirstName: null } }, resources: [{ id: 'r9', kind: 'FILE', name: 'FlameTest_Prelab.pdf', type: 'PDF' }] },
  ] },
  GetAnnouncementsStudent: { announcements: [{ forumId: 'af1', courseClassId: 'C1', title: 'Announcements', startDate: null, endDate: null, posts: [
    { id: 'po1', forumId: 'af1', title: 'Week 4: goggles', content: 'Bring your goggles Thursday.', publishDate: '2026-09-17T14:00:00Z', modifiedDate: null, startDate: null, expiryDate: null, postStatus: 'ACTIVE', isAcknowledge: false, postFlagAcknowledgements: [], createdBy: { id: 'u9', user: { firstName: 'Ana', lastName: 'Reyes', preferredFirstName: null } }, resources: [{ id: 'r9', name: 'FlameTest_Prelab.pdf', kind: 'FILE', type: 'PDF' }] },
  ] }] },
  AssessmentRubric: { assessmentRubric: { id: A3, rubric: { id: 'R1', name: 'Lab Report Rubric', criteria: [
    { id: 'c1', name: 'Correct setup', description: 'Apparatus and procedure', points: 20, sequence: 1, achievementLevels: [{ cellId: 'l1', description: 'Exemplary', name: 'Exemplary', points: 20, sequence: 1 }, { cellId: 'l2', description: 'Acceptable', name: 'Acceptable', points: 15, sequence: 2 }] },
  ] } } },
  GetQuizResult: { userQuiz: { id: 'uq1', submitTime: '2026-09-18T20:00:00Z', quizStatus: 'SUBMITTED', userQuestions: [{ id: 'q1', sortOrder: 1, question: { id: 'qq1', questionType: 'MULTIPLE_CHOICE', content: 'Goggles are required when?' }, userQuestionOptions: [{ id: 'o1', isSelected: true, response: null, option: { id: 'oo1', content: 'Always' } }] }] }, userQuizResults: { finalScore: 7, questionsAnswered: 10, totalCorrect: 7, totalIncorrect: 3 } },
};

/** Halo answering everything correctly. `getCourseClassesForUser` serves two different queries under one name. */
const good: Halo = (op, _v, query) => {
  if (op === 'getCourseClassesForUser') return { data: query.includes('instructors') ? { getCourseClassesForUser: { courseClasses: [{ id: 'C1', instructors: [{ user: { firstName: 'Ana', lastName: 'Reyes', preferredFirstName: null } }] }] } } : CLASSES };
  // There is no `announcements` root field on the real gateway; the forum path above is what serves them.
  if (op === 'GetAnnouncementsStudent') return { errors: [{ message: 'Cannot query field "announcements" on type "Query"' }] };
  return { data: OK[op] ?? {} };
};

/** Every way a single query can go wrong. */
const MODES: Record<string, (op: string) => Reply> = {
  'null data': () => ({ data: null }),
  'field missing': () => ({ data: {} }),
  'wrong types': () => ({ data: { getUserAlerts: 1, getInboxLeftPanel: 'nope', assessmentGrades: 'nope', currentClass: 7, courseClassResources: 0, allDQForCourseClass: 'nope', announcements: 'nope', assessmentRubric: true, userQuiz: 'nope', userQuizResults: false, getCourseClassesForUser: 5 } }),
  'nested nulls': () => ({ data: { getUserAlerts: { alerts: [null] }, getInboxLeftPanel: [null], assessmentGrades: [{ grades: [null, { assessment: null }] }], currentClass: { units: [null, { assessments: [null, {}] }], gradeScale: { entries: [null] }, holidays: [null], participationPolicy: {} }, courseClassResources: { resources: [null], units: [null] }, allDQForCourseClass: [null], announcements: [null, { posts: [null, { createdBy: 'x', resources: [null], postFlagAcknowledgements: [null] }] }], assessmentRubric: { rubric: { criteria: [null, { achievementLevels: [null] }] } }, userQuiz: { userQuestions: [null, {}] }, userQuizResults: {}, getCourseClassesForUser: { courseClasses: [null] } } }),
  'graphql error': () => ({ errors: [{ message: 'Cannot query field "wat"' }] }),
  'network throw': () => {
    throw new Error('Failed to fetch');
  },
};

const BREAKABLE = ['GetUserAlerts', 'GetInboxLeftPanel', 'AllAssessmentGrades', 'CurrentClass', 'AssessmentFeedback', 'courseClassResources', 'AllDQForCourseClass', 'GetForumNotifications', 'getDiscussionForumPosts', 'AssessmentRubric', 'GetQuizResult'];

/** `good`, except one operation answers badly. Instructor names share an operation name, so break by query text. */
const breaking = (op: string, mode: keyof typeof MODES): Halo => (o, v, q) => {
  if (o === op) return MODES[mode](o);
  return good(o, v, q);
};

describe('the bookmarklet, actually run', () => {
  it('reads a whole class when Halo behaves', async () => {
    const r = await runBookmarklet(good, { download: () => ({ downloadUrl: 'https://gateway.halo.gcu.edu/file/abc' }) });
    expect(r.failed).toBeNull();
    expect(r.payload.problems).toEqual([]);
    const c = r.payload.classes[0];
    expect(c.courseCode).toBe('CHM-113');
    expect(c.assessments).toHaveLength(3);
    expect(c.instructors).toEqual(['Ana Reyes']);
    // The lookups that crashed the real sync.
    const lab = c.assessments.find((a: any) => a.id === A3);
    expect(lab.rubric.criteria[0].name).toBe('Correct setup');
    expect(lab.rubric.criteria[0].levels[1].cellId).toBe('l2');
    expect(lab.feedback.comment).toContain('significant figures');
    expect(lab.feedback.criteria[0].cellId).toBe('l2');
    expect(lab.attachments[0].downloadUrl).toBe('https://gateway.halo.gcu.edu/file/abc');
    expect(c.assessments.find((a: any) => a.id === A1).quiz.correct).toBe(7);
    expect(c.assessments.find((a: any) => a.id === A2).feedback.post.words).toBe(180);
    // Class resources survive the announcements loop, which used to overwrite them.
    expect(c.resources.map((x: any) => x.title)).toEqual(['Lab safety contract', 'Extra worked examples']);
    expect(c.announcements[0].title).toBe('Week 4: goggles. Bring your goggles Thursday.');
    expect(c.announcements[0].resources[0].name).toBe('FlameTest_Prelab.pdf');
    expect(c.gradeScale).toHaveLength(2);
    expect(c.holidays[0].title).toBe('Fall break');
    expect(c.participation.days).toBe(3);
    expect(c.messages[0].fromInstructor).toBe(true);
    expect(c.discussions[0].totalPosts).toBe(24);
    expect(r.payload.alerts[0].title).toBe('Lab Safety Quiz');
  });

  for (const op of BREAKABLE) {
    for (const mode of Object.keys(MODES)) {
      it(`survives ${op} returning ${mode}`, async () => {
        const r = await runBookmarklet(breaking(op, mode), { download: () => ({ downloadUrl: 'https://x/y' }) });
        expect(r.failed).toBeNull();
        expect(r.payload).not.toBeNull();
        expect(r.payload.kind).toBe('halo-export');
        // The assignments always come through: that is the floor.
        expect(r.payload.classes).toHaveLength(1);
        expect(r.payload.classes[0].assessments).toHaveLength(3);
        expect(r.payload.classes[0].assessments.map((a: any) => a.title)).toContain('Flame Test Lab Report');
        // And a real error is never silent. (A field of the wrong primitive type is not something GraphQL does,
        // and nulls inside a well-shaped response are just absent data, so neither of those is an error.)
        if (mode === 'null data' || mode === 'field missing' || mode === 'graphql error' || mode === 'network throw') {
          expect(r.payload.problems.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('says which kind broke, so an empty list is never mistaken for a quiet week', async () => {
    const r = await runBookmarklet(breaking('GetForumNotifications', 'graphql error'), { download: () => ({ downloadUrl: 'https://x/y' }) });
    expect(r.payload.problems.filter((p: any) => p.kind === 'announcements')).toHaveLength(2);
    // Absent, not empty: the app must not stamp announcements as freshly pulled.
    expect(r.payload.classes[0].announcements).toBeUndefined();
    expect(r.payload.classes[0].resources).toHaveLength(2);
    expect(r.said).toContain('Read 3 assignments in 1 class, 2 things Halo would not give up. Sending to the dashboard\u2026');
  });

  it('a class that blows up entirely costs that class, not the other five', async () => {
    const twoClasses = { getCourseClassesForUser: { courseClasses: [CLASSES.getCourseClassesForUser.courseClasses[0], { ...CLASSES.getCourseClassesForUser.courseClasses[0], id: 'C2', slugId: 'S2', classCode: 'ENG-105-ONL4', courseCode: 'ENG-105' }] } };
    const halo: Halo = (op, v, q) => {
      if (op === 'getCourseClassesForUser' && !q.includes('instructors')) return { data: twoClasses };
      if (v.slugId === 'S2' || v.courseClassSlugId === 'S2') throw new Error('S2 is on fire');
      return good(op, v, q);
    };
    const r = await runBookmarklet(halo);
    expect(r.failed).toBeNull();
    expect(r.payload.classes).toHaveLength(2);
    expect(r.payload.classes[1].courseCode).toBe('ENG-105');
    expect(r.payload.classes[1].assessments).toHaveLength(3);
    expect(r.payload.problems.some((p: any) => p.klass === 'ENG-105')).toBe(true);
    expect(r.payload.problems.some((p: any) => p.klass === 'CHM-113')).toBe(false);
  });

  it('only the class list itself is fatal, and it says what to do', async () => {
    const r = await runBookmarklet((op, v, q) => (op === 'getCourseClassesForUser' && !q.includes('instructors') ? { data: { getCourseClassesForUser: { courseClasses: [] } } } : good(op, v, q)));
    expect(r.failed).toBe('Halo returned no classes. Open a class in Halo, then click the bookmark again.');
  });

  it('missing __NEXT_DATA__ costs the rubric files and nothing else', async () => {
    const r = await runBookmarklet(good, { nextData: null });
    expect(r.failed).toBeNull();
    expect(r.payload.classes[0].assessments.find((a: any) => a.id === A3).attachments[0].downloadUrl).toBeUndefined();
    expect(r.payload.classes[0].assessments).toHaveLength(3);
  });
});

/**
 * A structural guard for the thing that actually went wrong: the request was inside a try and the code that read the
 * result was not. Every catch either records the loss or is one of the three that genuinely has nothing to say.
 */
describe('the guards themselves', () => {
  const src = bookmarkletSource({ dashOrigin: 'https://richardsgeorger-collab.github.io', dashPath: '/school-dashboard/#/settings?halo=1' });
  /** Bodies of every catch block, brace-balanced rather than regex-truncated. */
  const bodies: string[] = [];
  for (let i = src.indexOf('catch(e){'); i >= 0; i = src.indexOf('catch(e){', i + 1)) {
    let depth = 0;
    let j = i + 'catch(e)'.length;
    const start = j + 1;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    bodies.push(src.slice(start, j));
  }

  it('every query result is parsed inside the guard that caught its request', () => {
    // One try per gql call site, plus the per-class guard, plus the incidental ones.
    expect((src.match(/await gql\(/g) ?? []).length).toBe(14);
    for (const m of src.matchAll(/await gql\(/g)) {
      const before = src.slice(0, m.index);
      const opens = (before.match(/try\s*\{/g) ?? []).length;
      const closes = (before.match(/catch\(e\)\{/g) ?? []).length;
      expect(opens).toBeGreaterThan(closes);
    }
  });

  it('nothing fails silently except the three that have nothing to lose', () => {
    const silent = bodies.filter((b) => !b.includes('prob(') && !b.includes('Halo sync failed'));
    // The gql body's own json parse (it rethrows on the next line), the clipboard fallback, and the postMessage
    // inside the delivery loop, which is retried every tick until it lands. Opening the tab keeps its own error so
    // the failure message can tell a blocked pop-up from a tab that never answered.
    expect(silent).toEqual(['openErr=e;', '', '', '']);
  });

  it('the per-class body is wrapped, so one bad class cannot end the run', () => {
    expect(src).toContain("}catch(e){prob(code,'this class',e);}");
    expect(src.indexOf('for(var i=0;i<cls.length;i++)')).toBeLessThan(src.indexOf("prob(code,'this class',e)"));
  });
});
