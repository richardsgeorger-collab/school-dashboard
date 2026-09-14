/** What the optional Claude pass produces from a transcript. */
export type MentionKind = 'new' | 'date_change' | 'cancel' | 'info' | 'grade';
export type Confidence = 'high' | 'medium' | 'low';

export interface Mention {
  id: string;
  /** The professor's words, as transcribed. */
  quote: string;
  kind: MentionKind;
  /** What the mention is about, e.g. "Quiz 2" or "Chapter 4 reading check". */
  title: string;
  /** Absolute date YYYY-MM-DD, resolved from "Friday" against the lecture date. */
  date: string | null;
  /** HH:mm when a time was said or implied ("before class"). */
  time: string | null;
  points: number | null;
  confidence: Confidence;
  /** Planner item id when the model matched one from the list it was given. */
  itemId: string | null;
  /** Class this mention is about, when mentions span classes (Halo check). Defaults to the review's class. */
  courseId?: string | null;
  /** Points earned, for a posted grade. */
  score?: number | null;
  /** Where a Halo check line came from, so the review can group by it. */
  audit?: { status: string; prefix: 'ENG105-PENDING' | 'OLD-SECTION' | null };
}

export interface LectureNotes {
  summary: string[];
  concepts: string[];
  mentions: Mention[];
  model: string;
  createdAt: string;
}
