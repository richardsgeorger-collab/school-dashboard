import { describe, expect, it } from 'vitest';
import { mkItem } from '../halo/fixtures';
import { CHAT_MODEL, describeError, sendChat } from './client';

type Msg = { role: string; content: unknown };
const message = (content: unknown[], stop = 'end_turn') => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: CHAT_MODEL,
  content,
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeApi(replies: unknown[]) {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    seen.push({ url: String(input), body });
    const next = replies.shift();
    if (next instanceof Response) return next;
    return json(next);
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

const items = [mkItem({ id: 'i1', courseId: 'c1', title: 'Topic 1 Quiz', label: 'Chem Quiz 1' })];

describe('coach client', () => {
  it('sends the rules, the context, and the history, and returns the text', async () => {
    const { fetch, seen } = fakeApi([message([{ type: 'text', text: 'Start with Chem Quiz 1 tonight. It is due first and short.' }])]);
    const reply = await sendChat({
      apiKey: 'sk-ant-test',
      fetch,
      history: [{ role: 'user', text: 'hi', at: '2026-09-11T10:00:00Z' }, { role: 'assistant', text: 'hello', at: '2026-09-11T10:00:01Z' }],
      userText: 'What should I do right now?',
      context: '{"today":"2026-09-11","capacity":{"weekdayHours":3}}',
      api: { items, addNote: () => undefined, updateItem: () => undefined },
    });
    expect(reply).toBe('Start with Chem Quiz 1 tonight. It is due first and short.');
    expect(seen.length).toBe(1);
    expect(seen[0].url).toMatch(/api\.anthropic\.com\/v1\/messages$/);
    const body = seen[0].body;
    expect(body.model).toBe(CHAT_MODEL);
    const system = body.system as { text: string }[];
    expect(system[0].text).toMatch(/Two or three sentences/);
    expect(system[1].text).toContain('"today":"2026-09-11"');
    const msgs = body.messages as Msg[];
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[2].content).toBe('What should I do right now?');
    expect((body.tools as { name: string }[]).map((t) => t.name)).toEqual(['remember_note', 'update_item']);
  });

  it('runs a tool call locally, sends the result back, and returns the final text', async () => {
    const { fetch, seen } = fakeApi([
      message([{ type: 'tool_use', id: 'toolu_1', name: 'update_item', input: { item_id: 'i1', status: 'in_progress', estimate_minutes: 20 } }], 'tool_use'),
      message([{ type: 'text', text: 'Noted, Chem Quiz 1 is in progress with about twenty minutes left.' }]),
    ]);
    const updates: unknown[] = [];
    const reply = await sendChat({
      apiKey: 'sk-ant-test',
      fetch,
      history: [],
      userText: 'I did half the chem quiz',
      context: '{}',
      api: { items, addNote: () => undefined, updateItem: (id, patch) => updates.push([id, patch]) },
    });
    expect(updates).toEqual([['i1', { status: 'in_progress', estimatedMinutes: 20 }]]);
    expect(reply).toMatch(/in progress/);
    expect(seen.length).toBe(2);
    const second = seen[1].body.messages as Msg[];
    expect(second.length).toBe(3);
    expect((second[2].content as { type: string; tool_use_id: string; content: string }[])[0]).toEqual({ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Updated Chem Quiz 1: status in_progress, estimate 20 min.' });
  });

  it('turns a rejected key into a plain sentence', async () => {
    const { fetch } = fakeApi([json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)]);
    let text = '';
    try {
      await sendChat({ apiKey: 'sk-ant-bad', fetch, history: [], userText: 'hi', context: '{}', api: { items, addNote: () => undefined, updateItem: () => undefined } });
    } catch (e) {
      text = await describeError(e);
    }
    expect(text).toBe('That API key was rejected. Check it and try again.');
  });
});
