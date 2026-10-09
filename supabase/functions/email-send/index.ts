// Sends the emails waiting in email_outbox through Resend, oldest first, at most 30 in any hour (Resend's free
// tier). Called every five minutes by pg_cron (migration 0026) with the shared cron secret; never from a browser.
// Needs RESEND_API_KEY and RESEND_FROM ("Halo+ <hello@haloplus.app>", a domain verified at Resend). Without them it
// sends nothing and says so; the rows wait.
import { admin, json } from '../_shared/admin.ts';
import { renderEmail, unsubUrlFor } from '../_shared/emails.ts';

const SECRET = Deno.env.get('NOTIFY_CRON_SECRET') ?? '';
const KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('RESEND_FROM') ?? '';
const PER_HOUR = 30;
const SITE = 'https://haloplus.app';

interface Row {
  id: string;
  user_id: string;
  to_email: string;
  kind: string;
  attempts: number;
  meta: Record<string, unknown> | null;
}
const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');

/** The one email so far: made an account on a phone at the market, the setup finishes on a laptop. */
function marketSetup(): { subject: string; text: string; html: string } {
  const ext = `${SITE}/#/now?ext=1`;
  const phone = `${SITE}/help/halo-app-iphone-ipad/`;
  const subject = 'Finish setting up Halo+ on your laptop';
  const text = [
    'Thanks for trying Halo+. Your free week of Max is already running.',
    '',
    'On your laptop, in Chrome, Edge or Brave:',
    `1. Open ${ext}`,
    '2. Add the Halo+ extension (about a minute).',
    '3. Log in to Halo once. Your classes, due dates, grades and announcements come in by themselves, every 3 hours.',
    '',
    `No laptop nearby? Halo+ works on a phone or iPad too: ${phone}`,
    '',
    'Halo+ never asks for your GCU password. Not affiliated with GCU.',
  ].join('\n');
  const html = `<div style="font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:520px">
  <p style="font-size:22px;font-weight:700;margin:0 0 12px">Finish setting up Halo+ on your laptop</p>
  <p>Thanks for trying Halo+. Your free week of Max is already running.</p>
  <p><b>On your laptop, in Chrome, Edge or Brave:</b></p>
  <ol>
    <li><a href="${ext}" style="color:#9a6a00">Open haloplus.app</a></li>
    <li>Add the Halo+ extension (about a minute).</li>
    <li>Log in to Halo once. Your classes, due dates, grades and announcements come in by themselves, every 3 hours.</li>
  </ol>
  <p style="margin:20px 0"><a href="${ext}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#f2b84b;color:#141414;font-weight:700;text-decoration:none">Set up on my laptop</a></p>
  <p>No laptop nearby? <a href="${phone}" style="color:#9a6a00">Halo+ works on a phone or iPad too.</a></p>
  <p style="color:#6b6b6b;font-size:13px">Halo+ never asks for your GCU password. Not affiliated with GCU.</p>
</div>`;
  return { subject, text, html };
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-cron-secret') !== SECRET) return json(401, { error: 'Not the cron.' });
  if (!KEY || !FROM) return json(200, { sent: 0, skipped: 'RESEND_API_KEY or RESEND_FROM is not set' });
  const db = admin();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db.from('email_outbox').select('id', { count: 'exact', head: true }).gte('sent_at', hourAgo);
  const room = Math.max(0, PER_HOUR - (count ?? 0));
  if (room === 0) return json(200, { sent: 0, waited: 'the hour is full' });
  const { data: rows, error } = await db.from('email_outbox').select('id, user_id, to_email, kind, attempts, meta').is('sent_at', null).lt('attempts', 5).order('created_at').limit(room);
  if (error) return json(500, { error: error.message });
  let sent = 0;
  for (const r of (rows ?? []) as Row[]) {
    // Account emails (the market setup) carry no unsubscribe; the trial and sync ones carry a one-click one.
    let m: { subject: string; text: string; html: string } | null = null;
    const headers: Record<string, string> = {};
    if (r.kind === 'market_setup') m = marketSetup();
    else {
      const unsub = await unsubUrlFor(BASE, r.user_id, SECRET);
      m = renderEmail(r.kind, r.meta ?? {}, unsub);
      headers['List-Unsubscribe'] = `<${unsub}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    if (!m) {
      await db.from('email_outbox').update({ attempts: 5, last_error: `no template for ${r.kind}` }).eq('id', r.id);
      continue;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [r.to_email], subject: m.subject, text: m.text, html: m.html, headers }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await db.from('email_outbox').update({ sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: null }).eq('id', r.id);
      sent += 1;
    } catch (e) {
      await db.from('email_outbox').update({ attempts: r.attempts + 1, last_error: String(e).slice(0, 300) }).eq('id', r.id);
    }
  }
  return json(200, { sent, room });
});
