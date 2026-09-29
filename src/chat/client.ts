import type Anthropic from '@anthropic-ai/sdk';
import { callGateway, GatewayError, type SystemBlock, type ToolSpec } from '../ai/gateway';
import { recordUsage } from '../ai/usage';
import { CHAT_TOOLS, dispatchTool, type ToolApi } from './context';

const MAX_TOOL_ROUNDS = 3;

export interface ChatTurn {
  /** A failure shown in the conversation rather than swallowed. Styled as a problem, never as an answer. */
  failed?: boolean;
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

export interface SendArgs {
  /** Development only: a browser key sends the call straight to Anthropic. Production goes through the server. */
  apiKey?: string;
  /** Test hook: a fetch that answers instead of the network. */
  fetch?: typeof globalThis.fetch;
  history: ChatTurn[];
  userText: string;
  /** The rules and everything the answer may draw on, assembled by the caller (ask/ask.ts). */
  system: SystemBlock[];
  api: ToolApi;
  maxTokens?: number;
  /** Set on the inner call once the deadline is already running. */
  noTimeout?: boolean;
  timeoutMs?: number;
}

/** Long enough for a real answer, short enough that a hung request does not spin for ever. */
export const CHAT_TIMEOUT_MS = 60_000;

export class ChatTimeout extends Error {
  constructor() {
    super('That took too long and I stopped waiting. Your connection is probably fine; ask again.');
    this.name = 'ChatTimeout';
  }
}

/**
 * One user message through the model, running tool calls locally until it answers in text. No extended thinking:
 * the answer is short by design, and the thinking flag is what stopped the coach answering at all for days.
 */
export async function sendChat(args: SendArgs): Promise<string> {
  const { apiKey, history, userText, system, api, fetch } = args;
  // Nothing below has a deadline of its own. Without this a stalled connection leaves the dots spinning and the
  // conversation empty, which is the one failure that shows the user nothing at all.
  if (!args.noTimeout) {
    // The e2e shortens this so a stalled request can be exercised without a long wait.
    const override = typeof globalThis !== 'undefined' ? (globalThis as { __coachTimeout?: number }).__coachTimeout : undefined;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new ChatTimeout()), args.timeoutMs ?? override ?? CHAT_TIMEOUT_MS));
    return Promise.race([sendChat({ ...args, noTimeout: true }), timeout]);
  }
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-20).map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: 'user', content: userText },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await callGateway({ kind: 'coach', max_tokens: args.maxTokens ?? 1500, think: false, system, tools: CHAT_TOOLS as unknown as ToolSpec[], messages }, { apiKey, fetch });

    recordUsage('coach', response.model, response.usage);
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (response.stop_reason !== 'tool_use') {
      if (text) return text;
      // An empty answer is never an answer: say what to do instead of showing a stub that looks like a reply.
      return 'That came back empty. Ask it again, or in two shorter questions.';
    }

    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: uses.map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: dispatchTool(u.name, u.input, api) }) as Anthropic.ToolResultBlockParam),
    });
  }
  return 'I made those changes. Ask me again for the next step.';
}

/** One plain sentence for the conversation. Gateway refusals already come worded; upstream failures name the status. */
export async function describeError(e: unknown): Promise<string> {
  if (e instanceof GatewayError) return e.code === 'upstream' && e.status ? `${e.message} (Anthropic returned ${e.status}.)` : e.message;
  return e instanceof Error ? e.message : String(e);
}
