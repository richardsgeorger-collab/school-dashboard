// One extension sync run, as it starts and as it ends (2026-10-21, extension 0.7.6), for Admin's sync success rate.
// Sent to the report function (kind 'sync-run'), which the extension already reaches: no new permission. The run is
// filed under the account its sync key belongs to (an unknown key files it under no account). Nothing about the
// student's classes is sent, only how the run went.
// deno-lint-ignore-file no-explicit-any
const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);
export const OUTCOMES = ['landed', 'failed', 'kept', 'skipped'];

export async function recordSyncRun(db: any, b: Record<string, unknown>): Promise<{ ok: boolean; why?: string }> {
  const run = str(b.run, 64);
  if (!run || !/^[a-z0-9-]+$/i.test(run)) return { ok: false, why: 'run' };
  const device = str(b.device_id, 64);
  // At most 40 runs an hour from one browser.
  if (device && b.phase === 'start') {
    const { count } = await db.from('sync_runs').select('run_id', { count: 'exact', head: true }).eq('device_id', device).gte('started_at', new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= 40) return { ok: true, why: 'dropped' };
  }
  let user: string | null = null;
  const key = str(b.key, 128);
  if (key) user = ((await db.from('sync_keys').select('user_id').eq('key', key).maybeSingle()).data?.user_id as string | undefined) ?? null;
  const base = { run_id: run, device_id: device, ext_version: str(b.ext_version, 16), browser: str(b.browser, 40), auto: typeof b.auto === 'boolean' ? b.auto : null, setup: b.setup === true, ...(user ? { user_id: user } : {}) };
  if (b.phase === 'start') {
    const { error } = await db.from('sync_runs').upsert({ ...base, started_at: new Date().toISOString() }, { onConflict: 'run_id', ignoreDuplicates: true });
    return { ok: !error, why: error?.message };
  }
  const outcome = str(b.outcome, 16);
  if (!outcome || !OUTCOMES.includes(outcome)) return { ok: false, why: 'outcome' };
  const end = { ...base, ended_at: new Date().toISOString(), outcome, cause: str(b.cause, 40), retried: b.retried === true, tab: str(b.tab, 16), seconds: typeof b.seconds === 'number' ? Math.round(b.seconds) : null };
  const { error } = await db.from('sync_runs').upsert(end, { onConflict: 'run_id' });
  return { ok: !error, why: error?.message };
}
