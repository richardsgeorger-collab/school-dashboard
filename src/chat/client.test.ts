import { describe, expect, it } from 'vitest';
import { describeError, sendChat } from './client';

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

describe('a failure the student can see', () => {
  it('times out rather than leaving a request hanging with nothing on screen', async () => {
    // A request that never comes back is the one failure that shows nothing at all.
    const fetch = (() => new Promise(() => {})) as never;
    await expect(sendChat({ ...base, userText: 'hi', fetch, timeoutMs: 50 })).rejects.toThrow(/took too long/);
  });

  it('turns the API’s own sentence into the reason, not a dump of the response body', async () => {
    const { fetch } = (() => {
      const f = (async () =>
        new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })) as never;
      return { fetch: f };
    })();
    const why = await sendChat({ ...base, userText: 'hi', fetch }).then(
      () => 'no error',
      (e) => describeError(e),
    );
    expect(why).toBe('Your credit balance is too low to access the Anthropic API. (Anthropic returned 400.)');
    expect(why).not.toContain('{');
  });
});

describe('what the conversation shows when a completion fails', () => {
  /** The rule ChatCard follows: a reply becomes a turn, and a blank one or a thrown error becomes a failed turn. */
  const turnFor = (reply: string | null, why?: string) =>
    reply === null
      ? { role: 'assistant' as const, text: why!, failed: true }
      : reply.trim()
        ? { role: 'assistant' as const, text: reply.trim() }
        : { role: 'assistant' as const, text: 'That came back empty. Nothing was wrong with your question; ask it again, or in two shorter parts.', failed: true };

  it('renders a visible message for an empty completion', () => {
    const t = turnFor('');
    expect(t.text.length).toBeGreaterThan(0);
    expect(t.failed).toBe(true);
    expect(turnFor('   ').text).toBe(turnFor('').text);
  });

  it('renders a visible message for an errored completion, in the conversation', () => {
    const t = turnFor(null, 'Your credit balance is too low to access the Anthropic API. (Anthropic returned 400.)');
    expect(t.role).toBe('assistant');
    expect(t.failed).toBe(true);
    expect(t.text).toContain('credit balance');
  });

  it('a real answer is never marked as a failure', () => {
    const t = turnFor('Do the Chem homework first.');
    expect(t.text).toBe('Do the Chem homework first.');
    expect(t.failed).toBeUndefined();
  });
});
