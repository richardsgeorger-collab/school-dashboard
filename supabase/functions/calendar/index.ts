// The calendar feed (2026-10-01, Plus): GET /functions/v1/calendar/<token>.ics, read by Google Calendar, Apple
// Calendar or Outlook on their own schedule, with no sign-in (calendar apps can't sign in). The token is the key: it
// only ever reads that account's due dates, and the student can replace it, which stops every old subscription.
// Deployed WITHOUT JWT checks for that reason. On a plan without the feed, it serves one event saying it is paused.
import { admin } from '../_shared/admin.ts';
import { buildFeed, type FeedCourse, type FeedItem } from '../_shared/feed.ts';
import { can } from '../_shared/flags.ts';
import type { Tier } from '../_shared/tiers.ts';

const text = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'GET only.');
  const last = new URL(req.url).pathname.split('/').pop() ?? '';
  const token = last.replace(/\.ics$/i, '');
  if (!/^[a-f0-9]{48}$/.test(token)) return text(404, 'No calendar here. Copy the link again from Halo+ (Calendar, Add to my calendar app).');
  try {
    const db = admin();
    const { data: feed } = await db.from('calendar_feeds').select('user_id').eq('token', token).maybeSingle();
    if (!feed) return text(404, 'This calendar link was replaced. Copy the new one from Halo+ (Calendar, Add to my calendar app).');
    const uid = feed.user_id as string;
    const now = new Date().toISOString();
    const { data: plan } = await db.rpc('plan_of', { uid });
    const paused = !can('icsFeed', ((plan as Tier) ?? 'free'));
    let items: FeedItem[] = [];
    let courses: FeedCourse[] = [];
    if (!paused) {
      const [{ data: ir }, { data: cr }] = await Promise.all([
        db.from('items').select('id, data').eq('user_id', uid).is('deleted_at', null).limit(5000),
        db.from('courses').select('id, data').eq('user_id', uid).is('deleted_at', null),
      ]);
      items = (ir ?? []).map((r) => ({ ...(r.data as FeedItem), id: r.id as string }));
      courses = (cr ?? []).map((r) => ({ ...(r.data as FeedCourse), id: r.id as string }));
    }
    // When a calendar app last read it, for "Last checked" in Halo+. Best effort.
    await db.from('calendar_feeds').update({ last_fetched_at: now }).eq('user_id', uid);
    const body = buildFeed({ items, courses, now, paused });
    return new Response(req.method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="halo-plus-deadlines.ics"',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
    });
  } catch (e) {
    console.error('calendar feed', e);
    return text(500, 'Halo+ could not build your calendar just now. Your calendar app will try again on its own.');
  }
});
