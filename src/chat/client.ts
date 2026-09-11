import type Anthropic from '@anthropic-ai/sdk';
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
  api: ToolApi;
}

/** One user message through the model, running tool calls locally until it answers in text. */
export async function sendChat({ apiKey, history, userText, context, api, fetch }: SendArgs): Promise<string> {
  const Anthropic = await sdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: fetch ? 0 : 1, ...(fetch ? { fetch } : {}) });
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-20).map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: 'user', content: userText },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 600,
      thinking: { type: 'adaptive' },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Context:\n${context}` },
      ],
      tools: CHAT_TOOLS,
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (response.stop_reason !== 'tool_use') return text || 'I did not have anything to add.';

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
