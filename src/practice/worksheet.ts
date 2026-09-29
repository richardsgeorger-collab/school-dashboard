import { callTool, hashText, type ToolSpec } from '../ai/client';
import { MODEL } from '../ai/model';
import type { Course, Item } from '../domain/types';
import { wantsWorkedProblems } from '../quiz/generate';
import { sourcesBlock, type QuizSource } from '../quiz/sources';

/**
 * A practice worksheet: a real document, the kind a professor hands out the week before a test. Problems on the
 * front pages, every answer with its short solution on the last page, all of it from the class's own material.
 */
export type ProblemKind = 'multiple_choice' | 'short' | 'worked';

export interface Problem {
  n: number;
  kind: ProblemKind;
  topic: string;
  prompt: string;
  /** Four for multiple choice, otherwise empty. */
  choices: string[];
  /** For multiple choice the letter A–D; for worked a number with its unit; for short a few words. */
  answer: string;
  /** The solution path, one line each; a sentence or two for recall questions. */
  solution: string[];
  sourceId: string;
}

export interface Worksheet {
  courseId: string;
  /** The quiz or exam it practices for, when it was built for one. */
  itemId: string | null;
  title: string;
  /** "CHM-113 · Chem Quiz 2 · Fri, Oct 23" */
  subtitle: string;
  instructions: string;
  problems: Problem[];
  sources: QuizSource[];
  sourcesHash: string;
  model: string;
  createdAt: string;
}

export const WORKSHEET_SIZE = 10;

/** Not strict: worksheetFromTool validates every field and drops what does not hold up. */
export const WORKSHEET_TOOL: ToolSpec = {
  name: 'worksheet',
  description: 'A practice worksheet of about ten problems built only from the sources given, each with its answer and solution, each citing its source.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'instructions', 'problems'],
    properties: {
      title: { type: 'string', description: 'Five words at most, the way a professor titles a practice sheet.' },
      instructions: { type: 'string', description: 'One or two plain sentences at the top: what to have to hand, what to show.' },
      problems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'topic', 'prompt', 'choices', 'answer', 'solution', 'sourceId'],
          properties: {
            kind: { type: 'string', enum: ['multiple_choice', 'short', 'worked'] },
            topic: { type: 'string', description: 'Two to four words naming the concept.' },
            prompt: { type: 'string' },
            choices: { type: 'array', items: { type: 'string' }, description: 'Exactly four for multiple_choice, otherwise empty.' },
            answer: { type: 'string', description: 'For multiple_choice the letter A, B, C or D; for worked the final number with its unit; for short a few words.' },
            solution: { type: 'array', items: { type: 'string' }, description: 'The solution, one step per line for worked problems; one or two lines of why for the rest.' },
            sourceId: { type: 'string', description: 'The [S#] id of the source the problem comes from.' },
          },
        },
      },
    },
  },
};

const SYSTEM = `You write a practice worksheet for one college student from that student's own class material, given as numbered sources. It is a document they will print or open the night before a quiz or exam.
Rules:
- Use only what the sources say. Never test something the sources do not contain; if the material is thin, write fewer problems rather than invent one.
- About ten problems, numbered in the order given, grouped so problems on one topic sit together. Start with the topics named as the test's own and the ones the student has been missing, then the rest.
- Mix the kinds. worked: a problem with numbers to compute (chemistry, math, physics), values from the sources or in their range, answer as the final number with its unit, solution as the steps in order, setup first, arithmetic last. multiple_choice: four options, one right, distractors that are plausible mistakes, answer as the letter. short: one answer of a few words, solution as one or two lines of why.
- Write the way the class writes: its notation, its units, its terms. Every problem cites the one source it comes from by its [S#] id.
- Plain language. No headings inside prompts, no fluff, no comments about the student.
Answer only through the worksheet tool.`;

export interface WorksheetArgs {
  course: Course;
  /** The test it is for, or null for a class-wide sheet. */
  test: Item | null;
  /** "Fri, Oct 23", or '' when there is no test. */
  testDate: string;
  topics: string[];
  weakTopics: string[];
  sources: QuizSource[];
}

export function buildWorksheetPrompt(a: WorksheetArgs): { system: string; user: string } {
  const worked = wantsWorkedProblems(a.course);
  const lines = [
    `Class: ${a.course.code} ${a.course.name}`,
    a.test ? `The test: ${a.test.label}${a.testDate ? `, ${a.testDate}` : ''}${a.test.points ? `, ${a.test.points} points` : ''}.` : 'No particular test: cover the most recent material.',
    a.topics.length ? `The test's own topics: ${a.topics.join('; ')}.` : '',
    a.weakTopics.length ? `Topics the student keeps missing (give them at least three problems): ${a.weakTopics.join('; ')}.` : '',
    worked ? `Make at least half of the ${WORKSHEET_SIZE} problems worked problems.` : 'No worked problems: this is not a computation class.',
    '',
    'Sources:',
    sourcesBlock(a.sources),
  ].filter((l) => l !== '');
  return { system: SYSTEM, user: lines.join('\n') };
}

const KINDS: ProblemKind[] = ['multiple_choice', 'short', 'worked'];
const str = (v: unknown, max = 800) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, max: number, each = 400) => (Array.isArray(v) ? v.map((s) => str(s, each)).filter(Boolean).slice(0, max) : []);
const LETTERS = ['A', 'B', 'C', 'D'];

export const worksheetHash = (test: Item | null, topics: string[], weak: string[], sources: QuizSource[]): string => hashText(`${test?.id ?? ''}|${topics.join(',').toLowerCase()}|${weak.join(',')}|${sources.map((s) => `${s.id}:${s.label}:${s.text.length}`).join('|')}`);

/** Whatever the model sent, shaped into a worksheet; anything malformed or citing an unknown source is dropped. */
export function worksheetFromTool(raw: unknown, a: Pick<WorksheetArgs, 'course' | 'test' | 'testDate' | 'topics' | 'weakTopics' | 'sources'>, model = MODEL, createdAt = new Date().toISOString()): Worksheet {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = new Set(a.sources.map((s) => s.id));
  const problems: Problem[] = [];
  for (const rawP of Array.isArray(o.problems) ? o.problems : []) {
    if (problems.length >= WORKSHEET_SIZE + 2) break;
    const p = (rawP && typeof rawP === 'object' ? rawP : {}) as Record<string, unknown>;
    const kind = KINDS.includes(p.kind as ProblemKind) ? (p.kind as ProblemKind) : 'short';
    const prompt = str(p.prompt, 1500);
    let answer = str(p.answer, 300);
    const sourceId = str(p.sourceId, 12).replace(/[[\]]/g, '');
    if (!prompt || !answer || !ids.has(sourceId)) continue;
    const choices = kind === 'multiple_choice' ? strs(p.choices, 4) : [];
    if (kind === 'multiple_choice') {
      if (choices.length !== 4) continue;
      // The letter, whether it sent "B", "b", "1" or the option's text.
      const asIndex = /^[0-3]$/.test(answer) ? Number(answer) : /^[a-dA-D]$/.test(answer) ? LETTERS.indexOf(answer.toUpperCase()) : choices.findIndex((c) => c.toLowerCase() === answer.toLowerCase());
      if (asIndex < 0) continue;
      answer = LETTERS[asIndex];
    }
    problems.push({ n: problems.length + 1, kind, topic: str(p.topic, 60).toLowerCase() || 'general', prompt, choices, answer, solution: strs(p.solution, 12), sourceId });
  }
  return {
    courseId: a.course.id,
    itemId: a.test?.id ?? null,
    title: str(o.title, 80) || `${a.course.code} practice`,
    subtitle: [a.course.code, a.test?.label, a.testDate].filter(Boolean).join(' · '),
    instructions: str(o.instructions, 400),
    problems,
    sources: a.sources,
    sourcesHash: worksheetHash(a.test, a.topics, a.weakTopics, a.sources),
    model,
    createdAt,
  };
}

/** One call through the gateway, answered through the forced tool. */
export async function buildWorksheet(a: WorksheetArgs & { apiKey?: string; fetch?: typeof globalThis.fetch }): Promise<Worksheet> {
  const { system, user } = buildWorksheetPrompt(a);
  const r = await callTool({ apiKey: a.apiKey, fetch: a.fetch, kind: 'worksheet', system: [{ text: system, cache: true }], user, tool: WORKSHEET_TOOL, maxTokens: 6000 });
  const ws = worksheetFromTool(r.input, a, r.model);
  if (ws.problems.length === 0) throw new Error('Nothing in the material supported a problem. Add slides or a recording for this topic first.');
  return ws;
}

// ---- The document -------------------------------------------------------------------------------------------------

/** One line of the printed sheet. The renderers (docx, PDF, screen) share this so the three never drift. */
export type DocBlock = { kind: 'title' | 'subtitle' | 'note' | 'heading' | 'problem' | 'choice' | 'answer' | 'step' | 'rule'; text: string } | { kind: 'break' };

/** The sheet as blocks: problems, then a page break, then the answers, so the key is always its own last page. */
export function worksheetDoc(ws: Worksheet): DocBlock[] {
  const out: DocBlock[] = [{ kind: 'title', text: ws.title }, { kind: 'subtitle', text: ws.subtitle }];
  if (ws.instructions) out.push({ kind: 'note', text: ws.instructions });
  out.push({ kind: 'note', text: `${ws.problems.length} problems · answers on the last page` });
  let topic = '';
  for (const p of ws.problems) {
    if (p.topic !== topic) {
      topic = p.topic;
      out.push({ kind: 'heading', text: cap(topic) });
    }
    out.push({ kind: 'problem', text: `${p.n}. ${p.prompt}` });
    p.choices.forEach((c, i) => out.push({ kind: 'choice', text: `${LETTERS[i]}. ${c}` }));
  }
  out.push({ kind: 'break' }, { kind: 'title', text: 'Answers' }, { kind: 'subtitle', text: ws.subtitle });
  for (const p of ws.problems) {
    out.push({ kind: 'answer', text: `${p.n}. ${p.answer}` });
    for (const s of p.solution) out.push({ kind: 'step', text: s });
  }
  out.push({ kind: 'rule', text: `From: ${ws.sources.map((s) => `[${s.id}] ${s.label}`).join(' · ')}` });
  return out;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A file name a downloads folder can live with: "CHM-113 Chem Quiz 2 practice.docx". */
export const worksheetFileName = (ws: Worksheet, ext: 'docx' | 'pdf'): string => `${ws.subtitle.split(' · ').slice(0, 2).join(' ').replace(/[^\w\s-]+/g, '') || 'practice'} practice.${ext}`;

/** Hand a file to the browser's downloads. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
