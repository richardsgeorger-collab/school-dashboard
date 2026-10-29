// The one door to the model. Holds the API key, forces the model, caps output per kind, meters the user by tier,
// logs every call's cost, and passes the answer back. Deno / Supabase Edge Function.
//
// Body: { kind, request } where request is a Messages API body without a model (the client's toWire()). An admin may
// add { model, effort } to run one of the known models side by side (scripts/ai-compare.ts); students never choose.
//
// Locked down 2026-10-29 (George: "Fixed server-built jobs only, input caps, per-user rate limits, and stream mode
// counted against the budget"): the request is checked against the job registry (_shared/aiJobs.ts, generated from
// the app's code) and the call to the model is built here from the job's own instructions and tool (jobRules.ts
// checkJob); nothing else of the browser's goes through (no streaming, no other tools, no conversation). Ask's kinds
// are gone. Each call is admitted under a lock per student (ai_admit, migration 0047): the kind's calls this minute
// and today, and the month's spend plus the most this call could cost, held in the usage log until the real cost
// replaces it.
// Reply: { response: { content, stop_reason, usage, model }, meter } or { error: { code, message } }.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { MAX_TOKENS } from '../_shared/tiers.ts';
import type { Tier } from '../_shared/tiers.ts';
import { allowance, costOf, meter, type UsageRow } from '../_shared/meter.ts';
import { EFFORTS, forModel, KNOWN_MODELS, MODEL } from '../_shared/model.ts';
import { serverError } from '../_shared/errors.ts';
import { checkJob, RATE } from '../_shared/jobRules.ts';
import { JOBS } from '../_shared/aiJobs.ts';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-max-age': '86400' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
// A 204 may not carry a body: `new Response('{}', { status: 204 })` throws, the runtime answers 500 with no CORS
// headers, and every browser call dies at the preflight as "could not reach the server". This was the whole outage.
const preflight = () => new Response(null, { status: 204, headers: CORS });

const dayIn = (tz: string, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json(405, { error: { code: 'upstream', message: 'POST only' } });
  if (!ANTHROPIC_KEY) {
    await serverError(createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }), 'ai', new Error('The server has no model key configured.'), 500);
    return json(500, { error: { code: 'upstream', message: 'The server has no model key configured.' } });
  }

  // Who is asking. The user's JWT comes in the Authorization header; the service role client reads their rows.
  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: { code: 'auth', message: 'Sign in to use this.' } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: { code: 'auth', message: 'Sign in again.' } });
  const userId = userData.user.id;

  let body: { kind?: string; request?: Record<string, unknown>; model?: string; effort?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: { code: 'upstream', message: 'Bad request body.' } });
  }
  const kind = String(body.kind ?? 'other') as keyof typeof MAX_TOKENS;
  // Ask (the study chat) is retired; its kinds answer so, plainly.
  if (kind === ('coach' as string) || kind === ('tutor' as string)) return json(410, { error: { code: 'tier', message: 'Ask has been retired.' } });
  if (!(kind in MAX_TOKENS) || !RATE[kind] || !body.request) return json(400, { error: { code: 'upstream', message: 'Unknown kind of call.' } });
  // Only a Halo+ job, built here from the job's own instructions and tool; the browser brings only the student's data.
  const job = checkJob(JOBS, kind, body.request, MAX_TOKENS[kind]);
  if (!job.ok) return json(400, { error: { code: 'upstream', message: `Not a Halo+ job: ${job.why}` } });

  // The meter: tier from the profile, usage from the log, both server-side truth.
  // The plan comes from the one server function that decides it (paid, trial, friend link, referral, admin): this
  // used to rebuild it from the paid tier and the trial alone, and refused every friend-link student.
  const { data: profile } = await admin.from('profiles').select('timezone').eq('user_id', userId).maybeSingle();
  const { data: plan } = await admin.rpc('plan_of', { uid: userId });
  const tier = (['free', 'plus', 'pro', 'max'].includes(plan as string) ? plan : 'free') as Tier;
  const tz = profile?.timezone ?? 'America/Phoenix';
  const today = dayIn(tz);
  const monthStart = `${today.slice(0, 7)}-01`;
  const { data: rows } = await admin.from('usage_log').select('day, kind, cost_usd').eq('user_id', userId).gte('day', monthStart);
  const usage: UsageRow[] = (rows ?? []).map((r) => ({ day: String(r.day), kind: String(r.kind), costUsd: Number(r.cost_usd), calls: 1 }));
  const m = meter(usage, tier, today);
  const a = allowance(kind, m);
  if (!a.ok) return json(a.reason === 'tier' ? 402 : 429, { error: { code: a.reason, message: a.message }, meter: m });

  // The model: always the shipped one, except an admin's side-by-side naming another known model (and an effort).
  let model = MODEL;
  let effort: string | null = null;
  if (body.model || body.effort) {
    const { data: who } = await admin.from('profiles').select('is_admin').eq('user_id', userId).maybeSingle();
    if (!who?.is_admin) return json(403, { error: { code: 'auth', message: 'Only an admin can choose the model.' } });
    if (body.model && !KNOWN_MODELS.includes(body.model)) return json(400, { error: { code: 'upstream', message: 'Unknown model.' } });
    if (body.effort && !(EFFORTS as readonly string[]).includes(body.effort)) return json(400, { error: { code: 'upstream', message: 'Unknown effort.' } });
    model = body.model ?? MODEL;
    effort = body.effort ?? null;
  }

  // The call, built here (the job's own instructions and tool, the student's data), then made right for the model.
  const built: Record<string, unknown> = { ...job.wire };
  if (effort) built.output_config = { effort };
  const wire = forModel(built, model, kind);
  delete wire.stream;

  // Admitted under a lock per student: this kind's calls in the last minute and today, and the month's spend plus the
  // most this call could cost (its input at about 3 characters a token, its whole output cap), held until it is known.
  const most = costOf({ input_tokens: Math.ceil(job.inputChars / 3), output_tokens: Number(wire.max_tokens ?? MAX_TOKENS[kind]) }, model);
  const { data: gate, error: gateErr } = await admin.rpc('ai_admit', { p_user: userId, p_kind: kind, p_day: today, p_month_start: monthStart, p_per_minute: RATE[kind].perMinute, p_per_day: RATE[kind].perDay, p_ceiling: m.ceilingUsd, p_estimate: most });
  if (gateErr || !gate) {
    await serverError(admin, 'ai', new Error(`ai_admit: ${gateErr?.message ?? 'no answer'}`), 500, { kind });
    return json(500, { error: { code: 'upstream', message: 'Halo+ could not check your AI allowance just now. Try again.' }, meter: m });
  }
  const g = gate as { ok: boolean; reason?: string; id?: number };
  if (!g.ok) {
    const words = g.reason === 'minute' ? 'That is a lot at once. Try again in a minute.' : g.reason === 'day' ? 'That is the most for today. Try again tomorrow.' : `You've reached this month's AI allowance.`;
    return json(429, { error: { code: g.reason === 'ceiling' ? 'ceiling' : 'daily', message: words }, meter: m });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(wire),
  }).catch(() => null);
  const answer = upstream ? await upstream.json().catch(() => ({})) : {};
  if (!upstream || !upstream.ok) {
    // Not answered: nothing was spent; the held row goes.
    await admin.from('usage_log').delete().eq('id', g.id);
    const message = answer?.error?.message ?? `Anthropic answered ${upstream?.status ?? 'nothing'}.`;
    await serverError(admin, 'ai', new Error(`Anthropic ${upstream?.status ?? 0}: ${message}`), 502, { kind, upstream: upstream?.status ?? 0 });
    return json(502, { error: { code: 'upstream', message }, meter: m });
  }

  // The real cost in place of the held one, before answering, so a crash after the call cannot make a call free.
  const u = answer.usage ?? {};
  await admin
    .from('usage_log')
    .update({
      model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      cost_usd: costOf(u, model),
    })
    .eq('id', g.id);
  const after = meter([...usage, { day: today, kind, costUsd: costOf(u, model), calls: 1 }], tier, today);
  return json(200, { response: { content: answer.content, stop_reason: answer.stop_reason, usage: u, model }, meter: after });
});
