import { describe, expect, it } from 'vitest';
import { sendChat } from './client';

/** Replies the way the API does, recording what each request asked for. */
function fakeApi(replies: { text?: string; stop?: string }[]) {
  const seen: { maxTokens: number; thinking: boolean }[] = [];
  const fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    seen.push({ maxTokens: body.max_tokens, thinking: !!body.thinking });
    const r = replies[Math.min(seen.length - 1, replies.length - 1)];
    return new Response(
      JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: r.text ? [{ type: 'text', text: r.text }] : [], stop_reason: r.stop ?? 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as never;
  return { fetch, seen };
}

const base = { apiKey: 'k', history: [], context: '{}', api: {} as never };

describe('the coach on a hard question', () => {
  it('never shows an empty answer as an answer', async () => {
    // What actually happened: the whole budget went on thinking, so the response carried no text block at all.
    const { fetch, seen } = fakeApi([{ stop: 'max_tokens' }, { text: 'Here is a plan for tonight: start with 1.4…' }]);
    const out = await sendChat({ ...base, userText: 'I have a quiz tomorrow at 7am on 1.4-2.7 and I do not feel prepared. How can I prepare?', fetch });
    expect(out).toContain('plan for tonight');
    expect(out).not.toContain('did not have anything to add');
    // It asked again with the thinking off rather than returning a stub.
    expect(seen).toHaveLength(2);
    expect(seen[0].thinking).toBe(true);
    expect(seen[1].thinking).toBe(false);
  });

  it('gives thinking enough room to answer at all', async () => {
    const { fetch, seen } = fakeApi([{ text: 'ok' }]);
    await sendChat({ ...base, userText: 'hi', fetch });
    // 600 was the bug: adaptive thinking spends from this before a word is written.
    expect(seen[0].maxTokens).toBeGreaterThanOrEqual(4000);
  });

  it('says what to do instead when even the retry comes back empty', async () => {
    const { fetch } = fakeApi([{ stop: 'max_tokens' }, { stop: 'max_tokens' }]);
    const out = await sendChat({ ...base, userText: 'something enormous', fetch });
    expect(out).toContain('shorter questions');
    expect(out).not.toContain('did not have anything to add');
  });
});
