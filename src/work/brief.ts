import type Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '../ai/usage';
import type { Brief, Course, Item } from '../domain/types';

/** Same model as the coach and the lecture pass. */
export const BRIEF_MODEL = 'claude-sonnet-4-6';
const MAX_CHARS = 40_000;

export const BRIEF_TOOL = {
  name: 'assignment_brief',
  description: 'What an assignment asks for, what earns points, and the steps it implies, from its description and rubric.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['asks', 'rubric', 'steps'],
    properties: {
      asks: { type: 'array', items: { type: 'string' }, description: 'Two to five short plain lines on what the student has to hand in and what it must do. No fluff.' },
      rubric: {
        type: 'array',
        description: 'What earns points, one entry per criterion, from the rubric when there is one, else from the description. Empty when neither says.',
        items: { type: 'object', additionalProperties: false, required: ['criterion', 'points', 'how'], properties: { criterion: { type: 'string' }, points: { type: ['number', 'null'] }, how: { type: 'string', description: 'What full marks look like, one line.' } } },
      },
      steps: { type: 'array', items: { type: 'string' }, description: 'Three to seven milestones in order, each a short verb phrase the student can tick off (Outline, Draft, Cite in APA, Proofread).' },
    },
  },
} as const;

const BRIEF_SYSTEM = `You read a college assignment's description and rubric for the student who has to do it, and say plainly what it asks for, what earns points, and the steps it implies. Short lines, no restating the whole page, no advice beyond the work itself. Never invent requirements the text does not carry. Answer only through the assignment_brief tool.`;

export interface BriefArgs {
  item: Item;
  course: Course;
  /** The description Halo carried, already stripped of markup. */
  description: string;
  /** Rubric or handout text from the class library, when a matching file is on hand. */
  rubricText: string;
}

export function buildBriefPrompt({ item, course, description, rubricText }: BriefArgs): { system: string; user: string } {
  const body = `${description}`.slice(0, MAX_CHARS);
  const rubric = rubricText ? `\n\nRubric or handout text:\n${rubricText.slice(0, MAX_CHARS)}` : '';
  return { system: BRIEF_SYSTEM, user: `Class: ${course.code} ${course.name}\nAssignment: ${item.title} (${item.points} pts, ${item.type})\n\nDescription:\n${body || '(none)'}${rubric}` };
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.map((s) => str(s)).filter(Boolean).slice(0, max) : []);

export function briefFromTool(raw: unknown, at = new Date().toISOString()): Brief {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rubric = (Array.isArray(o.rubric) ? o.rubric : [])
    .map((r) => {
      const e = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      return { criterion: str(e.criterion, 160), points: typeof e.points === 'number' && Number.isFinite(e.points) ? e.points : null, how: str(e.how, 240) };
    })
    .filter((r) => r.criterion)
    .slice(0, 12);
  return { asks: strs(o.asks, 5), rubric, steps: strs(o.steps, 7), at, source: 'claude' };
}

/** The brief without a model: the description's first lines, no rubric, the usual steps. Honest and short. */
export function localBrief(args: BriefArgs, at = new Date().toISOString()): Brief {
  const lines = args.description
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20)
    .slice(0, 4);
  return { asks: lines, rubric: [], steps: [], at, source: 'local' };
}

export async function briefItem(args: BriefArgs & { apiKey: string; fetch?: typeof globalThis.fetch }): Promise<Brief> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: args.fetch ? 0 : 1, ...(args.fetch ? { fetch: args.fetch } : {}) });
  const { system, user } = buildBriefPrompt(args);
  const response = await client.messages.create({ model: BRIEF_MODEL, max_tokens: 1500, system, tools: [BRIEF_TOOL as unknown as Anthropic.Tool], tool_choice: { type: 'tool', name: BRIEF_TOOL.name }, messages: [{ role: 'user', content: user }] });
  recordUsage('brief', BRIEF_MODEL, response.usage);
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not answer.');
  return briefFromTool(use.input);
}

// ---- Draft check --------------------------------------------------------------

export interface DraftCheck {
  hits: { criterion: string; note: string }[];
  misses: { criterion: string; what: string }[];
  /** The single most useful next thing to do to the draft. */
  next: string;
}

export const DRAFT_TOOL = {
  name: 'draft_check',
  description: 'A draft held against the assignment’s real rubric: what it hits, what is missing, the one next thing. Not a grade, not a rewrite.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['hits', 'misses', 'next'],
    properties: {
      hits: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['criterion', 'note'], properties: { criterion: { type: 'string' }, note: { type: 'string', description: 'Where the draft meets it, one line.' } } } },
      misses: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['criterion', 'what'], properties: { criterion: { type: 'string' }, what: { type: 'string', description: 'What is missing or thin, one line, concrete.' } } } },
      next: { type: 'string', description: 'The one most useful thing to do next, one sentence.' },
    },
  },
} as const;

const DRAFT_SYSTEM = `You hold a student's draft against the assignment's own rubric and description. For each criterion say whether the draft meets it and where, or what is missing. No grade, no score guess, no rewriting, no style notes beyond what the rubric asks. Plain words, one line each, then the single most useful next step. Answer only through the draft_check tool.`;

export function buildDraftPrompt(args: BriefArgs & { brief: Brief; draft: string }): { system: string; user: string } {
  const rubric = args.brief.rubric.length ? args.brief.rubric.map((r) => `- ${r.criterion}${r.points !== null ? ` (${r.points} pts)` : ''}: ${r.how}`).join('\n') : '(no rubric on file; use the description)';
  return { system: DRAFT_SYSTEM, user: `Class: ${args.course.code}\nAssignment: ${args.item.title}\n\nWhat it asks for:\n${args.brief.asks.map((a) => `- ${a}`).join('\n') || '(none)'}\n\nRubric:\n${rubric}\n\nDescription:\n${args.description.slice(0, 20_000) || '(none)'}\n\nDraft:\n${args.draft.slice(0, 60_000)}` };
}

export function draftFromTool(raw: unknown): DraftCheck {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pairs = (v: unknown, k2: 'note' | 'what') =>
    (Array.isArray(v) ? v : [])
      .map((r) => {
        const e = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
        return { criterion: str(e.criterion, 160), [k2]: str(e[k2], 300) } as { criterion: string; note: string } & { criterion: string; what: string };
      })
      .filter((r) => r.criterion)
      .slice(0, 15);
  return { hits: pairs(o.hits, 'note'), misses: pairs(o.misses, 'what'), next: str(o.next, 300) };
}

export async function checkDraft(args: BriefArgs & { brief: Brief; draft: string; apiKey: string; fetch?: typeof globalThis.fetch }): Promise<DraftCheck> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: args.fetch ? 0 : 1, ...(args.fetch ? { fetch: args.fetch } : {}) });
  const { system, user } = buildDraftPrompt(args);
  const response = await client.messages.create({ model: BRIEF_MODEL, max_tokens: 1500, system, tools: [DRAFT_TOOL as unknown as Anthropic.Tool], tool_choice: { type: 'tool', name: DRAFT_TOOL.name }, messages: [{ role: 'user', content: user }] });
  recordUsage('draft', BRIEF_MODEL, response.usage);
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not answer.');
  return draftFromTool(use.input);
}

// ---- Method check --------------------------------------------------------------

export interface MethodCheck {
  problems: { label: string; setup: 'right' | 'off' | 'unclear'; note: string; step: string | null }[];
  /** The one thing to do next, one sentence. */
  next: string;
}

export const METHOD_TOOL = {
  name: 'method_check',
  description: "A student's work on a problem set held against the method the class teaches: is each setup right, what is off, which step to look at again. Never the answer.",
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['problems', 'next'],
    properties: {
      problems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'setup', 'note', 'step'],
          properties: {
            label: { type: 'string', description: 'Which problem, as the student named it.' },
            setup: { type: 'string', enum: ['right', 'off', 'unclear'] },
            note: { type: 'string', description: 'What is right or off about the setup: the equation chosen, units, given values, the ratio. One line. Never the final number.' },
            step: { type: ['string', 'null'], description: 'The one step to look at again, named, not worked. Null when the setup is right.' },
          },
        },
      },
      next: { type: 'string' },
    },
  },
} as const;

const METHOD_SYSTEM = `You check a student's method on a problem set, never the answer. For each problem they show: is the setup right — the equation or law chosen, the units, the given values, the ratio, the sign — and if not, what is off and which one step to look at again. Use the class material given for the professor's method and notation, and cite it as [S#] when it settles something. Never state the final number, never work a problem through, never rewrite their work. Plain words, one line each, then the single most useful next step. Answer only through the method_check tool.`;

export function buildMethodPrompt(args: { item: Item; course: Course; description: string; material: string; work: string }): { system: string; user: string } {
  return { system: METHOD_SYSTEM, user: `Class: ${args.course.code}\nAssignment: ${args.item.title}\n\nWhat it asks for:\n${args.description.slice(0, 6000) || '(no description on file)'}\n\nClass material (cite as [S#]):\n${args.material.slice(0, 30_000) || '(none on file)'}\n\nThe student's work:\n${args.work.slice(0, 40_000)}` };
}

export function methodFromTool(raw: unknown): MethodCheck {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const problems = (Array.isArray(o.problems) ? o.problems : [])
    .map((r) => {
      const e = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const setup: 'right' | 'off' | 'unclear' = e.setup === 'right' || e.setup === 'off' || e.setup === 'unclear' ? e.setup : 'unclear';
      return { label: str(e.label, 80), setup, note: str(e.note, 300), step: typeof e.step === 'string' && e.step.trim() ? str(e.step, 200) : null };
    })
    .filter((p) => p.label || p.note)
    .slice(0, 20);
  return { problems, next: str(o.next, 300) };
}

export async function checkMethod(args: { item: Item; course: Course; description: string; material: string; work: string; apiKey: string; fetch?: typeof globalThis.fetch }): Promise<MethodCheck> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: args.fetch ? 0 : 1, ...(args.fetch ? { fetch: args.fetch } : {}) });
  const { system, user } = buildMethodPrompt(args);
  const response = await client.messages.create({ model: BRIEF_MODEL, max_tokens: 1500, system, tools: [METHOD_TOOL as unknown as Anthropic.Tool], tool_choice: { type: 'tool', name: METHOD_TOOL.name }, messages: [{ role: 'user', content: user }] });
  recordUsage('method', BRIEF_MODEL, response.usage);
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not answer.');
  return methodFromTool(use.input);
}
