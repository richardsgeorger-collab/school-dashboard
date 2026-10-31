// The rule for every script (George, 2026-10-13, after a repair script erased a real student's planner): no script
// deletes or overwrites real student data unless it
//   1. first saves a backup of exactly those rows (outside the repo, never committed),
//   2. prints exactly what it will delete, account by account and table by table, and
//   3. was run with --real-accounts. Without the flag it refuses, after printing the list.
// Throwaway accounts (an address ending in .invalid, which every test script makes) are not real student data: they
// pass without a backup or the flag. Nothing else counts as a throwaway, not even George's own aliases.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const REAL_FLAG = '--real-accounts';
// Throwaways: example.invalid addresses, and Resend's test inbox (delivered+…@resend.dev, a sink no person reads).
export const isThrowaway = (email) => /\.invalid$|^delivered\+[a-z0-9._-]+@resend\.dev$/i.test(String(email ?? ''));
const realAllowed = () => process.argv.includes(REAL_FLAG);
const BACKUPS = process.env.SCRIPT_BACKUP_DIR ?? join(homedir(), 'haloplus-script-backups');

async function emailsOf(db, ids) {
  const out = new Map();
  for (const id of new Set(ids)) {
    const { data, error } = await db.auth.admin.getUserById(id);
    if (error && !/not found/i.test(error.message)) throw new Error(`guard: could not look up ${id}: ${error.message}`);
    out.set(id, data?.user?.email ?? null);
  }
  return out;
}

/** Throws unless every account here is a throwaway (or the run says --real-accounts and has backed up first). */
export async function assertThrowaways(db, ids, what = 'this cleanup') {
  const emails = await emailsOf(db, ids);
  const real = [...emails].filter(([, e]) => e !== null && !isThrowaway(e));
  if (real.length) throw new Error(`guard: ${what} would touch ${real.length} real account(s) (${real.map(([id, e]) => `${e} ${id.slice(0, 8)}`).join(', ')}). It only removes throwaway accounts; refusing.`);
}

/**
 * Before deleting or overwriting rows: targets are { table, userId, ids? (only these rows), idColumn? }. Saves every
 * targeted row to a backup file, prints what will go, and refuses on any real account without --real-accounts.
 * Returns the backup's path (null when every account was a throwaway).
 */
export async function guardDelete(db, { reason, targets }) {
  const emails = await emailsOf(db, targets.map((t) => t.userId));
  const real = targets.filter((t) => { const e = emails.get(t.userId); return e !== null && !isThrowaway(e); });
  if (!real.length) return null;
  const rows = [];
  console.log(`\nguard: ${reason}. It will delete or overwrite, on real accounts:`);
  for (const t of real) {
    let q = db.from(t.table).select('*').eq('user_id', t.userId);
    if (t.ids) q = q.in(t.idColumn ?? 'id', t.ids);
    const { data, error } = await q;
    if (error) throw new Error(`guard: could not back up ${t.table} for ${t.userId}: ${error.message}`);
    rows.push({ table: t.table, userId: t.userId, email: emails.get(t.userId), rows: data ?? [] });
    const ids = (data ?? []).map((r) => r[t.idColumn ?? 'id']).filter(Boolean);
    console.log(`  ${emails.get(t.userId)} (${t.userId.slice(0, 8)})  ${t.table}: ${data?.length ?? 0} row(s)${ids.length ? `: ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? `, … ${ids.length - 12} more` : ''}` : ''}`);
  }
  mkdirSync(BACKUPS, { recursive: true, mode: 0o700 });
  const file = join(BACKUPS, `${new Date().toISOString().replace(/[:.]/g, '-')}-${reason.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.json`);
  writeFileSync(file, JSON.stringify({ reason, at: new Date().toISOString(), rows }, null, 1), { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`guard: backup of exactly these rows: ${file}`);
  if (!realAllowed()) throw new Error(`guard: refusing to touch real accounts. Read the list above; to go ahead, run again with ${REAL_FLAG}.`);
  return file;
}
