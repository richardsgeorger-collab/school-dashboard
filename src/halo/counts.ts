import type { HaloExport } from './types';

/**
 * What a sync actually brought back, counted. A run that got everything and a run that got nothing look identical
 * once the assignment diff is on screen, and a query that answers with an empty list never trips the failure line.
 * Every number is reported, zeros included, because a zero is the informative case.
 */
export interface PullCounts {
  classes: number;
  assessments: number;
  grades: number;
  announcements: number;
  rubrics: number;
  feedback: number;
  quizzes: number;
  resources: number;
  discussions: number;
  messages: number;
  alerts: number;
  /** Classes that came back with a grade scale, participation policy, or holidays. */
  classFacts: number;
  /** Rubric attachments that resolved to a download link. */
  rubricFiles: number;
}

export const COUNT_WORDS: { key: keyof PullCounts; one: string; many: string }[] = [
  { key: 'assessments', one: 'assignment', many: 'assignments' },
  { key: 'grades', one: 'grade', many: 'grades' },
  { key: 'announcements', one: 'announcement', many: 'announcements' },
  { key: 'rubrics', one: 'rubric', many: 'rubrics' },
  { key: 'feedback', one: 'feedback comment', many: 'feedback comments' },
  { key: 'quizzes', one: 'quiz attempt', many: 'quiz attempts' },
  { key: 'resources', one: 'class resource', many: 'class resources' },
  { key: 'discussions', one: 'discussion forum', many: 'discussion forums' },
  { key: 'messages', one: 'message', many: 'messages' },
  { key: 'alerts', one: 'alert', many: 'alerts' },
  { key: 'rubricFiles', one: 'rubric file', many: 'rubric files' },
];

export function pullCounts(payload: HaloExport): PullCounts {
  const c: PullCounts = { classes: 0, assessments: 0, grades: 0, announcements: 0, rubrics: 0, feedback: 0, quizzes: 0, resources: 0, discussions: 0, messages: 0, alerts: 0, classFacts: 0, rubricFiles: 0 };
  c.alerts = payload.alerts?.length ?? 0;
  for (const k of payload.classes ?? []) {
    c.classes += 1;
    c.announcements += k.announcements?.length ?? 0;
    c.resources += k.resources?.length ?? 0;
    c.discussions += k.discussions?.length ?? 0;
    c.messages += k.messages?.length ?? 0;
    if ((k.gradeScale?.length ?? 0) > 0 || k.participation || (k.holidays?.length ?? 0) > 0) c.classFacts += 1;
    for (const a of k.assessments ?? []) {
      c.assessments += 1;
      // A grade is a posted score or a status Halo put on it; either is more than the assignment list knows.
      if (a.score !== null || a.status !== null) c.grades += 1;
      if (a.rubric) c.rubrics += 1;
      if (a.feedback) c.feedback += 1;
      if (a.quiz) c.quizzes += 1;
      for (const f of a.attachments ?? []) if (f.downloadUrl) c.rubricFiles += 1;
    }
  }
  return c;
}

const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

/** The whole tally in one sentence, zeros included. */
export function countsLine(c: PullCounts): string {
  const parts = COUNT_WORDS.map((w) => n(c[w.key], w.one, w.many));
  parts.push(`class facts for ${c.classFacts} of ${c.classes} ${c.classes === 1 ? 'class' : 'classes'}`);
  return `${parts.join(', ')}.`;
}

/** The kinds that came back with nothing at all, for the one line that says so plainly. */
export function emptyKinds(c: PullCounts): string[] {
  return COUNT_WORDS.filter((w) => c[w.key] === 0).map((w) => w.many);
}
