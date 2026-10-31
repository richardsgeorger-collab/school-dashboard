// "Email me the link" on the phone screen (Loop 294, George 2026-10-30): ONE email with the laptop page, to an address
// a phone visitor types. No sign-in (they have no account yet), so it is deployed without JWT checks and guards itself:
// - the same address is never sent twice (only a keyed hash of it is kept, never the address);
// - at most PER_IP_DAY a day from one IP (kept as a keyed hash too), and ALL_DAY a day from everyone;
// - nothing is ever sent again, no list, no follow-up. Not a sign-up.
import { admin, userFromRequest } from '../_shared/admin.ts';
import { ALL_DAY, PER_IP_DAY, callerIp, cleanEmail, cleanVid, keyedHash, laptopEmail, laptopUrl } from '../_shared/laptopLink.ts';

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
  if (raw.length > 2000) return reply(413, { ok: false });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, why: 'shape' });
  }
  // Signed in (an account just made on the phone with Google or Apple): the account's own address, no typing.
  const me = (req.headers.get('authorization') ?? '').startsWith('Bearer ') ? await userFromRequest(req) : null;
  let acct: 'google' | 'apple' | 'email' | null = null;
  if (me) {
    const { data } = await admin().auth.admin.getUserById(me.id);
    const p = data?.user?.app_metadata?.provider;
    acct = p === 'google' || p === 'apple' ? p : 'email';
  }
  const email = cleanEmail(me ? me.email : body.email);
  if (!email) return reply(200, { ok: false, why: 'email' });
  const vid = cleanVid(body.vid);
  const src = body.src === 'ig' ? 'ig' : null;
  const KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM');
  const SECRET = Deno.env.get('NOTIFY_CRON_SECRET');
  if (!KEY || !FROM || !SECRET) return reply(200, { ok: false, why: 'off' });
  const db = admin();
  const emailHash = await keyedHash(SECRET, `email:${email}`);
  const ip = callerIp(req.headers);
  const ipHash = ip ? await keyedHash(SECRET, `ip:${ip}`) : null;
  // Never twice: an address already sent to gets the same happy answer, and nothing is sent.
  const { data: seen } = await db.from('laptop_links').select('email_hash').eq('email_hash', emailHash).maybeSingle();
  if (seen) return reply(200, { ok: true, already: true });
  const day = new Date(Date.now() - 864e5).toISOString();
  const { count: all } = await db.from('laptop_links').select('email_hash', { count: 'exact', head: true }).gte('sent_at', day);
  if ((all ?? 0) >= ALL_DAY) return reply(200, { ok: false, why: 'busy' });
  if (ipHash) {
    const { count: mine } = await db.from('laptop_links').select('email_hash', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('sent_at', day);
    if ((mine ?? 0) >= PER_IP_DAY) return reply(200, { ok: false, why: 'limit' });
  }
  // Claim the address first, so two quick taps cannot send two emails.
  const { error: claim } = await db.from('laptop_links').insert({ email_hash: emailHash, ip_hash: ipHash, vid });
  if (claim) return reply(200, { ok: true, already: true });
  const m = laptopEmail(laptopUrl('email', src, vid, acct), acct);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject: m.subject, text: m.text, html: m.html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
  } catch (e) {
    // Nothing went out: free the address so they can try again.
    await db.from('laptop_links').delete().eq('email_hash', emailHash);
    console.error('laptop-link send', String(e).slice(0, 200));
    return reply(200, { ok: false, why: 'send' });
  }
  if (vid && src) await db.from('funnel_events').upsert({ vid, step: 'email', src, via: 'email' }, { onConflict: 'vid,step', ignoreDuplicates: true });
  return reply(200, { ok: true });
});
