import { supabase } from '../auth/client';
import { readLedger, type ReadEntry } from './announce';

/**
 * The read ledger, mirrored to the account. The ledger is what stops a post being read twice; kept only in the
 * browser, a second device (the phone) read every post again at full cost and showed "Reading 1 of 56" again.
 * The mirror only ever adds: an entry on either side is a read that happened, and nothing here removes one.
 */
interface Row {
  post_id: string;
  hash: string;
  read_at: string;
  summary: string | null;
  action_count: number;
}

const toEntry = (r: Row): ReadEntry => ({ id: r.post_id, hash: r.hash, at: r.read_at, summary: r.summary, count: r.action_count });
const toRow = (e: ReadEntry): Row => ({ post_id: e.id, hash: e.hash, read_at: e.at, summary: e.summary, action_count: e.count });

/** Postgres answers "+00:00", the browser writes "Z": the same instant, compared as instants, never as strings. */
const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** Which entries each side lacks. Same post on both sides: the newer read wins, and a tie changes nothing. */
export function planLedgerSync(local: Map<string, ReadEntry>, remote: Row[]): { pull: ReadEntry[]; push: ReadEntry[] } {
  const pull: ReadEntry[] = [];
  const remoteById = new Map(remote.map((r) => [r.post_id, r]));
  for (const r of remote) {
    const have = local.get(r.post_id);
    if (!have || (have.hash !== r.hash && ms(r.read_at) > ms(have.at))) pull.push(toEntry(r));
  }
  const push: ReadEntry[] = [];
  for (const e of local.values()) {
    const there = remoteById.get(e.id);
    if (!there || (there.hash !== e.hash && ms(e.at) > ms(there.read_at))) push.push(e);
  }
  return { pull, push };
}

async function client() {
  const c = supabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session ? c : null;
}

/** Bring this device's ledger up to the account's and the account's up to this device's. Returns how many arrived. */
export async function syncLedger(): Promise<number> {
  const c = await client();
  if (!c) return 0;
  const { data, error } = await c.from('read_ledger').select('post_id, hash, read_at, summary, action_count');
  if (error || !data) return 0;
  const local = await readLedger.all();
  const plan = planLedgerSync(local, data as Row[]);
  for (const e of plan.pull) await readLedger.put(e);
  if (plan.push.length) await c.from('read_ledger').upsert(plan.push.map(toRow), { onConflict: 'user_id,post_id' });
  return plan.pull.length;
}

/** One read just happened here; tell the account. Fire and forget: the local ledger is the truth on this device. */
export async function pushLedgerEntry(e: ReadEntry): Promise<void> {
  const c = await client();
  if (!c) return;
  await c.from('read_ledger').upsert(toRow(e), { onConflict: 'user_id,post_id' });
}
