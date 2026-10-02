import type { SystemBlock } from '../ai/gateway';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { haloLink } from '../domain/heroFacts';
import type { Course, Item } from '../domain/types';

/**
 * "Ask a question" on one assignment (George, 2026-10-02): the chat is scoped to this assignment and answers only from
 * what the planner holds about it: title, class, due date, points, the instructions Halo gave, the rubric, the
 * instructor's feedback and the to-dos announcements added. Reuses Ask's pipeline; this only builds the facts block and
 * the rules that go with it. Nothing here is a guess: a field with nothing in it is said to be missing.
 */
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function assignmentFacts(item: Item, course: Course | null, tz: string): string {
  const due = item.dueAt ? `${fmtDate(dateOf(item.dueAt, tz), 'long')} at ${fmtTime(item.dueAt, tz)}` : 'not listed';
  const lines = [
    `Title: ${item.title}${item.label && item.label !== item.title ? ` (shown in the planner as "${item.label}")` : ''}`,
    `Class: ${course ? `${course.code} ${course.name}` : 'unknown'}`,
    `Type: ${item.type}`,
    `Due: ${due}`,
    `Points: ${item.points > 0 ? item.points : 'not listed'}`,
    `Status: ${item.status}${item.score !== null ? `, score ${item.score}` : ''}`,
    `Instructions from Halo: ${item.notes?.trim() ? cap(item.notes.trim(), 6000) : 'none came with this assignment'}`,
  ];
  if (item.brief?.asks.length) lines.push(`What the planner read it as asking: ${item.brief.asks.join(' ')}`);
  const rubric = item.rubric;
  if (rubric?.criteria.length)
    lines.push(
      `Rubric${rubric.name ? ` "${rubric.name}"` : ''}:\n${rubric.criteria
        .map((c) => `- ${c.name}${c.points !== null ? ` (${c.points} pts)` : ''}${c.description ? `: ${cap(c.description, 400)}` : ''}${c.levels.length ? ` | levels: ${c.levels.map((l) => `${l.name ?? '?'}${l.points !== null ? ` ${l.points}` : ''}${l.description ? ` = ${cap(l.description, 160)}` : ''}`).join('; ')}` : ''}`)
        .join('\n')}`,
    );
  else lines.push('Rubric: none on file for this assignment');
  const fb = item.feedback;
  if (fb && (fb.comment || fb.criteria.some((c) => c.comment))) {
    const byId = new Map((rubric?.criteria ?? []).map((c) => [c.id, c.name]));
    lines.push(`Instructor feedback${fb.gradedAt ? ` (graded ${fb.gradedAt.slice(0, 10)})` : ''}: ${fb.comment ? cap(fb.comment, 1500) : ''}${fb.criteria.filter((c) => c.comment).map((c) => ` [${byId.get(c.criteriaId) ?? 'criterion'}: ${cap(c.comment!, 400)}]`).join('')}`);
  }
  const reqs = (item.requirements ?? []).filter((r) => r.scope !== 'reference');
  if (reqs.length)
    lines.push(
      `To-dos from announcements on this assignment (the professor's words are in quotes):\n${reqs
        .map((r) => `- ${r.text}${r.dueAt ? ` (own deadline ${fmtDate(dateOf(r.dueAt, tz), 'short')})` : ''}${r.source?.quote ? ` — "${cap(r.source.quote, 300)}"` : ''}${r.source?.kind === 'announcement' && r.source.title ? ` [announcement: ${r.source.title}]` : ''}`)
        .join('\n')}`,
    );
  else lines.push('To-dos from announcements: none linked to this assignment');
  return lines.join('\n');
}

/** The rules for an assignment question: only these facts, and "it is not listed" when it is not. */
export const ASSIGNMENT_QUESTION_RULES = `The student tapped "Ask a question" on ONE assignment and is asking about it. Below is everything the planner holds about it. This overrides the usual style where they conflict.
- Answer ONLY from the assignment facts below (instructions, due date, points, rubric, instructor feedback, announcement to-dos). Quote the exact wording when it helps, and say where it comes from (the instructions, the rubric, an announcement).
- Never guess. If the answer is not in those facts (a word count, a page limit, a format, a date, a source count), say plainly that it is not listed here, then tell them to check the instructions in Halo with the Open in Halo button below your answer. Never invent a due date, a length or a rule, and never fill the gap with what is usual for assignments like this.
- Do not teach the subject or write any of the work in this mode. Two or three sentences, plain.
- The due date and points are exactly as given below; repeat them as written.`;

export function assignmentBlocks(item: Item, course: Course | null, tz: string): SystemBlock[] {
  return [{ text: `${ASSIGNMENT_QUESTION_RULES}\n\nAssignment facts:\n${assignmentFacts(item, course, tz)}` }];
}

/** The three tap-to-fill questions above the empty input. */
export const QUESTION_CHIPS = ['When is it due?', 'How long does it need to be?', 'What does the rubric want?'] as const;

/** Where "Open in Halo" goes for this assignment (never a guessed address). */
export const haloStep = (item: Item, course: Course | null): { label: string; href: string } => {
  const l = haloLink(item, course ?? undefined);
  return { label: 'Open in Halo', href: l.href };
};
