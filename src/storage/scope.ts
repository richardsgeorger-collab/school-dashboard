/**
 * Which account this device's browser databases belong to (George, 2026-10-09). The planner cache is cleared when
 * another account signs in (localRepo), but the announcement, syllabus, slide, recording and AI databases are too
 * valuable to clear (a syllabus lives nowhere else), so each account gets databases of its own: the first account
 * keeps the original names, every other one gets names with its id in them. Read at module load; the store reloads
 * the page on a switch, so a tab never mixes two accounts' databases.
 */
const OWNER_KEY = 'school-dashboard:owner';
const DB_OWNER_KEY = 'school-dashboard:db-owner';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** '' for the account the original databases belong to, '-<id>' for any other. */
export function dbSuffix(): string {
  const owner = read(OWNER_KEY);
  const first = read(DB_OWNER_KEY);
  if (!owner || owner === 'local' || !first || first === owner) return '';
  return `-${owner.slice(0, 8)}`;
}

/** The first account to claim this device owns the original databases; recorded once, when it claims the cache. */
export function claimDatabases(owner: string): void {
  if (read(DB_OWNER_KEY)) return;
  try {
    localStorage.setItem(DB_OWNER_KEY, owner);
  } catch {
    /* storage unavailable */
  }
}
