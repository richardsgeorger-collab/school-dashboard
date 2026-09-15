/** Whether the student has copied an audit prompt and gone to Halo; the button's next press opens the paste box for that class. */
const KEY = 'school-dashboard:halo-check';
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PendingCheck {
  at: string;
  courseId: string | null;
}

export function pendingCheck(now = Date.now()): PendingCheck | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    const rec: PendingCheck | null = typeof v === 'string' ? { at: v, courseId: null } : v && typeof v === 'object' && typeof (v as PendingCheck).at === 'string' ? { at: (v as PendingCheck).at, courseId: (v as PendingCheck).courseId ?? null } : null;
    if (!rec) return null;
    const at = new Date(rec.at).getTime();
    return Number.isFinite(at) && now - at < WINDOW_MS ? rec : null;
  } catch {
    return null;
  }
}
export function setPendingCheck(courseId: string | null, now = new Date().toISOString()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: now, courseId }));
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
