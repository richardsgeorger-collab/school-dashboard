import type { Course, Item } from '../domain/types';
import { classProgress, isWorkDone } from './joy';

/**
 * What the Halo+ extension needs to celebrate a submission on Halo itself (Phase 6, 2026-10-02): the Celebrations
 * switch, and for each Halo assignment its points and class, with each class's points done and in all. The page writes
 * it to localStorage; the extension's dashboard script carries it to the extension, and its Halo script reads it the
 * moment Halo says "Assignment has been submitted." Nothing else: no titles, no grades, no names.
 */
export const JOY_SNAP_SLOT = 'school-dashboard:joy-snap';

export interface JoySnap {
  v: 1;
  celebrate: boolean;
  /** Halo assessment id → [points, class key, already done]. */
  items: Record<string, [number, string, 0 | 1]>;
  /** Class key → [code, points done, points in all]. */
  classes: Record<string, [string, number, number]>;
}

export function joySnap(courses: Course[], items: Item[], celebrate: boolean): JoySnap {
  const snap: JoySnap = { v: 1, celebrate, items: {}, classes: {} };
  courses.forEach((c, n) => {
    const p = classProgress(c.id, items);
    if (!p) return;
    const key = String(n);
    snap.classes[key] = [c.code, p.done, p.total];
    for (const i of items) if (i.courseId === c.id && i.source === 'halo' && i.haloId && i.points > 0) snap.items[i.haloId] = [i.points, key, isWorkDone(i) ? 1 : 0];
  });
  return snap;
}

/** The line the extension shows: "+50 pts · CHM-113L now 36% done". Mirrors extension/content-halo.js. */
export function haloDoneLine(snap: JoySnap, haloId: string | null): string | null {
  const it = haloId ? snap.items[haloId] : undefined;
  if (!it) return null;
  const [points, key, done] = it;
  const c = snap.classes[key];
  if (!c) return `+${points} pts`;
  const pct = Math.min(100, Math.floor(((c[1] + (done ? 0 : points)) / c[2]) * 100));
  return `+${points} pts · ${c[0]} now ${pct}% done`;
}
