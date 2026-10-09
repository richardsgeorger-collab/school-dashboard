/**
 * Demo mode (George, 2026-10-08: a table at the GCU student market, a visitor watching the laptop). An admin loads a
 * made-up student, Maya Torres, into this device and shows the app with her classes. Nothing of hers ever reaches the
 * server, and nothing real is touched:
 * - the planner reads and writes its own cache keys (storage/localRepo.ts) and its own announcement database
 *   (halo/announce.ts), so the admin's real classes stay where they were and come back on exit;
 * - the account mirror is never connected (auth/useAccountSync.ts), the announcement reader, the read ledger, the
 *   notification planner, usage counts and the server-sync poll all stand down (each checks isDemo());
 * - every name in the data is invented (demo/student.ts).
 * The flag is read once per page load: entering and leaving reload the page.
 */
export const DEMO_FLAG = 'school-dashboard:demo';
/** The announcements to put into the demo database on the next load, written by enterDemo() before the reload. */
export const DEMO_SEED = 'school-dashboard:demo-seed';
export const DEMO_DATA_KEY = 'school-dashboard:v1:demo';
export const DEMO_PENDING_KEY = 'school-dashboard:pending:demo';
export const DEMO_SNAPSHOT_KEY = 'school-dashboard:now-snapshot:demo';
export const DEMO_DB_NAME = 'school-dashboard-announcements-demo';
export const DEMO_STUDENT = 'Maya Torres';

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

let flag: boolean | null = null;
/** True for the whole page load when the demo student is loaded on this device. */
export function isDemo(): boolean {
  if (flag === null) flag = typeof window !== 'undefined' && get(DEMO_FLAG) === '1';
  return flag;
}

/** Test seam: the next isDemo() reads storage again. */
export function resetDemoFlag(): void {
  flag = null;
}
