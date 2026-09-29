// Lecture recordings to text (2026-09-28), a Max feature. The browser pulls the audio out of the file (MP4, M4A, MP3,
// WAV), cuts it into 16 kHz mono WAV pieces, and posts them here one at a time; each goes to Groq's hosted Whisper
// (whisper-large-v3-turbo, about $0.04 per hour of audio, free tier first) and the text comes back. Nothing is stored
// but a row of seconds per piece, for the daily cap. GET answers whether it is set up, so the app never offers a
// button that silently fails.
import { createClient } from 'npm:@supabase/supabase-js@2';

const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MODEL = 'whisper-large-v3-turbo';
/** Groq's free tier takes files up to 25 MB; the app sends about 10 MB. */
const MAX_BYTES = 24_000_000;
/** Per student per day: plenty for every lecture, well inside the free tier across students. */
const DAILY_SECONDS = 5 * 3600;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-seconds', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'GET') return json(200, { ready: !!GROQ_KEY });
  if (req.method !== 'POST') return json(405, { ok: false, why: 'POST only.' });
  if (!GROQ_KEY) return json(503, { ok: false, notSetUp: true, why: 'Transcribing files is not switched on yet. Paste a transcript for now.' });

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { ok: false, why: 'Sign in to use this.' });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: u, error: ue } = await db.auth.getUser(jwt);
  if (ue || !u.user) return json(401, { ok: false, why: 'Sign in again.' });
  const uid = u.user.id;
  const { data: plan } = await db.rpc('plan_of', { uid });
  if (plan !== 'max') return json(403, { ok: false, why: 'Transcribing lecture files is part of Max.' });

  const seconds = Math.max(1, Math.min(1800, Number(req.headers.get('x-seconds')) || 0));
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: used } = await db.from('transcribe_log').select('seconds').eq('user_id', uid).gte('created_at', since);
  const total = (used ?? []).reduce((s, r) => s + (r.seconds as number), 0);
  if (total + seconds > DAILY_SECONDS) return json(429, { ok: false, why: 'That is 5 hours of lectures in a day, the most for now. Try again tomorrow, or paste a transcript.' });

  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0 || audio.byteLength > MAX_BYTES) return json(413, { ok: false, why: 'That piece of audio was the wrong size.' });
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'piece.wav');
  form.append('model', MODEL);
  form.append('language', 'en');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${GROQ_KEY}` }, body: form });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    const busy = r.status === 429;
    return json(busy ? 429 : 502, { ok: false, retry: busy || r.status >= 500, why: busy ? 'The transcriber is busy. Halo+ will try again.' : `The transcriber refused it (${r.status}). ${detail}` });
  }
  const out = (await r.json()) as { text?: string };
  await db.from('transcribe_log').insert({ user_id: uid, seconds });
  return json(200, { ok: true, text: (out.text ?? '').trim() });
});
