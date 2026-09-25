// Sends what is due. Called every five minutes by pg_cron (migration 0003) with the shared secret; never from a
// browser. Web push through our own VAPID key, one try per device, dead subscriptions dropped. Email is the branch
// marked below: no provider is wired, and nothing here needs one to run.
import webpush from 'npm:web-push@3';
import { admin, json } from '../_shared/admin.ts';

const PUB = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIV = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const CONTACT = Deno.env.get('VAPID_CONTACT') ?? 'mailto:hello@example.com';
const SECRET = Deno.env.get('NOTIFY_CRON_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!SECRET || req.headers.get('x-cron-secret') !== SECRET) return json(401, { error: 'Not the cron.' });
  if (!PUB || !PRIV) return json(503, { error: 'VAPID keys are not set.' });
  webpush.setVapidDetails(CONTACT, PUB, PRIV);
  const db = admin();
  const now = new Date().toISOString();
  const { data: due, error } = await db.from('notification_plan').select('id, user_id, key, kind, title, body, url').is('sent_at', null).lte('send_at', now).limit(200);
  if (error) return json(500, { error: error.message });
  let sent = 0;
  let dropped = 0;
  let unreachable = 0;
  for (const n of due ?? []) {
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, keys').eq('user_id', n.user_id);
    let delivered = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint as string, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key ?? n.kind }), { TTL: 3600 });
        sent++;
        delivered++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from('push_subscriptions').delete().eq('id', s.id);
          dropped++;
        }
      }
    }
    if (delivered === 0) unreachable++;
    // EMAIL: for a student with notification_prefs.email = true and no device that took the push, an email
    // provider (Resend, Postmark) would send the same title and body here. Not wired; see LAUNCH_CHECKLIST.md.
    await db.from('notification_plan').update({ sent_at: now }).eq('id', n.id);
  }
  return json(200, { due: due?.length ?? 0, sent, dropped, unreachable });
});
