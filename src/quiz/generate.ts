import type Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '../ai/usage';
import type { Course } from '../domain/types';
import { sourcesBlock, type QuizSource } from './sources';

/** Same model as the coach and the lecture pass. */
export const QUIZ_MODEL = 'claude-sonnet-4-6';
export const SET_SIZE = 5;

export type QuestionKind = 'multiple_choice' | 'short' | 'worked';

export interface QuizQuestion {
  id: string;
  kind: QuestionKind;
  /** A short topic label, used to track what keeps getting missed. */
  topic: string;
  prompt: string;
  /** Four options for multiple choice, else empty. */
  choices: string[];
  /** The correct choice's index, or the expected answer in words or a number. */
  answer: string;
  /** Why the answer is right, in plain words. */
  explanation: string;
  /** The solution path for a worked problem, one step per line. Empty otherwise. */
  steps: string[];
  /** Which source it came from. */
  sourceId: string;
}

export interface QuizSet {
  courseId: string;
  topic: string;
  questions: QuizQuestion[];
  sources: QuizSource[];
  model: string;
  createdAt: string;
}

/** Chemistry and math classes get worked problems; everything else gets recall and reasoning questions. */
export const wantsWorkedProblems = (course: Pick<Course, 'code'>) => /^(CHM|ESG|MAT|PHY)/i.test(course.code);

export const QUIZ_TOOL = {
  name: 'practice_set',
  description: 'Five practice questions built only from the sources given, each citing its source.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'topic', 'prompt', 'choices', 'answer', 'explanation', 'steps', 'sourceId'],
          properties: {
            kind: { type: 'string', enum: ['multiple_choice', 'short', 'worked'] },
            topic: { type: 'string', description: 'Two to four words naming the concept, e.g. "limiting reagent".' },
            prompt: { type: 'string' },
            choices: { type: 'array', items: { type: 'string' }, description: 'Exactly four for multiple_choice, otherwise empty.' },
            answer: { type: 'string', description: 'For multiple_choice the index 0-3 as a string; for worked a number with its unit; for short a few words.' },
            explanation: { type: 'string', description: 'One to three sentences on why, in plain words.' },
            steps: { type: 'array', items: { type: 'string' }, description: 'For worked problems: the solution path, one step each. Otherwise empty.' },
            sourceId: { type: 'string', description: 'The [S#] id of the source the question comes from.' },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You write practice questions for one college student from that student's own class material. The material is given as numbered sources.
Rules:
- Use only what the sources say. If the sources do not support a good question, write fewer questions rather than inventing one. Never test something the sources do not contain.
- Every question cites the one source it comes from by its [S#] id.
- Exactly five questions when the material allows, mixed kinds, each on a different point.
- multiple_choice: four options, one right, distractors that are plausible mistakes. answer is the index "0" to "3".
- short: one answer of a few words or one number.
- worked: a problem with numbers that has to be computed, for chemistry, math, and physics. Use values from the sources or values in their range. answer is the final number with its unit. steps is the solution path in order, each step a single line the student could follow, with the setup first and the arithmetic last.
- explanation: why the answer is right, in plain words, one to three sentences. Never comment on the student.
- topic: two to four words naming the concept, the same words for the same concept across questions.
- Plain language, no fluff, no headings.
Answer only through the practice_set tool.`;

export interface QuizArgs {
  course: Course;
  topic: string;
  sources: QuizSource[];
  /** Concepts this student keeps missing, most missed first. */
  weakTopics: string[];
  /** Questions already asked this session, so the next set does not repeat them. */
  avoid: string[];
}

export function buildQuizPrompt({ course, topic, sources, weakTopics, avoid }: QuizArgs): { system: string; user: string } {
  const worked = wantsWorkedProblems(course);
  const lines = [
    `Class: ${course.code} ${course.name}`,
    topic ? `Topic asked for: ${topic}` : 'Topic: whatever the sources cover best, most recent material first.',
    worked ? 'Make at least three of the five worked problems.' : 'No worked problems: this is not a computation class.',
    weakTopics.length ? `Come back to these, which the student has missed before, in at least two questions: ${weakTopics.join('; ')}.` : '',
    avoid.length ? `Do not repeat these questions:\n${avoid.map((q) => `- ${q}`).join('\n')}` : '',
    '',
    'Sources:',
    sourcesBlock(sources),
  ].filter((l) => l !== '');
  return { system: SYSTEM, user: lines.join('\n') };
}

const KINDS: QuestionKind[] = ['multiple_choice', 'short', 'worked'];
const str = (v: unknown, max = 800) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, max: number, each = 300) => (Array.isArray(v) ? v.map((s) => str(s, each)).filter(Boolean).slice(0, max) : []);

/** Whatever the model sent, shaped into questions; anything malformed or citing an unknown source is dropped. */
export function setFromTool(input: unknown, args: Pick<QuizArgs, 'course' | 'topic' | 'sources'>, model = QUIZ_MODEL, createdAt = new Date().toISOString()): QuizSet {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const ids = new Set(args.sources.map((s) => s.id));
  const questions: QuizQuestion[] = [];
  for (const raw of Array.isArray(o.questions) ? o.questions : []) {
    if (questions.length >= SET_SIZE) break;
    const q = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const kind = KINDS.includes(q.kind as QuestionKind) ? (q.kind as QuestionKind) : 'short';
    const prompt = str(q.prompt, 1200);
    const answer = str(q.answer, 300);
    const sourceId = str(q.sourceId, 12).replace(/[[\]]/g, '');
    if (!prompt || !answer || !ids.has(sourceId)) continue;
    const choices = kind === 'multiple_choice' ? strs(q.choices, 4) : [];
    if (kind === 'multiple_choice' && (choices.length !== 4 || !/^[0-3]$/.test(answer))) continue;
    questions.push({
      id: `q${questions.length + 1}`,
      kind,
      topic: str(q.topic, 60).toLowerCase() || (args.topic.trim().toLowerCase() || 'general'),
      prompt,
      choices,
      answer,
      explanation: str(q.explanation, 800),
      steps: kind === 'worked' ? strs(q.steps, 12, 400) : [],
      sourceId,
    });
  }
  return { courseId: args.course.id, topic: args.topic, questions, sources: args.sources, model, createdAt };
}

/** One call, the key from this browser, answered through the forced tool. */
export async function generateSet(args: QuizArgs & { apiKey: string; fetch?: typeof globalThis.fetch }): Promise<QuizSet> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: args.fetch ? 0 : 1, ...(args.fetch ? { fetch: args.fetch } : {}) });
  const { system, user } = buildQuizPrompt(args);
  const response = await client.messages.create({
    model: QUIZ_MODEL,
    max_tokens: 4000,
    system,
    tools: [QUIZ_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: QUIZ_TOOL.name },
    messages: [{ role: 'user', content: user }],
  });
  recordUsage('quiz', QUIZ_MODEL, response.usage);
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not return questions.');
  const set = setFromTool(use.input, args, QUIZ_MODEL);
  if (set.questions.length === 0) throw new Error('Nothing in the material supported a question. Add slides or a recording for this topic first.');
  return set;
}
