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
  /** The audit's short note: the old date, which file, why. */
  note?: string;
  /** Titles of items this one must be done before, when the audit said so. */
  gates?: string[];
}

/** A point the professor made, with the words and the moment, so it can be checked. */
export interface SaidPoint {
  point: string;
  quote: string;
  /** mm:ss into the recording. */
  at: string;
}

export interface SlideNote {
  /** Slide number in the same-day deck, when one was on file. */
  slide: number | null;
  title: string;
  why: string;
}

export interface Term {
  term: string;
  meaning: string;
}

/** What a lecture said that a file cannot: what was stressed, what was called exam material, which slides got the time. */
export interface LectureKnowledge {
  emphasized: SaidPoint[];
  examFlags: SaidPoint[];
  dwelt: SlideNote[];
  skipped: SlideNote[];
  terms: Term[];
  /** The deck the recording was read against, when one was on file. */
  deckId: string | null;
}

export interface LectureNotes {
  summary: string[];
  concepts: string[];
  mentions: Mention[];
  model: string;
  createdAt: string;
  knowledge?: LectureKnowledge | null;
}
