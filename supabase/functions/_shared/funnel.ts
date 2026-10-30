// The Instagram funnel's signed-out steps (Loop 294), posted to report as kind 'funnel'. One row per browser and step
// (the first one counts); a flood is cut off at 600 rows in any 10 minutes.
// deno-lint-ignore-file no-explicit-any
import { funnelRow } from './laptopLink.ts';

export async function recordFunnel(db: any, b: Record<string, unknown>): Promise<{ ok: boolean; why?: string }> {
  const row = funnelRow(b);
  if (!row) return { ok: false, why: 'shape' };
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from('funnel_events').select('vid', { count: 'exact', head: true }).gte('at', since);
  if ((count ?? 0) >= 600) return { ok: true, why: 'busy' };
  const { error } = await db.from('funnel_events').upsert(row, { onConflict: 'vid,step', ignoreDuplicates: true });
  return { ok: !error, why: error?.message };
}
