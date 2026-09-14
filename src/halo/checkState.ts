/** Whether the student has copied the audit prompt and gone to Halo; the button's next press opens the paste box. */
const KEY = 'school-dashboard:halo-check';
const WINDOW_MS = 24 * 60 * 60 * 1000;

export function pendingCheck(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const at = new Date(JSON.parse(raw) as string).getTime();
    return Number.isFinite(at) && now - at < WINDOW_MS;
  } catch {
    return false;
  }
}
export function setPendingCheck(now = new Date().toISOString()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(now));
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
