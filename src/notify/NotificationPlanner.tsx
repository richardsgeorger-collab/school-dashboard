import { trialState } from '../config/flags';
import { isDemo } from '../demo/demo';
import { planWinback } from '../winback/rules';
import { useInviteProgress, useMyGrants } from '../referral/Invite';
import { useEffect } from 'react';
import { useAccount } from '../auth/AccountContext';
import { supabase } from '../auth/client';
import { can } from '../config/flags';
import { useStore } from '../storage/store';
import { planNotices } from './plan';
import { receiptsLine } from '../domain/receipts';
import { useReceipts } from '../views/TrialOffer';
import { registerSw } from './push';

/**
 * Registers the worker, and, for a signed-in student on a plan with reminders who turned push on, keeps the
 * server's plan of what to send in step with the schedule: every change to the work or the preferences rewrites
 * the unsent rows, a few seconds after the last change. The server only sends what is due.
 */
export function NotificationPlanner() {
  const { data, schedule, today } = useStore();
  const demo = isDemo();
  const { auth, tier, profile, planKnown } = useAccount();
  // What Max did during the trial, for its reminders (counted from the trial's start).
  const recap = useReceipts(profile?.trialStartedAt ?? undefined);
  const invites = useInviteProgress();
  const grants = useMyGrants();
  useEffect(() => {
    void registerSw();
  }, []);
  const prefs = data.settings.reminders;
  const lastPull = data.settings.lastPull?.at ?? null;
  const tz = data.settings.timezone;
  useEffect(() => {
    // Plans that include reminders get the full plan; Free gets only the win-back pushes (2026-09-29), and only with
    // notifications on.
    if (demo || !auth.session || !auth.userId || !prefs?.pushEnabled) return;
    const full = can('reminders', tier);
    const c = supabase();
    if (!c) return;
    const userId = auth.userId;
    const t = setTimeout(async () => {
      const now = new Date().toISOString();
      const notices = full ? planNotices({ items: data.items, courses: data.courses, schedule, prefs, tz, today, now, lastPull, trialStartedAt: profile?.friendFrom ? null : (profile?.trialStartedAt ?? null), trialEndsAt: profile?.trialEndsAt ?? null, trialRecap: recap ? receiptsLine(recap, 'during your trial') : null, recap: can('weeklyRecap', tier), gradeUps: data.settings.joy?.gradeUpRecent ?? [] }) : [];
      // Win-back: Free after the Max week, not in a referral, never upgraded.
      const eligible = planKnown && tier === 'free' && trialState(profile) === 'used' && !profile?.referredBy && !profile?.friendFrom && (invites?.joined ?? 0) === 0 && grants.length === 0;
      if (eligible) {
        const { data: sent } = await c.from('winback_sends').select('sent_at').eq('user_id', userId).order('sent_at', { ascending: false }).limit(10);
        const own = data.settings.winbackOwnOpenAt ?? '';
        const times = (sent ?? []).map((r) => r.sent_at as string);
        notices.push(...planWinback({ items: data.items, tz, today, now, lastPull, quietFrom: prefs.quietFrom ?? '22:00', quietTo: prefs.quietTo ?? '07:00', eligible, lastSentAt: times[0] ?? null, ignoredInRow: times.filter((t) => t > own).length }));
      }
      // Upsert by each notice's key (one "morning note for Sep 25" per student, enforced by a unique index), then drop
      // unsent rows that are no longer planned. Overlapping runs converge instead of stacking duplicates, and a note
      // that was already sent keeps its sent_at, so it is never sent twice.
      if (notices.length) await c.from('notification_plan').upsert(notices.map((n) => ({ user_id: userId, key: n.key, send_at: n.sendAt, kind: n.kind, title: n.title, body: n.body, url: n.url })), { onConflict: 'user_id,key' });
      const keep = notices.map((n) => `"${n.key}"`).join(',');
      const stale = c.from('notification_plan').delete().eq('user_id', userId).is('sent_at', null);
      await (keep ? stale.not('key', 'in', `(${keep})`) : stale);
      await c.from('notification_prefs').upsert({
        user_id: userId,
        morning_time: prefs.morningTime && prefs.morningTime !== 'off' ? prefs.morningTime : '07:30',
        quiet_from: prefs.quietFrom ?? '22:00',
        quiet_to: prefs.quietTo ?? '07:00',
        morning: prefs.morning !== false && prefs.morningTime !== 'off',
        heavy_day: prefs.heavyDay !== false,
        not_started: prefs.notStarted !== false,
        resync: prefs.resync !== false,
        // The email switch only when the student set it here; an unsubscribe made from an email link stays otherwise.
        ...(prefs.email !== undefined ? { email: prefs.email, email_unsub_at: prefs.email ? null : now } : {}),
        updated_at: now,
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [auth.session, auth.userId, tier, prefs, data.items, data.courses, tz, lastPull, schedule, today, recap, profile?.trialEndsAt, invites, grants]);
  return null;
}
