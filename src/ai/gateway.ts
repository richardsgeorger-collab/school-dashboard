import type Anthropic from '@anthropic-ai/sdk';
import { MAX_TOKENS, type AiKind } from '../config/tiers';
import { getAccessToken, supabaseConfig } from '../auth/client';
import type { Meter } from './meter';
import { MODEL } from './model';

/**
 * THE ONE WAY this app talks to the model. Every caller builds a request here; the request goes to our Edge
 * Function, which holds the API key, forces the model, caps the output, meters the user, and logs the cost. The
 * client never has a key.
 *
 * Development only: with a key in this browser (and VITE_AI_DIRECT=1 on a built copy), the same request goes
 * straight to Anthropic, so the app can be worked on without a deployed backend. Production builds without that
 * flag never take this branch.
 */

export interface SystemBlock {
  text: string;
  /** Stable, repeated context (syllabus, schedule, rules): cached across calls. */
  cache?: boolean;
}

export interface ToolSpec {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface GatewayRequest {
  kind: AiKind;
  system: SystemBlock[];
  messages: Anthropic.MessageParam[];
  tools?: ToolSpec[];
  tool_choice?: { type: 'tool'; name: string } | { type: 'any' } | { type: 'auto' };
  /** Capped by MAX_TOKENS[kind] on the server whatever is asked for here. */
  max_tokens?: number;
  think?: boolean;
}

export interface GatewayResponse {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
  usage: Anthropic.Usage;
  model: string;
  /** Where the student stands after this call. Only from the server. */
  meter?: Meter;
}

export class GatewayError extends Error {
  constructor(
    public code: 'tier' | 'ceiling' | 'daily' | 'lectures' | 'auth' | 'upstream' | 'network',
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface GatewayOptions {
  /** Test hook, and the dev-direct path: a fetch that answers instead of the network. */
  fetch?: typeof globalThis.fetch;
  /** Dev-direct only. Ignored in production builds. */
  apiKey?: string;
  /** A session token to send instead of looking one up (tests, the extension). */
  token?: string;
}

/** Whether this build may send a browser key straight to Anthropic (development, tests, or the transition flag). */
export const AI_DIRECT_ALLOWED: boolean = !!(import.meta.env.DEV || import.meta.env.MODE === 'test' || import.meta.env.VITE_AI_DIRECT === '1');
const DIRECT_ALLOWED = AI_DIRECT_ALLOWED;

/** The wire shape sent either to our function or, in dev, to Anthropic. The model is set here and nowhere else. */
export function toWire(req: GatewayRequest): Record<string, unknown> {
  const max = Math.min(req.max_tokens ?? MAX_TOKENS[req.kind], MAX_TOKENS[req.kind]);
  return {
    model: MODEL,
    max_tokens: max,
    ...(req.think ? { thinking: { type: 'adaptive' } } : {}),
    system: req.system.filter((b) => b.text.trim()).map((b) => ({ type: 'text', text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}) })),
    ...(req.tools?.length ? { tools: req.tools } : {}),
    ...(req.tool_choice ? { tool_choice: req.tool_choice } : {}),
    messages: req.messages,
  };
}

// ---- The meter, as the server last reported it, for the screen. ----
type MeterListener = (m: Meter) => void;
const listeners = new Set<MeterListener>();
let latest: Meter | null = null;
export const latestMeter = (): Meter | null => latest;
export function onMeter(cb: MeterListener): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
function publish(m: Meter | undefined) {
  if (!m) return;
  latest = m;
  for (const l of listeners) l(m);
}

export async function callGateway(req: GatewayRequest, opts: GatewayOptions = {}): Promise<GatewayResponse> {
  if (DIRECT_ALLOWED && opts.apiKey) return direct(req, opts.apiKey, opts.fetch ?? globalThis.fetch);
  return viaServer(req, opts);
}

async function viaServer(req: GatewayRequest, opts: GatewayOptions): Promise<GatewayResponse> {
  const cfg = supabaseConfig();
  if (!cfg) throw new GatewayError('auth', 'AI is not set up on this build yet.');
  const token = opts.token ?? (await getAccessToken());
  if (!token) throw new GatewayError('auth', 'Sign in to use this.');
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.url}/functions/v1/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: cfg.anonKey },
      body: JSON.stringify({ kind: req.kind, request: toWire(req) }),
    });
  } catch {
    throw new GatewayError('network', 'Could not reach the server. Check your connection.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: GatewayError['code']; message?: string }; response?: GatewayResponse; meter?: Meter };
  publish(body.meter);
  if (!res.ok || !body.response) {
    throw new GatewayError(body.error?.code ?? 'upstream', body.error?.message ?? `The AI service answered ${res.status}.`, res.status);
  }
  return { ...body.response, meter: body.meter };
}

/** Dev only: the same wire request, straight to Anthropic, with the key from this browser. */
async function direct(req: GatewayRequest, apiKey: string, fetchImpl: typeof globalThis.fetch): Promise<GatewayResponse> {
  let res: Response;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify(toWire(req)),
    });
  } catch {
    throw new GatewayError('network', 'Could not reach Anthropic. Check your connection.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; content?: Anthropic.ContentBlock[]; stop_reason?: string; usage?: Anthropic.Usage; model?: string };
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new GatewayError('auth', 'That API key was rejected. Check it in Settings.', res.status);
    throw new GatewayError('upstream', body.error?.message ?? `Anthropic answered ${res.status}.`, res.status);
  }
  return { content: body.content ?? [], stop_reason: body.stop_reason ?? null, usage: (body.usage ?? { input_tokens: 0, output_tokens: 0 }) as Anthropic.Usage, model: body.model ?? MODEL };
}
