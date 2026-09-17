import type { Course, Item } from '../domain/types';

/**
 * A starter prompt: what to hand the tutor (or paste anywhere) to get going on one assignment, already loaded with
 * what it asks for, what earns points, and the material that covers it. It asks for a way in, never for the work.
 */
export interface StarterInput {
  item: Item;
  course: Course;
  /** Labels of the material on file that covers it, when known. */
  sources?: string[];
  /** The next unchecked milestone, when there is one. */
  nextStep?: string | null;
  /** What the professor flagged as exam material on this topic, when any. */
  flagged?: string[];
}

const KIND_WORDS: Record<Item['type'], string> = {
  exam: 'study for this exam',
  quiz: 'prepare for this quiz',
  homework: 'work through this problem set',
  lab: 'get this lab report going',
  paper: 'get this paper started',
  project: 'get this project started',
  discussion: 'get this discussion post started',
  participation: 'prepare for this',
  other: 'get started on this',
};

/** The line that keeps it honest, tuned to the kind of work. */
export function theLine(type: Item['type']): string {
  if (type === 'discussion' || type === 'paper' || type === 'project') return 'Do not write any of it for me. Help me pick where to start, ask what I already think, and check my reasoning as I go.';
  if (type === 'homework' || type === 'lab') return 'Do not solve anything for me. Walk me through the setup of the first problem, ask what I would try, and give me the next step only when I am stuck.';
  if (type === 'exam' || type === 'quiz') return 'Quiz me from the material rather than lecturing me. Start with what I am weakest on, one question at a time.';
  return 'Do not do the work for me. Help me see where to begin and check my thinking.';
}

/** The prompt, plain text, ready to copy or to hand the tutor. */
export function starterPrompt(input: StarterInput): string {
  const { item, course } = input;
  const asks = item.plan?.asks?.trim() || item.brief?.asks.join(' ') || '';
  const rubric = item.brief?.rubric.slice(0, 5).map((r) => `- ${r.criterion}${r.points !== null ? ` (${r.points} pts)` : ''}${r.how ? `: ${r.how}` : ''}`) ?? [];
  const sources = (input.sources?.length ? input.sources : item.plan?.sources.map((s) => s.label) ?? []).slice(0, 6);
  const lines: string[] = [];
  lines.push(`Help me ${KIND_WORDS[item.type]}: "${item.title}" for ${course.code} ${course.name}.`);
  if (asks) lines.push(`\nWhat it asks for: ${asks}`);
  if (rubric.length) lines.push(`\nWhat earns points:\n${rubric.join('\n')}`);
  if (sources.length) lines.push(`\nMy class material that covers it: ${sources.join('; ')}. Teach from that, in my professor's terms, and tell me which slide or lecture you are drawing on.`);
  if (input.flagged?.length) lines.push(`\nMy professor called this exam material: ${input.flagged.slice(0, 3).join('; ')}.`);
  if (input.nextStep) lines.push(`\nThe step I am on: ${input.nextStep}.`);
  lines.push(`\n${theLine(item.type)}`);
  return lines.join('\n');
}

/** A short first turn for the tutor, so the thread opens on the work and not on a wall of context. */
export const starterAsk = (item: Item): string => `Help me ${KIND_WORDS[item.type]}: "${item.title}". Where should I begin?`;
