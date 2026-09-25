import { callTool } from '../ai/client';
import type { NeedLine } from './needs';

export interface PolishInput {
  lines: NeedLine[];
  /** One short line per finding id behind the lines, so the model can reword from the facts. */
  facts: { id: string; classCode: string; status: string; title: string; note: string; quote: string; proposal: string }[];
}

export const POLISH_TOOL = {
  name: 'needs_you',
  description: 'The lines a student reads after a Halo check: the few things that need a person, in plain words.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lines'],
    properties: {
      lines: {
        type: 'array',
        description: 'One entry per line given, same ids, in the same order. Reword only; never add, drop, or merge lines.',
        items: { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string', description: 'One complete plain sentence, 40 to 120 characters: the full course code, the item name(s) as given, the date, and what it gates or costs when known. Never only a course code.' } } },
      },
    },
  },
} as const;

const SYSTEM = `You reword the few lines a college student sees after their planner was checked against Halo (their LMS). Each line is one thing that needs a person. You are a calm friend, not a report.
Rules:
- One sentence per line, plain words, under 120 characters. Start with the full course code (ESG-162L, ENG-105, CHM-113).
- Say what it is and why it matters: the date, what it gates, what it costs. Never say "finding", "status", or "row".
- Keep every id, keep the order, keep the count. Do not merge, split, add, or drop lines. Do not invent facts beyond the ones given.
- Every text is a complete sentence that names the item(s) from the line given. Never return only a course code.
Answer only through the needs_you tool.`;

export function buildPolishPrompt(input: PolishInput): { system: string; user: string } {
  const lines = input.lines.map((l) => `${l.id} [${l.ids.join(',')}]: ${l.text}`).join('\n');
  const facts = input.facts.map((f) => `${f.id} · ${f.classCode} · ${f.status} · "${f.title}"${f.note ? ` · ${f.note}` : ''}\n   Halo said: ${f.quote}\n   Proposed: ${f.proposal}`).join('\n');
  return { system: SYSTEM, user: `Lines to reword (id [finding ids]: text):\n${lines || '(none)'}\n\nFacts behind them:\n${facts || '(none)'}` };
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const CODE = /\b[A-Z]{2,4}-\d{3}[A-Z]?\b/g;
/** A rewording is used only when it still says something: a sentence of four or more words that names the same class as the local line. */
const saysSomething = (text: string, local: string): boolean => {
  if (text.length < 20 || text.split(/\s+/).length < 4) return false;
  const codes = local.match(CODE) ?? [];
  return codes.length === 0 || codes.some((c) => text.includes(c));
};

/** The model's wording laid over the local lines; anything missing, thin, or about another class keeps the local text. */
export function polishedLines(raw: unknown, lines: NeedLine[]): NeedLine[] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const byId = new Map<string, string>();
  for (const e of Array.isArray(o.lines) ? o.lines : []) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const id = str(x.id, 20);
    const text = str(x.text);
    if (id && text) byId.set(id, text);
  }
  return lines.map((l) => {
    const t = byId.get(l.id);
    return { ...l, text: t && saysSomething(t, l.text) ? t : l.text };
  });
}

/** One call through the gateway, answered through the forced tool. */
export async function polishNeeds(args: PolishInput & { apiKey?: string; fetch?: typeof globalThis.fetch }): Promise<NeedLine[]> {
  if (args.lines.length === 0) return [];
  const { system, user } = buildPolishPrompt(args);
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'needs', system: [{ text: system, cache: true }], user, tool: POLISH_TOOL, maxTokens: 1200 });
  return polishedLines(r.input, args.lines);
}
