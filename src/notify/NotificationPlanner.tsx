import { useEffect } from 'react';
import { useAccount } from '../auth/AccountContext';
import { supabase } from '../auth/client';
import { can } from '../config/flags';
import { useStore } from '../storage/store';
import { planNotices } from './plan';
import { registerSw } from './push';

/**
 * Registers the worker, and, for a signed-in student on a plan with reminders who turned push on, keeps the
 * server's plan of what to send in step with the schedule: every change to the work or the preferences rewrites
 * the unsent rows, a few seconds after the last change. The server only sends what is due.
 */
export function NotificationPlanner() {
  const { data, schedule, today } = useStore();
  const { auth, tier } = useAccount();
  useEffect(() => {
    void registerSw();
  }, []);
  const prefs = data.settings.reminders;
  const lastPull = data.settings.lastPull?.at ?? null;
  const tz = data.settings.timezone;
  useEffect(() => {
    if (!auth.session || !auth.userId || !prefs?.pushEnabled || !can('reminders', tier)) return;
    const c = supabase();
    if (!c) return;
    const userId = auth.userId;
    const t = setTimeout(async () => {
      const now = new Date().toISOString();
      const notices = planNotices({ items: data.items, courses: data.courses, schedule, prefs, tz, today, now, lastPull });
      await c.from('notification_plan').delete().eq('user_id', userId).is('sent_at', null);
      if (notices.length) await c.from('notification_plan').insert(notices.map((n) => ({ send_at: n.sendAt, kind: n.kind, title: n.title, body: n.body, url: n.url })));
      await c.from('notification_prefs').upsert({
        user_id: userId,
        morning_time: prefs.morningTime && prefs.morningTime !== 'off' ? prefs.morningTime : '07:30',
        quiet_from: prefs.quietFrom ?? '22:00',
        quiet_to: prefs.quietTo ?? '07:00',
        morning: prefs.morning !== false && prefs.morningTime !== 'off',
        heavy_day: prefs.heavyDay !== false,
        not_started: prefs.notStarted !== false,
        resync: prefs.resync !== false,
        updated_at: now,
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [auth.session, auth.userId, tier, prefs, data.items, data.courses, tz, lastPull, schedule, today]);
  return null;
}
