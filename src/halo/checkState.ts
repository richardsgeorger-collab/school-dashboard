/** The top-bar button's handler, reachable from Now's nudge: press() opens the picker, press('all') copies every class at once. */
export const checkHaloPress: { current: ((mode?: 'all') => void) | null } = { current: null };

/** Whether the student has copied an audit prompt and gone to Halo; the button's next press opens the paste box for those classes. */
const KEY = 'school-dashboard:halo-check';
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PendingCheck {
  at: string;
  /** The classes the copied prompt covers, in audit order. */
  courseIds: string[];
  /** An earlier run stopped early: what is still owed, and where it stopped. */
  resume: { courseIds: string[]; stoppedAt: string } | null;
}

export function pendingCheck(now = Date.now()): PendingCheck | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    let rec: PendingCheck | null = null;
    if (typeof v === 'string') rec = { at: v, courseIds: [], resume: null };
    else if (v && typeof v === 'object' && typeof (v as { at?: unknown }).at === 'string') {
      const o = v as { at: string; courseId?: string | null; courseIds?: string[]; resume?: PendingCheck['resume'] };
      rec = { at: o.at, courseIds: o.courseIds ?? (o.courseId ? [o.courseId] : []), resume: o.resume ?? null };
    }
    if (!rec) return null;
    const at = new Date(rec.at).getTime();
    return Number.isFinite(at) && now - at < WINDOW_MS ? rec : null;
  } catch {
    return null;
  }
}
export function setPendingCheck(courseIds: string[], resume: PendingCheck['resume'] = null, now = new Date().toISOString()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: now, courseIds, resume }));
  } catch {
    /* storage unavailable */
  }
}
export function clearPendingCheck(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
