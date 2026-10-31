import { useEffect, useState } from 'react';
import { announceDb, type StoredAnnouncement } from '../halo/announce';
import { supabase } from '../auth/client';
import { DEMO_DATA_KEY, DEMO_FLAG, DEMO_PENDING_KEY, DEMO_SEED, DEMO_SNAPSHOT_KEY, isDemo, isPreview, PREVIEW_FLAG } from './demo';
import { DemoTour } from './DemoTour';
import { demoStudent } from './student';

/**
 * Loads the demo student onto this device and reloads into her Now. Her planner goes under the demo cache keys, her
 * announcements wait in DEMO_SEED for the demo database (which exists only once the flag is on and the page reloads).
 * Loading again starts her over: every visitor sees the same morning.
 */
export function enterDemo(): void {
  const s = demoStudent(new Date().toISOString());
  localStorage.setItem(DEMO_DATA_KEY, JSON.stringify(s.data));
  localStorage.setItem(DEMO_PENDING_KEY, '[]');
  localStorage.setItem(DEMO_SNAPSHOT_KEY, JSON.stringify(s.snapshot));
  localStorage.setItem(DEMO_SEED, JSON.stringify(s.announcements));
  localStorage.setItem(DEMO_FLAG, '1');
  sessionStorage.removeItem(TOUR_KEY);
  window.location.hash = '#/now';
  window.location.reload();
}

/** Back to the admin's own planner, exactly as it was; the demo's keys go. A preview goes back to the student's Now. */
export function leaveDemo(): void {
  const preview = isPreview();
  for (const k of [DEMO_FLAG, DEMO_SEED, DEMO_DATA_KEY, DEMO_PENDING_KEY, DEMO_SNAPSHOT_KEY, PREVIEW_FLAG]) localStorage.removeItem(k);
  sessionStorage.removeItem(TOUR_KEY);
  window.location.hash = preview ? '#/now' : '#/admin';
  window.location.reload();
}

/** A new student's Preview (Loop 299): the demo student, labelled, until their own classes come in. */
export function enterPreview(): void {
  localStorage.setItem(PREVIEW_FLAG, new Date().toISOString());
  enterDemo();
}
/** Older than this, a preview ends on the next open: the app is the student's, not Maya's. */
const PREVIEW_HOURS = 6;

export const TOUR_KEY = 'school-dashboard:demo-tour';

/** In demo: puts the waiting announcements into the demo database, then shows the chip and the tour. */
export function DemoHost() {
  const [ready, setReady] = useState(false);
  // A preview ends by itself: after a few hours, or the moment the student's own classes are in their account.
  useEffect(() => {
    if (!isPreview()) return;
    const since = Date.parse(localStorage.getItem(PREVIEW_FLAG) ?? '');
    if (!(since > Date.now() - PREVIEW_HOURS * 3600e3)) return leaveDemo();
    const c = supabase();
    if (!c) return;
    const look = async () => {
      const { data: s } = await c.auth.getSession();
      if (!s.session) return;
      const { count } = await c.from('courses').select('id', { count: 'exact', head: true }).eq('user_id', s.session.user.id);
      if ((count ?? 0) > 0) leaveDemo();
    };
    void look();
    const t = window.setInterval(() => void look(), 60_000);
    // Back in the app (from the laptop, from email): look at once.
    const back = () => document.visibilityState === 'visible' && void look();
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', back);
    };
  }, []);
  useEffect(() => {
    if (!isDemo()) return;
    const raw = localStorage.getItem(DEMO_SEED);
    if (!raw) {
      setReady(true);
      return;
    }
    void (async () => {
      try {
        const posts = JSON.parse(raw) as StoredAnnouncement[];
        for (const courseId of new Set(posts.map((p) => p.courseId))) await announceDb.removeCourse(courseId);
        for (const p of posts) await announceDb.put(p);
      } finally {
        localStorage.removeItem(DEMO_SEED);
        setReady(true);
      }
    })();
  }, []);
  if (!isDemo() || !ready) return null;
  return <DemoTour />;
}
