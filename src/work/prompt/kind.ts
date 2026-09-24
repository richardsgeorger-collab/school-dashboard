import type { Course, Item } from '../../domain/types';

/**
 * What the work is decides what the prompt asks for. Studying wants practice; work in the major wants method and
 * worked examples on other problems; the general-education requirements want every piece of scaffolding that is
 * not the submitted prose; and an assignment that tells the student to use an AI tool wants exactly that done.
 */
export type PromptKind = 'study' | 'major' | 'lab' | 'gened' | 'gened-dq' | 'ai-required';

/** The two general-education requirements, where scaffolding is the whole point. */
export const GENED = /^(ENG-105|UNV-106)\b/;

const STUDY = /\b(quiz|exam|midterm|final exam|test)\b/i;
/** An instruction to use an AI tool, as opposed to a question about AI tools. */
const USE_AI = /\b(use|open|enter|type|paste|prompt|ask)\b[^.]{0,60}\b(genai|gen ai|chatgpt|generative ai|ai tool|an ai|copilot|gemini|claude)\b/i;

export function aiRequired(item: Pick<Item, 'title' | 'notes'>): boolean {
  return /\bai[- ]assisted\b/i.test(item.title) || USE_AI.test(item.notes ?? '');
}

export function promptKind(item: Pick<Item, 'title' | 'type' | 'notes'>, course: Pick<Course, 'code'>): PromptKind {
  if (item.type === 'quiz' || item.type === 'exam' || STUDY.test(item.title)) return 'study';
  if (GENED.test(course.code)) {
    if (course.code.startsWith('UNV-106') && aiRequired(item)) return 'ai-required';
    return item.type === 'discussion' ? 'gened-dq' : 'gened';
  }
  if (item.type === 'lab' || /\blab report\b|\bexperiment\b/i.test(`${item.title} ${item.notes ?? ''}`)) return 'lab';
  return 'major';
}
