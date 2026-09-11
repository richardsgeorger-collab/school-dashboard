/** What the optional Claude pass produces from a transcript. */
export type MentionKind = 'new' | 'date_change' | 'cancel' | 'info';
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
}

export interface LectureNotes {
  summary: string[];
  concepts: string[];
  mentions: Mention[];
  model: string;
  createdAt: string;
}
