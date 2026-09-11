import type { Course } from '../domain/types';
import type { SyllabusDoc } from './db';

/** Per-class cap so six syllabi stay well under the coach's context budget. */
export const SYLLABUS_CHARS = 30_000;

/** Tidy extracted text: collapse runs of blank lines and trailing spaces, cap length. */
export function tidySyllabusText(raw: string, max = SYLLABUS_CHARS): string {
  const text = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max)}\n[syllabus truncated]` : text;
}

/** The block the coach reads: one section per class that has a syllabus, in course order. */
export function syllabusContext(courses: Course[], docs: SyllabusDoc[]): string {
  const byCourse = new Map(docs.map((d) => [d.courseId, d]));
  const parts: string[] = [];
  for (const c of courses) {
    const d = byCourse.get(c.id);
    if (!d || !d.text.trim()) continue;
    parts.push(`## ${c.code} ${c.name} (syllabus, ${d.name})\n${d.text.trim()}`);
  }
  return parts.join('\n\n');
}
