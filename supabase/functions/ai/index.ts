// The one door to the model. Holds the API key, forces the model, caps output per kind, meters the user by tier,
// logs every call's cost, and passes the answer back. Deno / Supabase Edge Function.
//
// Body: { kind, request } where request is a Messages API body without a model (the client's toWire()).
// Reply: { response: { content, stop_reason, usage, model }, meter } or { error: { code, message } }.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { MAX_TOKENS } from '../_shared/tiers.ts';
import { effectiveTier } from '../_shared/flags.ts';
import { allowance, costOf, meter, type UsageRow } from '../_shared/meter.ts';
import { MODEL } from '../_shared/model.ts';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' } });

const dayIn = (tz: string, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method !== 'POST') return json(405, { error: { code: 'upstream', message: 'POST only' } });
  if (!ANTHROPIC_KEY) return json(500, { error: { code: 'upstream', message: 'The server has no model key configured.' } });

  // Who is asking. The user's JWT comes in the Authorization header; the service role client reads their rows.
  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: { code: 'auth', message: 'Sign in to use this.' } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: { code: 'auth', message: 'Sign in again.' } });
  const userId = userData.user.id;

  let body: { kind?: string; request?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: { code: 'upstream', message: 'Bad request body.' } });
  }
  const kind = String(body.kind ?? 'other') as keyof typeof MAX_TOKENS;
  if (!(kind in MAX_TOKENS) || !body.request) return json(400, { error: { code: 'upstream', message: 'Unknown kind of call.' } });

  // The meter: tier from the profile, usage from the log, both server-side truth.
  const { data: profile } = await admin.from('profiles').select('tier, trial_ends_at, grace_until, timezone').eq('user_id', userId).maybeSingle();
  const tier = effectiveTier(profile ? { tier: profile.tier, trialEndsAt: profile.trial_ends_at, graceUntil: profile.grace_until } : null);
  const tz = profile?.timezone ?? 'America/Phoenix';
  const today = dayIn(tz);
  const monthStart = `${today.slice(0, 7)}-01`;
  const { data: rows } = await admin.from('usage_log').select('day, kind, cost_usd').eq('user_id', userId).gte('day', monthStart);
  const usage: UsageRow[] = (rows ?? []).map((r) => ({ day: String(r.day), kind: String(r.kind), costUsd: Number(r.cost_usd), calls: 1 }));
  const m = meter(usage, tier, today);
  const a = allowance(kind, m);
  if (!a.ok) return json(a.reason === 'tier' ? 402 : 429, { error: { code: a.reason, message: a.message }, meter: m });

  // The request as the client built it, with the model and the cap set here whatever it asked for.
  const wire = { ...body.request, model: MODEL, max_tokens: Math.min(Number(body.request.max_tokens ?? MAX_TOKENS[kind]), MAX_TOKENS[kind]) };
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(wire),
  });
  const answer = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = answer?.error?.message ?? `Anthropic answered ${upstream.status}.`;
    return json(502, { error: { code: 'upstream', message }, meter: m });
  }

  // Log the cost before answering, so a crash after the call cannot make a call free.
  const u = answer.usage ?? {};
  await admin.from('usage_log').insert({
    user_id: userId,
    day: today,
    kind,
    model: MODEL,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    cost_usd: costOf(u),
  });
  const after = meter([...usage, { day: today, kind, costUsd: costOf(u), calls: 1 }], tier, today);
  return json(200, { response: { content: answer.content, stop_reason: answer.stop_reason, usage: u, model: MODEL }, meter: after });
});
