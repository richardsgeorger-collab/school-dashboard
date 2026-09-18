import { describe, expect, it } from 'vitest';
import { countsLine, emptyKinds, pullCounts } from './counts';
import { mkAssessment, mkClass, mkExport } from './fixtures';

const full = () =>
  mkExport([
    mkClass({
      id: 'h1',
      courseCode: 'CHM-113',
      announcements: [
        { id: 'a1', forumId: 'f1', title: 'Goggles', content: 'Bring them', publishedAt: '2026-09-17T14:00:00Z', modifiedAt: null, author: 'Ana', mustAcknowledge: false, acknowledged: false, resources: [] },
      ],
      resources: [{ id: 'r1', title: 'Safety', description: null, instructorAdded: false, unit: null, files: [] }],
      discussions: [{ forumId: 'd1', title: 'DQ 1', description: null, startDate: null, dueDate: null, totalPosts: 3 }],
      messages: [{ id: 'm1', forumId: 'if1', content: 'hi', publishedAt: null, author: 'Ana', fromInstructor: true }],
      gradeScale: [{ label: 'A', minPercent: 90, maxPercent: 100 }],
      assessments: [
        mkAssessment({
          id: 'x1',
          title: 'Lab',
          status: 'PUBLISHED',
          score: 18,
          rubric: { id: 'R', name: 'R', criteria: [] },
          feedback: { comment: 'Good', gradedAt: null, criteria: [], files: [], post: null },
          quiz: { userQuizId: 'q', finalScore: 7, answered: 10, correct: 7, incorrect: 3, submittedAt: null, questions: [] },
          attachments: [{ id: 'at', resourceId: 'res', title: 'rubric.pdf', downloadUrl: 'https://x/y' }],
        }),
        mkAssessment({ id: 'x2', title: 'Quiz', status: null, score: null }),
      ],
    }),
  ]);

describe('what a sync actually pulled', () => {
  it('counts every kind, and a class counts once for its facts', () => {
    const c = pullCounts(full());
    expect(c).toEqual({ classes: 1, assessments: 2, grades: 1, announcements: 1, rubrics: 1, feedback: 1, quizzes: 1, resources: 1, discussions: 1, messages: 1, alerts: 0, classFacts: 1, rubricFiles: 1 });
  });

  it('reports zeros rather than leaving them out, which is the whole point', () => {
    const bare = mkExport([mkClass({ id: 'h1', courseCode: 'CHM-113', assessments: [mkAssessment({ id: 'x', title: 'T', status: null, score: null })] })]);
    const line = countsLine(pullCounts(bare));
    expect(line).toBe('1 assignment, 0 grades, 0 announcements, 0 rubrics, 0 feedback comments, 0 quiz attempts, 0 class resources, 0 discussion forums, 0 messages, 0 alerts, 0 rubric files, class facts for 0 of 1 class.');
    expect(emptyKinds(pullCounts(bare))).toContain('announcements');
  });

  it('a full sync and an empty one do not read the same', () => {
    const rich = countsLine(pullCounts(full()));
    const bare = countsLine(pullCounts(mkExport([mkClass({ id: 'h1', courseCode: 'CHM-113', assessments: [] })])));
    expect(rich).not.toBe(bare);
    expect(rich).toContain('1 announcement,');
    expect(bare).toContain('0 announcements,');
    expect(emptyKinds(pullCounts(full()))).toEqual(['alerts']);
  });

  it('singular and plural both read as English', () => {
    const c = pullCounts(full());
    expect(countsLine(c)).toContain('1 feedback comment,');
    expect(countsLine({ ...c, feedback: 2, classes: 2, classFacts: 2 })).toContain('2 feedback comments,');
    expect(countsLine({ ...c, classes: 2, classFacts: 1 })).toContain('class facts for 1 of 2 classes.');
  });
});
