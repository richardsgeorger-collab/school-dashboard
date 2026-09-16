import { arr, callTool, hashText, obj, str, type ToolSpec } from '../ai/client';
import type { Course } from '../domain/types';
import { sourcesBlock, type QuizSource } from '../quiz/sources';

/**
 * Exam materials from the student's own material: a formula sheet, flashcards, a one-page summary per topic, built
 * only from the slides, transcripts, and syllabus on file, weighted toward what they have been missing. Cached by the
 * sources they were built from.
 */
export type KitKind = 'formulas' | 'cards' | 'onepager';

export interface FormulaRow {
  name: string;
  formula: string;
  when: string;
  sourceId: string;
}

export interface Card {
  front: string;
  back: string;
  sourceId: string;
}

export interface KitSection {
  heading: string;
  lines: string[];
  sourceId: string;
}

export interface StudyKit {
  courseId: string;
  kind: KitKind;
  topic: string;
  formulas: FormulaRow[];
  cards: Card[];
  sections: KitSection[];
  sources: QuizSource[];
  weak: string[];
  model: string;
  at: string;
  sourcesHash: string;
}

/** Not strict: kitFromTool validates every field, and three nested arrays are exactly what blows a compiled grammar. */
export const KIT_TOOL: ToolSpec = {
  name: 'study_kit',
  description: 'Study material built only from the sources given: a formula sheet, flashcards, or a one-page summary, each line citing its source.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['formulas', 'cards', 'sections'],
    properties: {
      formulas: {
        type: 'array',
        description: 'For a formula sheet: every formula, relationship, and constant the sources carry. Empty for other kinds.',
        items: { type: 'object', additionalProperties: false, required: ['name', 'formula', 'when', 'sourceId'], properties: { name: { type: 'string' }, formula: { type: 'string', description: 'Written the way the class writes it, plain text.' }, when: { type: 'string', description: 'When to reach for it, one line.' }, sourceId: { type: 'string', description: 'The [S#] id.' } } },
      },
      cards: {
        type: 'array',
        description: 'For flashcards: 12 to 20, one idea each. Empty for other kinds.',
        items: { type: 'object', additionalProperties: false, required: ['front', 'back', 'sourceId'], properties: { front: { type: 'string', description: 'A question or a term.' }, back: { type: 'string', description: 'The answer, in the professor’s words where the sources have them.' }, sourceId: { type: 'string' } } },
      },
      sections: {
        type: 'array',
        description: 'For a one-pager: four to seven short sections. Empty for other kinds.',
        items: { type: 'object', additionalProperties: false, required: ['heading', 'lines', 'sourceId'], properties: { heading: { type: 'string' }, lines: { type: 'array', items: { type: 'string' }, description: 'Two to five plain lines.' }, sourceId: { type: 'string' } } },
      },
    },
  },
};

export const KIT_SYSTEM = `You build study material for a college freshman from their own class material only: the slides, lecture transcript stretches, and syllabus given below with [S#] ids. Nothing from outside those sources, ever; if the sources are thin, the material is short and says so in its last line.

Rules:
- Formula sheet: every formula, relationship, definition-with-a-symbol, and constant the sources carry, written the way the class writes it, with when to use it in one line. Group by topic in the order the sources teach it.
- Flashcards: 12 to 20, one idea each. The front is a question or a term; the back is the answer in the professor's words where the sources have them, one to three lines. Mix recall and "what would you do" cards.
- One-pager: four to seven short sections that a student could read in five minutes: what the topic is, how the professor framed it, the steps or method, the traps the lectures warned about, what was called exam material.
- Weight toward the weak topics listed: they come first and get more cards or lines. Anything the professor called exam material comes next.
- Every entry cites its [S#] source. Never invent a source id.
- Never write anything the student would submit. This is study material, not an assignment.
Answer only through the study_kit tool.`;

export function buildKitPrompt(course: Course, kind: KitKind, topic: string, sources: QuizSource[], weak: string[], flagged: string[]): { system: { text: string; cache?: boolean }[]; user: string } {
  const want = kind === 'formulas' ? 'a formula sheet (fill formulas only)' : kind === 'cards' ? 'flashcards (fill cards only)' : 'a one-page summary (fill sections only)';
  return {
    system: [{ text: KIT_SYSTEM, cache: true }, { text: `Sources (cite as [S#]):\n\n${sourcesBlock(sources)}`, cache: true }],
    user: `Class: ${course.code} ${course.name}\nBuild: ${want}\nTopic: ${topic || 'everything on file, in teaching order'}\nWeak topics, first and heaviest: ${weak.join(', ') || '(none known)'}\nCalled exam material by the professor: ${flagged.join('; ') || '(nothing recorded)'}`,
  };
}

export const kitHash = (kind: KitKind, topic: string, sources: QuizSource[], weak: string[]): string => hashText(`${kind}|${topic.toLowerCase()}|${weak.join(',')}|${sources.map((s) => `${s.id}:${s.label}:${s.text.length}`).join('|')}`);

export function kitFromTool(raw: unknown, args: { course: Course; kind: KitKind; topic: string; sources: QuizSource[]; weak: string[]; model: string; at?: string }): StudyKit {
  const o = obj(raw);
  const ids = new Set(args.sources.map((s) => s.id));
  const sid = (v: unknown) => (ids.has(str(v, 6)) ? str(v, 6) : '');
  const formulas: FormulaRow[] = arr(o.formulas)
    .map((e) => {
      const x = obj(e);
      return { name: str(x.name, 100), formula: str(x.formula, 200), when: str(x.when, 200), sourceId: sid(x.sourceId) };
    })
    .filter((f) => f.name && f.formula)
    .slice(0, 60);
  const cards: Card[] = arr(o.cards)
    .map((e) => {
      const x = obj(e);
      return { front: str(x.front, 200), back: str(x.back, 400), sourceId: sid(x.sourceId) };
    })
    .filter((c) => c.front && c.back)
    .slice(0, 30);
  const sections: KitSection[] = arr(o.sections)
    .map((e) => {
      const x = obj(e);
      return { heading: str(x.heading, 100), lines: arr(x.lines).map((l) => str(l, 300)).filter(Boolean).slice(0, 6), sourceId: sid(x.sourceId) };
    })
    .filter((s) => s.heading && s.lines.length)
    .slice(0, 9);
  return { courseId: args.course.id, kind: args.kind, topic: args.topic, formulas, cards, sections, sources: args.sources, weak: args.weak, model: args.model, at: args.at ?? new Date().toISOString(), sourcesHash: kitHash(args.kind, args.topic, args.sources, args.weak) };
}

export async function buildKit(args: { apiKey: string; fetch?: typeof globalThis.fetch; course: Course; kind: KitKind; topic: string; sources: QuizSource[]; weak: string[]; flagged: string[] }): Promise<StudyKit> {
  const prompt = buildKitPrompt(args.course, args.kind, args.topic, args.sources, args.weak, args.flagged);
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'study', system: prompt.system, user: prompt.user, tool: KIT_TOOL, maxTokens: 6000 });
  return kitFromTool(r.input, { course: args.course, kind: args.kind, topic: args.topic, sources: args.sources, weak: args.weak, model: r.model });
}

export const KIT_WORDS: Record<KitKind, string> = { formulas: 'Formula sheet', cards: 'Flashcards', onepager: 'One-pager' };
