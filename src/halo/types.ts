/** Payload the Halo bookmarklet produces. Assignment data only, never tokens. */
export interface HaloExport {
  kind: 'halo-export';
  version: 1;
  exportedAt: string;
  source: 'bookmarklet' | 'paste';
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
  assessments: HaloAssessment[];
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
}
