import type { QuizSource } from '../quiz/sources';

/** Words that name a place in a course, not a subject: "Topic 4", "Week 5", "Chapter 3" match every deck's tag. */
const PLACE = new Set(['topic', 'topics', 'unit', 'units', 'week', 'weeks', 'chapter', 'chapters', 'module', 'modules', 'lesson', 'lessons', 'part', 'section', 'quiz', 'exam', 'test', 'midterm', 'final', 'review', 'and', 'the', 'of', 'for', 'with', 'from', 'into']);

/** The words of a topic that could be looked for in the material. */
export const topicTerms = (topic: string): string[] => [...new Set(topic.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PLACE.has(w)))];

/**
 * Whether the material on file says anything about the topic by name. A test's own topic often comes from the
 * syllabus ("Topic 4: Molecular Shapes") while the slides on file are about something else; asking the model for
 * cards "on molecular shapes" from stoichiometry slides gets an honest empty answer. Then the material itself is the topic.
 */
export function topicCovered(topic: string, sources: Pick<QuizSource, 'text'>[]): boolean {
  const terms = topicTerms(topic);
  if (terms.length === 0) return false;
  const text = sources.map((s) => s.text.toLowerCase()).join('\n');
  return terms.some((t) => text.includes(t));
}
