/** Payload the Halo bookmarklet produces. Assignment data only, never tokens. */
export interface HaloExport {
  kind: 'halo-export';
  version: 1;
  exportedAt: string;
  source: 'bookmarklet' | 'paste' | 'ics';
  classes: HaloClass[];
  /** Halo's own alert feed, account-wide rather than per class. */
  alerts?: HaloAlert[];
  /** What the bookmark asked for and did not get. An empty list and a failed call must never read the same. */
  problems?: HaloProblem[];
  /** Which build of the bookmarklet produced this. Absent means a bookmark saved before builds were stamped. */
  build?: string;
  /** The kinds of data this build even tries to pull, so a missing kind can be told from an unasked one. */
  pulls?: string[];
}

/** One thing the sync could not read. `klass` is the course code, or null when the call was not per class. */
export interface HaloProblem {
  klass: string | null;
  /** Plain words for what was lost: 'announcements', 'instructor feedback', 'rubric'. */
  kind: string;
  message: string;
}

export interface HaloClass {
  id: string;
  slugId: string;
  classCode: string;
  courseCode: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  stage: string | null;
  modality: string | null;
  credits: number | null;
  /** Instructor names, when the export carried them. */
  instructors?: string[];
  assessments: HaloAssessment[];
  /**
   * Announcement posts, newest first. Optional: a bookmark from before this existed, or a run where the
   * announcements call failed, carries the class without them rather than failing the whole export.
   */
  announcements?: HaloAnnouncement[];
  /** Files and links the class publishes, as the instructor filed them. */
  resources?: HaloResource[];
  /** The letter scale this class is graded on. */
  gradeScale?: HaloGradeEntry[];
  /** Days the class does not meet. */
  holidays?: HaloHoliday[];
  /** How many days and posts participation asks for. */
  participation?: { description: string | null; days: number | null; posts: number | null };
  /** Discussion forums and whether the student has posted in them. */
  discussions?: HaloDiscussion[];
  /** Direct messages between the student and the instructor, newest first. */
  messages?: HaloMessage[];
}

export interface HaloResource {
  id: string;
  title: string;
  description: string | null;
  /** Set by the instructor rather than shipped with the course. */
  instructorAdded: boolean;
  /** Which topic it belongs to, when it came from a unit. */
  unit: string | null;
  files: { id: string; name: string; kind: string | null; type: string | null }[];
}

export interface HaloGradeEntry {
  label: string;
  minPercent: number | null;
  maxPercent: number | null;
}

export interface HaloHoliday {
  title: string;
  description: string | null;
  startDate: string | null;
  /** Days it runs. */
  duration: number | null;
}

export interface HaloDiscussion {
  forumId: string;
  title: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  /** Posts in the thread, the student's own included. */
  totalPosts: number | null;
}

export interface HaloMessage {
  id: string;
  forumId: string | null;
  content: string;
  publishedAt: string | null;
  /** Who wrote it, and whether that was the student. */
  author: string | null;
  fromInstructor: boolean;
}

/** One alert from Halo's own feed: the cheapest signal that something changed. */
export interface HaloAlert {
  id: string;
  classId: string | null;
  type: string | null;
  at: string | null;
  read: boolean;
  title: string | null;
  assessmentId: string | null;
  sender: string | null;
}

/**
 * One announcement post. At GCU the real weekly work often lives here rather than in the assignment list, so the
 * body is kept whole.
 */
export interface HaloAnnouncement {
  id: string;
  forumId: string | null;
  title: string;
  /** The post body as Halo stores it, HTML and all. Stripped when it is read, never on the way in. */
  content: string;
  /** When the student sees it. */
  publishedAt: string | null;
  modifiedAt: string | null;
  /** Who posted it, when the export carried a name. */
  author: string | null;
  /** Halo asked the student to acknowledge it. */
  mustAcknowledge: boolean;
  /** The student has acknowledged it. */
  acknowledged: boolean;
  /** Files attached to the post: name and kind only, never the bytes. */
  resources: { id: string; name: string; kind: string | null; type: string | null }[];
}

export interface HaloAssessment {
  id: string;
  title: string;
  description: string | null;
  unit: string | null;
  unitSequence: number | null;
  sequence: number | null;
  startDate: string | null;
  /** The student's own due date (accommodated or reassigned when Halo has one). */
  dueDate: string | null;
  /** Class-wide due date, kept for reference. */
  classDueDate?: string | null;
  points: number | null;
  /** ASSIGNMENT | DISCUSSION_QUESTION | LTI | PARTICIPATION | QUIZ */
  type: string;
  /** IN_PERSON, TIMED, PRACTICE, BENCHMARK, USES_LOPES_CLOUD, … */
  tags: string[];
  inPerson: boolean;
  isGroupEnabled: boolean;
  requiresLopesWrite: boolean;
  /** UPCOMING | ACTIVE | IN_PROGRESS | SUBMITTED | LATE | OVERDUE | REASSIGNED | PUBLISHED */
  status: string | null;
  submittedAt: string | null;
  /** Points earned, when Halo has published a grade. */
  score: number | null;
  /** Link into Halo, when the export carried one. */
  url?: string | null;
  /** The date string exactly as the export wrote it, for the trust line. */
  rawDue?: string | null;
  /** The rubric this is graded against, when Halo has one. */
  rubric?: HaloRubric | null;
  /** What the instructor wrote about the submitted work. */
  feedback?: HaloFeedback | null;
  /** A quiz attempt's result, when this assessment is a quiz that has been taken. */
  quiz?: HaloQuizResult | null;
  /** Files attached to the assignment in Halo. */
  attachments?: { id: string; resourceId: string | null; title: string; downloadUrl?: string }[];
}

export interface HaloRubric {
  id: string;
  name: string | null;
  criteria: {
    id: string;
    name: string;
    description: string | null;
    points: number | null;
    /** What each level of achievement looks like, best first as Halo orders them. */
    levels: { cellId: string; name: string | null; description: string | null; points: number | null }[];
  }[];
}

export interface HaloFeedback {
  /** The instructor's overall comment. */
  comment: string | null;
  gradedAt: string | null;
  /** Per-criterion: which level was chosen and anything written about it. */
  criteria: { criteriaId: string; cellId: string | null; comment: string | null }[];
  /** Files the instructor attached to the feedback. */
  files: { id: string; name: string }[];
  /** The student's own post, for a discussion assessment: the only proof it actually went in. */
  post?: { publishedAt: string; words: number | null } | null;
}

export interface HaloQuizResult {
  userQuizId: string;
  finalScore: number | null;
  answered: number | null;
  correct: number | null;
  incorrect: number | null;
  submittedAt: string | null;
  /** The questions as asked, with what the student picked. Correctness per question is not exposed to students. */
  questions: { id: string; type: string | null; content: string; chosen: string[] }[];
}
