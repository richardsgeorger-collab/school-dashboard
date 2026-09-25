import type Anthropic from '@anthropic-ai/sdk';
import { callGateway, GatewayError, type ToolSpec } from '../ai/gateway';
import { recordUsage } from '../ai/usage';
import { CHAT_TOOLS, dispatchTool, SYSTEM_PROMPT, type ToolApi } from './context';

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
  context: string;
  /** Syllabus text per class, when any has been added. Stable across turns, so it is cached. */
  syllabi?: string;
  /** Deck index plus the slides picked for this question. Changes per message, so it is not cached. */
  materials?: string;
  api: ToolApi;
  /** Adaptive thinking, on by default. Turned off for the retry when a whole budget went on thinking. */
  reasoning?: boolean;
  /** Set on the inner call once the deadline is already running. */
  noTimeout?: boolean;
  timeoutMs?: number;
}

/** Long enough for a real answer with thinking, short enough that a hung request does not spin for ever. */
export const CHAT_TIMEOUT_MS = 90_000;

export class ChatTimeout extends Error {
  constructor() {
    super('That took too long and I stopped waiting. Your connection is probably fine; ask again.');
    this.name = 'ChatTimeout';
  }
}

/** One user message through the model, running tool calls locally until it answers in text. */
export async function sendChat(args: SendArgs): Promise<string> {
  const { apiKey, history, userText, context, syllabi, materials, api, fetch, reasoning = true } = args;
  // Nothing below has a deadline of its own. Without this a stalled connection leaves the dots spinning and the
  // conversation empty, which is the one failure that shows the user nothing at all.
  if (!args.noTimeout) {
    // The e2e shortens this so a stalled request can be exercised without a ninety second wait.
    const override = typeof globalThis !== 'undefined' ? (globalThis as { __coachTimeout?: number }).__coachTimeout : undefined;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new ChatTimeout()), args.timeoutMs ?? override ?? CHAT_TIMEOUT_MS));
    return Promise.race([sendChat({ ...args, noTimeout: true }), timeout]);
  }
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-20).map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: 'user', content: userText },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await callGateway(
      {
        kind: 'coach',
        // Adaptive thinking spends from this budget before a single word is written. At 600 a hard question — "I have
        // a quiz tomorrow on 1.4 to 2.7, how do I prepare" — used the lot on thinking and returned no text at all.
        max_tokens: reasoning ? 4000 : 1200,
        think: reasoning,
        system: [
          { text: SYSTEM_PROMPT, cache: true },
          ...(syllabi ? [{ text: `Syllabi:\n${syllabi}`, cache: true }] : []),
          ...(materials ? [{ text: `Materials:\n${materials}` }] : []),
          { text: `Context:\n${context}` },
        ],
        tools: CHAT_TOOLS as unknown as ToolSpec[],
        messages,
      },
      { apiKey, fetch },
    );

    recordUsage('coach', response.model, response.usage);
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (response.stop_reason !== 'tool_use') {
      if (text) return text;
      // An empty answer is never an answer. Ran out of room thinking: ask again with the thinking turned off
      // rather than showing a stub that looks like a considered reply.
      if (reasoning) return sendChat({ ...args, reasoning: false });
      return 'That question needs more room than I have here. Ask it again in two or three shorter questions, or open the tutor for a longer session.';
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
