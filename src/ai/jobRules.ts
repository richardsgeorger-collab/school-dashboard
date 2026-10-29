/**
 * Every AI call is one fixed job (2026-10-29, George: "Fixed server-built jobs only, input caps, per-user rate limits").
 * The server does not send what the browser built. It checks the browser's request against the job registry (the
 * job's own instructions and its one tool, generated from the app's code into supabase/functions/_shared/aiJobs.ts)
 * and builds the call to the model itself: its own copy of the instructions, its own copy of the tool, the tool forced,
 * no streaming, no tools of Anthropic's, nothing else. The browser only brings the student's data (the context blocks
 * and the one user message) and which job, and both are capped in size. A request that brings anything else (its own
 * instructions, another tool, a conversation, a server tool) is refused, so no part of Halo+ can be used as a
 * general chatbot.
 *
 * Pure (no imports but types): the Edge Function runs this same file (scripts/sync-shared.mjs copies it).
 */

export interface JobTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface Job {
  /** The AI kind it is metered as (the usage log's kind, the plan's gate). */
  kind: string;
  /** The job's own instructions, exactly as the app writes them. */
  rules: string;
  /** The one tool its answer must come back through. */
  tool: JobTool;
  /** Where the instructions sit among the system blocks: first, or last (after the context, for the cache). */
  rulesAt: 'first' | 'last';
  /** System blocks allowed in all, the instructions included. */
  maxBlocks: number;
  /** Characters allowed in the context blocks together (the student's material, the class as it stands). */
  maxContextChars: number;
  /** Characters allowed in the one user message. */
  maxUserChars: number;
}

/** Calls of one kind a student may make, per minute and per day (checked atomically on the server, with the budget). */
export const RATE: Record<string, { perMinute: number; perDay: number }> = {
  announcement: { perMinute: 60, perDay: 600 },
  changes: { perMinute: 20, perDay: 100 },
  class_plan: { perMinute: 12, perDay: 60 },
  term_plan: { perMinute: 3, perDay: 12 },
  links: { perMinute: 3, perDay: 12 },
  study: { perMinute: 6, perDay: 60 },
  quiz: { perMinute: 6, perDay: 60 },
  worksheet: { perMinute: 4, perDay: 30 },
  brief: { perMinute: 12, perDay: 120 },
  draft: { perMinute: 6, perDay: 40 },
  method: { perMinute: 6, perDay: 40 },
  lecture: { perMinute: 3, perDay: 20 },
};

type Block = { type?: unknown; text?: unknown; cache_control?: unknown };
export type JobCheck = { ok: true; job: string; wire: Record<string, unknown>; inputChars: number } | { ok: false; why: string };

/** A stable string for comparing two tool definitions (key order does not matter). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

const textOf = (content: unknown): string | null => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content) && content.length === 1 && (content[0] as Block)?.type === 'text' && typeof (content[0] as Block).text === 'string') return (content[0] as Block).text as string;
  return null;
};

/**
 * Check a browser's request (the Messages API body the app's gateway sends) against the registry and build the call
 * from the server's own copy of the job. `maxTokens` is the kind's output cap; the model and its settings are set
 * after this (model.ts forModel).
 */
export function checkJob(registry: Record<string, Job>, kind: string, request: unknown, maxTokens: number): JobCheck {
  if (!request || typeof request !== 'object') return { ok: false, why: 'No request.' };
  const r = request as Record<string, unknown>;
  const tools = r.tools;
  if (!Array.isArray(tools) || tools.length !== 1) return { ok: false, why: 'A job has exactly one tool.' };
  const t = tools[0] as Record<string, unknown>;
  if (!t || typeof t.name !== 'string' || 'type' in t) return { ok: false, why: 'Not a job tool.' };
  const job = registry[t.name];
  if (!job) return { ok: false, why: 'Not a Halo+ job.' };
  if (job.kind !== kind) return { ok: false, why: 'That job is not that kind.' };
  if (canonical({ name: t.name, description: t.description, input_schema: t.input_schema }) !== canonical({ name: job.tool.name, description: job.tool.description, input_schema: job.tool.input_schema })) return { ok: false, why: 'The tool is not the job’s own.' };
  const choice = r.tool_choice as Record<string, unknown> | undefined;
  if (!choice || choice.type !== 'tool' || choice.name !== job.tool.name) return { ok: false, why: 'The job’s tool must be forced.' };
  // The instructions, at their place, word for word; the other blocks are the student's material.
  const system = r.system;
  if (!Array.isArray(system) || !system.length || system.length > job.maxBlocks) return { ok: false, why: 'Wrong number of instruction blocks.' };
  const blocks = system as Block[];
  if (blocks.some((b) => !b || b.type !== 'text' || typeof b.text !== 'string')) return { ok: false, why: 'Instructions are text only.' };
  const at = job.rulesAt === 'first' ? 0 : blocks.length - 1;
  if (blocks[at].text !== job.rules) return { ok: false, why: 'Not the job’s own instructions.' };
  const context = blocks.filter((_, i) => i !== at);
  const contextChars = context.reduce((n, b) => n + (b.text as string).length, 0);
  if (contextChars > job.maxContextChars) return { ok: false, why: 'Too much material for this job.' };
  const messages = r.messages;
  if (!Array.isArray(messages) || messages.length !== 1 || (messages[0] as Record<string, unknown>)?.role !== 'user') return { ok: false, why: 'A job is one message.' };
  const user = textOf((messages[0] as Record<string, unknown>).content);
  if (user === null || !user.trim()) return { ok: false, why: 'A job’s message is text.' };
  if (user.length > job.maxUserChars) return { ok: false, why: 'Too long for this job.' };
  const cached = (b: Block) => !!(b.cache_control && typeof b.cache_control === 'object' && (b.cache_control as Record<string, unknown>).type === 'ephemeral');
  const ctx = context.map((b) => ({ type: 'text', text: b.text as string, ...(cached(b) ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const rules = { type: 'text', text: job.rules, ...(job.rulesAt === 'first' ? { cache_control: { type: 'ephemeral' } } : {}) };
  const asked = Number(r.max_tokens);
  const wire: Record<string, unknown> = {
    max_tokens: Number.isFinite(asked) && asked > 0 ? Math.min(asked, maxTokens) : maxTokens,
    system: job.rulesAt === 'first' ? [rules, ...ctx] : [...ctx, rules],
    messages: [{ role: 'user', content: user }],
    tools: [job.tool],
    tool_choice: { type: 'tool', name: job.tool.name },
  };
  return { ok: true, job: job.tool.name, wire, inputChars: contextChars + user.length + job.rules.length };
}
