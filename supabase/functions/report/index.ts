// Error reports from the app and the extension (2026-09-30). No sign-in needed (errors happen signed out too); the
// body is scrubbed and size-capped here whatever the client did, and a device that has sent 30 in 10 minutes is
// dropped, so one broken loop cannot flood the table. Writes go through recordError (_shared/errors.ts).
import { admin } from '../_shared/admin.ts';
import { recordError, type ErrorEntry } from '../_shared/errors.ts';

const PER_DEVICE = 30;
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false });
  const raw = await req.text();
  if (raw.length > 20_000) return reply(413, { ok: false });
  let body: { entries?: ErrorEntry[] } & ErrorEntry;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false });
  }
  const entries = (Array.isArray(body.entries) ? body.entries : [body]).slice(0, 5);
  const db = admin();
  const device = entries[0]?.device_id;
  if (typeof device === 'string' && device) {
    const { data: n } = await db.rpc('error_device_recent', { dev: device });
    if ((n as number) >= PER_DEVICE) return reply(200, { ok: true, dropped: true });
  }
  const out = [];
  for (const e of entries) out.push(await recordError(db, e));
  return reply(200, { ok: true, results: out });
});
