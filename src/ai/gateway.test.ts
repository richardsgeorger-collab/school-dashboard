import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOKENS } from '../config/tiers';
import { callGateway, GatewayError, latestMeter, toWire } from './gateway';
import { MODEL } from './model';

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const reply = { content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 }, model: MODEL };

describe('the gateway', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sets the one model and caps output per kind whatever was asked', () => {
    const w = toWire({ kind: 'coach', system: [{ text: 'sys', cache: true }, { text: ' ' }], messages: [{ role: 'user', content: 'x' }], max_tokens: 999_999, think: true });
    expect(w.model).toBe(MODEL);
    expect(w.max_tokens).toBe(MAX_TOKENS.coach);
    expect(w.thinking).toEqual({ type: 'adaptive' });
    expect(w.system).toEqual([{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }]);
    expect(toWire({ kind: 'needs', system: [], messages: [] }).max_tokens).toBe(MAX_TOKENS.needs);
    expect(toWire({ kind: 'needs', system: [], messages: [], max_tokens: 100 }).max_tokens).toBe(100);
  });

  it('in dev, a browser key goes straight to Anthropic with the same wire shape', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return ok(reply);
    }) as unknown as typeof globalThis.fetch;
    const r = await callGateway({ kind: 'coach', system: [{ text: 's' }], messages: [{ role: 'user', content: 'q' }] }, { apiKey: 'sk-test', fetch });
    expect(r.content).toEqual(reply.content);
    expect(calls[0].url).toContain('api.anthropic.com');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.model).toBe(MODEL);
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
  });

  it('without a key it posts to our function with the session token, never a key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const calls: { url: string; init: RequestInit }[] = [];
    const meter = { tier: 'pro', monthCostUsd: 0.5, ceilingUsd: 2.5, ceilingUsed: 0.2, messagesToday: 3, messagesCap: 10, lecturesThisWeek: 0, lecturesCap: 0 };
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return ok({ response: reply, meter });
    }) as unknown as typeof globalThis.fetch;
    const r = await callGateway({ kind: 'coach', system: [], messages: [{ role: 'user', content: 'q' }] }, { fetch, token: 'jwt' });
    expect(calls[0].url).toBe('https://demo.supabase.co/functions/v1/ai');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt');
    expect(JSON.stringify(headers)).not.toContain('sk-');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.kind).toBe('coach');
    expect(sent.request.model).toBe(MODEL);
    expect(r.meter).toEqual(meter);
    expect(latestMeter()).toEqual(meter);
  });

  it('passes the server’s refusal through as a typed error with its plain message', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const fetch = (async () => ok({ error: { code: 'daily', message: 'That is 10 messages for today. More tomorrow.' } }, 429)) as unknown as typeof globalThis.fetch;
    const err = await callGateway({ kind: 'coach', system: [], messages: [] }, { fetch, token: 'jwt' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect((err as GatewayError).code).toBe('daily');
    expect((err as GatewayError).message).toBe('That is 10 messages for today. More tomorrow.');
  });

  it('with no backend configured and no key it says so instead of failing silently', async () => {
    const err = await callGateway({ kind: 'coach', system: [], messages: [] }, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect((err as GatewayError).code).toBe('auth');
  });
});
