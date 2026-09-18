/** Payload the Halo bookmarklet produces. Assignment data only, never tokens. */
export interface HaloExport {
  kind: 'halo-export';
  version: 1;
  exportedAt: string;
  source: 'bookmarklet' | 'paste' | 'ics';
  classes: HaloClass[];
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
}
