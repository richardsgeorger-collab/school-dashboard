// One-click unsubscribe (George, 2026-10-09). The link in every non-account email carries the account id and a token
// (HMAC of the id under the cron secret); a GET from the student's browser, or a POST from a mail client's
// List-Unsubscribe button, turns the account's emails off. Account emails (resets, receipts) are not affected.
import { admin } from '../_shared/admin.ts';
import { unsubToken } from '../_shared/emails.ts';

const SECRET = Deno.env.get('NOTIFY_CRON_SECRET') ?? '';

const page = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:32px 20px;background:#f6f7f9;font:17px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1d22"><div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px"><p style="margin:0 0 12px;font-weight:800;font-size:20px">Halo+</p><h1 style="font-size:22px;margin:0 0 10px">${title}</h1><p style="margin:0">${body}</p><p style="margin:18px 0 0"><a href="https://haloplus.app/#/you?s=notifications" style="color:#6b7280">Change this any time in Halo+ → You → Notifications.</a></p></div></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') return page('Not that way', 'Open the link from the email.', 405);
  if (!SECRET) return page('Not set up', 'This link is not switched on yet.', 503);
  const url = new URL(req.url);
  const u = url.searchParams.get('u') ?? '';
  const t = url.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(u) || !t || t !== (await unsubToken(u, SECRET))) return page("That link doesn't work", 'It may be from an older email. Open Halo+ → You → Notifications to change emails there.', 400);
  const db = admin();
  const now = new Date().toISOString();
  const { error } = await db.from('notification_prefs').upsert({ user_id: u, email: false, email_unsub_at: now, updated_at: now }, { onConflict: 'user_id' });
  if (error) return page('Something went wrong', 'Try the link again in a minute, or change emails in Halo+ → You → Notifications.', 500);
  return page("You're unsubscribed", "No more emails from Halo+ about your trial or your sync. Account emails (password resets, receipts) still arrive.");
});
