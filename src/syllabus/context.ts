import type { Course } from '../domain/types';
import type { SyllabusDoc } from './db';

/**
 * A syllabus is stored whole. The old cap was 30,000 characters, which quietly threw away the end of a real GCU
 * syllabus — the later topics, where the discussion prompts for weeks six and seven live. Storage is IndexedDB in this
 * browser; a 60,000-character syllabus is nothing there, and the tail is the part that was being lost.
 */
export const SYLLABUS_STORE_MAX = 400_000;
/** What one class's syllabus may take in a prompt. About 32k tokens: bigger than any real syllabus. */
export const SYLLABUS_PROMPT_BUDGET = 120_000;
export const TRUNCATED_MARK = '[syllabus truncated]';

/** Tidy extracted text: collapse runs of blank lines and trailing spaces. Only an absurd file is ever cut, and it says so. */
export function tidySyllabusText(raw: string, max = SYLLABUS_STORE_MAX): string {
  const text = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max)}\n${TRUNCATED_MARK}` : text;
}

/** A syllabus stored before the cap was lifted: its end is gone and only a fresh copy of the file can bring it back. */
export const wasStoredTruncated = (text: string): boolean => text.trimEnd().endsWith(TRUNCATED_MARK);

export interface SyllabusPiece {
  /** "Topic 6: Revision" or "Course information". */
  heading: string;
  text: string;
}

const TOPIC_LINE = /^Topic (\d+)\s*[::]\s*(.*)$/;

/** The syllabus cut at its topic headings: what comes before them, then one piece per topic. */
export function splitSyllabus(text: string): { head: SyllabusPiece; topics: SyllabusPiece[] } {
  const lines = text.split('\n');
  const head: string[] = [];
  const topics: SyllabusPiece[] = [];
  let current: SyllabusPiece | null = null;
  for (const line of lines) {
    const m = TOPIC_LINE.exec(line.trim());
    if (m) {
      current = { heading: `Topic ${m[1]}${m[2] ? `: ${m[2]}` : ''}`, text: line };
      topics.push(current);
      continue;
    }
    if (current) current.text += `\n${line}`;
    else head.push(line);
  }
  return { head: { heading: 'Course information', text: head.join('\n').trim() }, topics };
}

export interface SyllabusForPrompt {
  /** What goes in the prompt, with a line naming anything left out. */
  text: string;
  stored: number;
  sent: number;
  /** Headings that did not fit, named so nothing is dropped in silence. */
  dropped: string[];
  /** The stored copy itself is missing its end, from before the cap was lifted. */
  storedTruncated: boolean;
}

/**
 * The syllabus for one prompt. Whole when it fits, which is the normal case. When it does not, the topic sections win
 * over the course-information preamble, and whatever is left out is named in the text the model reads and in the
 * numbers the screen prints. Nothing is ever dropped silently.
 */
export function syllabusForPrompt(text: string, budget = SYLLABUS_PROMPT_BUDGET): SyllabusForPrompt {
  const stored = text.length;
  const storedTruncated = wasStoredTruncated(text);
  if (stored <= budget) return { text, stored, sent: stored, dropped: [], storedTruncated };

  const { head, topics } = splitSyllabus(text);
  const dropped: string[] = [];
  const kept: SyllabusPiece[] = [];
  let used = 0;
  // Topic sections carry the assignments and their prompts; the preamble is policy. Topics first, in order.
  for (const t of topics) {
    if (used + t.text.length <= budget) {
      kept.push(t);
      used += t.text.length;
    } else dropped.push(t.heading);
  }
  const room = budget - used;
  const headText = head.text.length <= room ? head.text : '';
  if (head.text && !headText) dropped.unshift(head.heading);
  const note = dropped.length ? `\n\n[Left out of this copy, too long to fit: ${dropped.join(', ')}. Say so rather than guess at anything they would have covered.]` : '';
  const body = [headText, ...kept.map((t) => t.text)].filter(Boolean).join('\n\n');
  return { text: body + note, stored, sent: body.length, dropped, storedTruncated };
}

/** The block the coach reads: one section per class that has a syllabus, in course order. */
export function syllabusContext(courses: Course[], docs: SyllabusDoc[]): string {
  const byCourse = new Map(docs.map((d) => [d.courseId, d]));
  const parts: string[] = [];
  for (const c of courses) {
    const d = byCourse.get(c.id);
    if (!d || !d.text.trim()) continue;
    // Six syllabi share the coach's context, so each gets a slice of the budget rather than all of it.
    const one = syllabusForPrompt(d.text, Math.floor(SYLLABUS_PROMPT_BUDGET / Math.max(1, courses.length)));
    parts.push(`## ${c.code} ${c.name} (syllabus, ${d.name})\n${one.text.trim()}`);
  }
  return parts.join('\n\n');
}
