import type Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '../ai/usage';
import { CHAT_TOOLS, dispatchTool, SYSTEM_PROMPT, type ToolApi } from './context';

/** The SDK is only pulled in when the coach is actually used. */
async function sdk() {
  return (await import('@anthropic-ai/sdk')).default;
}

export const CHAT_MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_ROUNDS = 3;

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

export interface SendArgs {
  apiKey: string;
  /** Test hook: a fetch that answers instead of api.anthropic.com. */
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
}

/** One user message through the model, running tool calls locally until it answers in text. */
export async function sendChat(args: SendArgs): Promise<string> {
  const { apiKey, history, userText, context, syllabi, materials, api, fetch, reasoning = true } = args;
  const Anthropic = await sdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: fetch ? 0 : 1, ...(fetch ? { fetch } : {}) });
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-20).map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: 'user', content: userText },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      // Adaptive thinking spends from this budget before a single word is written. At 600 a hard question — "I have
      // a quiz tomorrow on 1.4 to 2.7, how do I prepare" — used the lot on thinking and returned no text at all.
      max_tokens: reasoning ? 4000 : 1200,
      ...(reasoning ? { thinking: { type: 'adaptive' as const } } : {}),
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ...(syllabi ? [{ type: 'text' as const, text: `Syllabi:\n${syllabi}`, cache_control: { type: 'ephemeral' as const } }] : []),
        ...(materials ? [{ type: 'text' as const, text: `Materials:\n${materials}` }] : []),
        { type: 'text', text: `Context:\n${context}` },
      ],
      tools: CHAT_TOOLS,
      messages,
    });

    recordUsage('coach', CHAT_MODEL, response.usage);
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

export async function describeError(e: unknown): Promise<string> {
  const Anthropic = await sdk();
  if (e instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it and try again.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited. Give it a minute.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check your connection.';
  if (e instanceof Anthropic.APIError) return `Anthropic returned ${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
