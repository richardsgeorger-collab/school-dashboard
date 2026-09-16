import type Anthropic from '@anthropic-ai/sdk';
import { recordUsage, type ApiUsage, type UsageKind } from './usage';

/** One model for every pass, so cost and behavior stay predictable. Same one the coach uses. */
export const AI_MODEL = 'claude-sonnet-4-6';

/** A system block; cached ones are the big, stable context that repeats across calls (syllabus, slides, transcripts). */
export interface SystemBlock {
  text: string;
  cache?: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  strict?: boolean;
  input_schema: Record<string, unknown>;
}

export interface CallBase {
  apiKey: string;
  /** Test hook: a fetch that answers instead of api.anthropic.com. */
  fetch?: typeof globalThis.fetch;
  kind: UsageKind;
  model?: string;
  system: SystemBlock[];
  maxTokens: number;
  /** Adaptive thinking on the passes that reason across many things. Off for short rewordings. */
  think?: boolean;
}

export interface ToolCallArgs extends CallBase {
  user: string;
  tool: ToolSpec;
}

export interface ToolResult {
  input: unknown;
  usage: ApiUsage;
  model: string;
}

async function sdk() {
  return (await import('@anthropic-ai/sdk')).default;
}

function client(apiKey: string, fetch?: typeof globalThis.fetch) {
  return sdk().then((SdkCtor) => new SdkCtor({ apiKey, dangerouslyAllowBrowser: true, maxRetries: fetch ? 0 : 1, ...(fetch ? { fetch } : {}) }));
}

const systemBlocks = (blocks: SystemBlock[]): Anthropic.TextBlockParam[] => blocks.filter((b) => b.text.trim()).map((b) => ({ type: 'text', text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) }));

/** One forced tool call. The usage the API reports is recorded under `kind` before the input is returned. */
export async function callTool(args: ToolCallArgs): Promise<ToolResult> {
  const c = await client(args.apiKey, args.fetch);
  const model = args.model ?? AI_MODEL;
  const response = await c.messages.create({
    model,
    max_tokens: args.maxTokens,
    ...(args.think ? { thinking: { type: 'adaptive' as const } } : {}),
    system: systemBlocks(args.system),
    tools: [args.tool as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: args.tool.name },
    messages: [{ role: 'user', content: args.user }],
  });
  recordUsage(args.kind, model, response.usage as ApiUsage);
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not answer through the tool.');
  return { input: use.input, usage: response.usage as ApiUsage, model };
}

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface TextCallArgs extends CallBase {
  history: Turn[];
  user: string;
}

/** A plain text answer over a short history, for the tutor. */
export async function callText(args: TextCallArgs): Promise<{ text: string; usage: ApiUsage; model: string }> {
  const c = await client(args.apiKey, args.fetch);
  const model = args.model ?? AI_MODEL;
  const messages: Anthropic.MessageParam[] = [...args.history.slice(-16).map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam), { role: 'user', content: args.user }];
  const response = await c.messages.create({
    model,
    max_tokens: args.maxTokens,
    ...(args.think ? { thinking: { type: 'adaptive' as const } } : {}),
    system: systemBlocks(args.system),
    messages,
  });
  recordUsage(args.kind, model, response.usage as ApiUsage);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return { text, usage: response.usage as ApiUsage, model };
}

/** A short, plain sentence for any API failure. */
export async function describeAiError(e: unknown): Promise<string> {
  const SdkCtor = await sdk();
  if (e instanceof SdkCtor.AuthenticationError) return 'That API key was rejected. Check it in Settings.';
  if (e instanceof SdkCtor.RateLimitError) return 'Rate limited. Give it a minute.';
  if (e instanceof SdkCtor.APIConnectionError) return 'Could not reach Anthropic. Check your connection.';
  if (e instanceof SdkCtor.APIError) return `Anthropic returned ${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

// ---- Small shared readers for tool output: never trust a field, shape it. ----

export const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const strs = (v: unknown, max = 20, each = 300): string[] => (Array.isArray(v) ? v.map((s) => str(s, each)).filter(Boolean).slice(0, max) : []);
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const isoDate = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null);
export const confidence = (v: unknown): 'high' | 'medium' | 'low' => (v === 'high' || v === 'medium' || v === 'low' ? v : 'low');

/** Stable 32-bit hash, hex, for cache keys. */
export function hashText(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let g = 0x9747b28c >>> 0;
  for (let i = s.length - 1; i >= 0; i--) {
    g ^= s.charCodeAt(i);
    g = Math.imul(g, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0');
}
