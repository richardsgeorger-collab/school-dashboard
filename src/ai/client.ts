import type Anthropic from '@anthropic-ai/sdk';
import type { AiKind } from '../config/tiers';
import { callGateway, GatewayError, type SystemBlock, type ToolSpec } from './gateway';
import { recordUsage, type ApiUsage } from './usage';

/**
 * The two shapes of call the app makes: one forced tool call, or a plain text answer over a short history. Both go
 * through the gateway, which is the only thing that knows the model or holds a key. Every caller names its `kind`,
 * and the kind sets the output cap and the tier gate.
 */

export type { SystemBlock, ToolSpec };

export interface CallBase {
  /** Development only: a key in this browser sends the call straight to Anthropic. Production always goes through the server. */
  apiKey?: string;
  /** Test hook: a fetch that answers instead of the network. */
  fetch?: typeof globalThis.fetch;
  kind: AiKind;
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

/** One forced tool call. The usage the API reports is recorded under `kind` before the input is returned. */
export async function callTool(args: ToolCallArgs): Promise<ToolResult> {
  const response = await callGateway(
    { kind: args.kind, system: args.system, max_tokens: args.maxTokens, think: args.think, tools: [args.tool], tool_choice: { type: 'tool', name: args.tool.name }, messages: [{ role: 'user', content: args.user }] },
    { apiKey: args.apiKey, fetch: args.fetch },
  );
  recordUsage(args.kind, response.model, response.usage as ApiUsage);
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (use) return { input: reviveJsonStrings(use.input), usage: response.usage as ApiUsage, model: response.model };
  // The tool is forced, so this is rare. When it happens the answer is usually the same object written as text, and
  // every reader validates what it gets, so parsing it is no less safe than trusting the tool block.
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const loose = jsonFromText(text);
  if (loose) return { input: loose, usage: response.usage as ApiUsage, model: response.model };
  throw new Error('The model did not answer through the tool.');
}

/**
 * Haiku sometimes sends a list or object field of a tool answer as a string holding its JSON ("[{...}]") instead of
 * the list itself. Every reader checks for a real array, so without this the whole field silently became empty: a
 * lecture read that came back full was saved as "nothing in this lecture". Top-level fields only, and only strings
 * that parse to an array or object.
 */
export function reviveJsonStrings(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
      try {
        const parsed: unknown = JSON.parse(v);
        out[k] = parsed && typeof parsed === 'object' ? parsed : v;
        continue;
      } catch {
        /* a string that only starts like JSON: keep it as written */
      }
    }
    out[k] = v;
  }
  return out;
}

/** The first JSON object in a piece of text, fenced or not. Null when there is none to read. */
export function jsonFromText(text: string): unknown | null {
  const body = text.replace(/^[\s\S]*?```(?:json)?\n/, '').replace(/```[\s\S]*$/, '');
  for (const candidate of [body, text]) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Not JSON after all; fall through to the next shape.
    }
  }
  return null;
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
  const messages: Anthropic.MessageParam[] = [...args.history.slice(-16).map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam), { role: 'user', content: args.user }];
  const response = await callGateway({ kind: args.kind, system: args.system, max_tokens: args.maxTokens, think: args.think, messages }, { apiKey: args.apiKey, fetch: args.fetch });
  recordUsage(args.kind, response.model, response.usage as ApiUsage);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return { text, usage: response.usage as ApiUsage, model: response.model };
}

/** What an upstream failure means, in words a person can act on. The raw text goes to the console, never the screen. */
export function plainApiError(status: number | undefined, message: string): string {
  const m = message.toLowerCase();
  if (/compiled grammar|tool schemas|too large/.test(m)) return 'the request was shaped in a way Anthropic could not accept';
  if (/credit|billing|quota|insufficient/.test(m)) return 'this key is out of credit';
  if (/overloaded/.test(m) || status === 529) return 'Anthropic is overloaded right now';
  if (/prompt is too long|max_tokens|context window|too many tokens/.test(m)) return 'there was more material than fits in one pass';
  if (status === 401 || status === 403) return 'that API key was rejected';
  if (status === 429) return 'this key is being rate limited';
  if (status === 400) return 'Anthropic turned the request down as malformed';
  if (status && status >= 500) return 'Anthropic had a server error';
  return 'the request to Anthropic failed';
}

/** One plain sentence for any failure of an AI pass. Gateway refusals (tier, cap, ceiling) already come worded. */
export async function describeAiError(e: unknown): Promise<string> {
  if (e instanceof GatewayError) {
    if (e.code !== 'upstream') return e.message;
    console.warn('AI error', e.status, e.message);
    return `It failed because ${plainApiError(e.status, e.message)}.`;
  }
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
