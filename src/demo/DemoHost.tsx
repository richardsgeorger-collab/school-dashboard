import { useEffect, useState } from 'react';
import { announceDb, type StoredAnnouncement } from '../halo/announce';
import { DEMO_DATA_KEY, DEMO_FLAG, DEMO_PENDING_KEY, DEMO_SEED, DEMO_SNAPSHOT_KEY, isDemo } from './demo';
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

/** Back to the admin's own planner, exactly as it was; the demo's keys go. */
export function leaveDemo(): void {
  for (const k of [DEMO_FLAG, DEMO_SEED, DEMO_DATA_KEY, DEMO_PENDING_KEY, DEMO_SNAPSHOT_KEY]) localStorage.removeItem(k);
  sessionStorage.removeItem(TOUR_KEY);
  window.location.hash = '#/admin';
  window.location.reload();
}

export const TOUR_KEY = 'school-dashboard:demo-tour';

/** In demo: puts the waiting announcements into the demo database, then shows the chip and the tour. */
export function DemoHost() {
  const [ready, setReady] = useState(false);
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
