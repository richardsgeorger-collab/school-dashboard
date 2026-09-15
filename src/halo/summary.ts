import type Anthropic from '@anthropic-ai/sdk';
import type { NeedLine } from './needs';

/** Same model as the coach and the lecture pass. */
export const SUMMARY_MODEL = 'claude-sonnet-4-6';

export interface PolishInput {
  lines: NeedLine[];
  /** One short line per finding id behind the lines, so the model can reword from the facts. */
  facts: { id: string; classCode: string; status: string; title: string; note: string; quote: string; proposal: string }[];
}

export const POLISH_TOOL = {
  name: 'needs_you',
  description: 'The lines a student reads after a Halo check: the few things that need a person, in plain words.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lines'],
    properties: {
      lines: {
        type: 'array',
        description: 'One entry per line given, same ids, in the same order. Reword only; never add, drop, or merge lines.',
        items: { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string', description: 'One short plain sentence, under 120 characters, full course code first, the date and what it gates or costs when known.' } } },
      },
    },
  },
} as const;

const SYSTEM = `You reword the few lines a college student sees after their planner was checked against Halo (their LMS). Each line is one thing that needs a person. You are a calm friend, not a report.
Rules:
- One sentence per line, plain words, under 120 characters. Start with the full course code (ESG-162L, ENG-105, CHM-113).
- Say what it is and why it matters: the date, what it gates, what it costs. Never say "finding", "status", or "row".
- Keep every id, keep the order, keep the count. Do not merge, split, add, or drop lines. Do not invent facts beyond the ones given.
Answer only through the needs_you tool.`;

export function buildPolishPrompt(input: PolishInput): { system: string; user: string } {
  const lines = input.lines.map((l) => `${l.id} [${l.ids.join(',')}]: ${l.text}`).join('\n');
  const facts = input.facts.map((f) => `${f.id} · ${f.classCode} · ${f.status} · "${f.title}"${f.note ? ` · ${f.note}` : ''}\n   Halo said: ${f.quote}\n   Proposed: ${f.proposal}`).join('\n');
  return { system: SYSTEM, user: `Lines to reword (id [finding ids]: text):\n${lines || '(none)'}\n\nFacts behind them:\n${facts || '(none)'}` };
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The model's wording laid over the local lines; anything missing or off keeps the local text. */
export function polishedLines(raw: unknown, lines: NeedLine[]): NeedLine[] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const byId = new Map<string, string>();
  for (const e of Array.isArray(o.lines) ? o.lines : []) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const id = str(x.id, 20);
    const text = str(x.text);
    if (id && text) byId.set(id, text);
  }
  return lines.map((l) => ({ ...l, text: byId.get(l.id) ?? l.text }));
}

/** One call, the key from this browser, answered through the forced tool. */
export async function polishNeeds(args: PolishInput & { apiKey: string; fetch?: typeof globalThis.fetch }): Promise<NeedLine[]> {
  if (args.lines.length === 0) return [];
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: args.fetch ? 0 : 1, ...(args.fetch ? { fetch: args.fetch } : {}) });
  const { system, user } = buildPolishPrompt(args);
  const response = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 1200,
    system,
    tools: [POLISH_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: POLISH_TOOL.name },
    messages: [{ role: 'user', content: user }],
  });
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not answer.');
  return polishedLines(use.input, args.lines);
}
