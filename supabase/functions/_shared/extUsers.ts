// The extension counting itself (Loop 304): one anonymous ping a day per browser, and an uninstall from the
// haloplus.app/bye page. Plain shaping here (tested in vitest); the writes are in recordExtPing / recordExtUninstall.
// deno-lint-ignore-file no-explicit-any
const DEVICE = /^[A-Za-z0-9_-]{8,80}$/;
const VERSION = /^\d{1,3}(\.\d{1,4}){1,3}$/;
const PLANS = ['none', 'free', 'plus', 'max'];
/** Which browser (Loop 308): Chrome, Edge, Safari on a Mac, Safari on an iPhone or iPad. */
const PLATFORMS = ['chrome', 'edge', 'safari-mac', 'safari-ios'];
export const REASONS = ['didnt-work', 'not-needed', 'too-much', 'privacy', 'other'];

/** The ping as a row, or null: a browser id, today (Phoenix), the version, the plan, signed in or not. */
export function pingRow(b: Record<string, unknown>, now = new Date()): { device_id: string; day: string; ext_version: string | null; plan: string; signed_in: boolean; platform: string | null } | null {
  const device = typeof b.device_id === 'string' && DEVICE.test(b.device_id) ? b.device_id : null;
  if (!device) return null;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return {
    device_id: device,
    day,
    ext_version: typeof b.ext_version === 'string' && VERSION.test(b.ext_version) ? b.ext_version : null,
    plan: typeof b.plan === 'string' && PLANS.includes(b.plan) ? b.plan : 'none',
    signed_in: b.signed_in === true,
    platform: typeof b.platform === 'string' && PLATFORMS.includes(b.platform) ? b.platform : null,
  };
}

export const cleanReason = (r: unknown): string | null => (typeof r === 'string' && REASONS.includes(r) ? r : null);

export async function recordExtPing(db: any, b: Record<string, unknown>): Promise<{ ok: boolean; why?: string }> {
  const row = pingRow(b);
  if (!row) return { ok: false, why: 'shape' };
  // A flood is cut off: at most 2000 new rows in any 10 minutes (a ping is once a day per browser).
  const { count } = await db.from('ext_pings').select('device_id', { count: 'exact', head: true }).gte('at', new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 2000) return { ok: true, why: 'busy' };
  const { error } = await db.from('ext_pings').upsert(row, { onConflict: 'device_id,day', ignoreDuplicates: false });
  // A browser from before installs were counted gets its row now, so it can link to its account and count as installed.
  await db.from('ext_installs').upsert({ device_id: row.device_id, source: 'unknown', ext_version: row.ext_version, test: b.test === true }, { onConflict: 'device_id', ignoreDuplicates: true });
  if (b.test === true) await db.from('ext_installs').update({ test: true }).eq('device_id', row.device_id);
  return { ok: !error, why: error?.message };
}

export async function recordExtUninstall(db: any, b: Record<string, unknown>): Promise<{ ok: boolean; why?: string }> {
  const device = typeof b.device_id === 'string' && DEVICE.test(b.device_id) ? b.device_id : null;
  if (!device) return { ok: false, why: 'shape' };
  const reason = cleanReason(b.reason);
  const { data } = await db.from('ext_installs').select('device_id, uninstalled_at').eq('device_id', device).maybeSingle();
  if (!data) await db.from('ext_installs').insert({ device_id: device, source: 'unknown', uninstalled_at: new Date().toISOString(), uninstall_reason: reason });
  else await db.from('ext_installs').update({ ...(data.uninstalled_at ? {} : { uninstalled_at: new Date().toISOString() }), ...(reason ? { uninstall_reason: reason } : {}) }).eq('device_id', device);
  return { ok: true };
}
