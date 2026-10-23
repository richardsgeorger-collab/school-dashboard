// A Halo+-on-Halo moment from the extension (0.8.0): the card shown, closed, clicked, the pill or a class line clicked.
// Counted per student per day in usage_events through bump_usage_for; the student comes from the sync key.
// deno-lint-ignore-file no-explicit-any
const EVENTS = ['card-shown', 'card-closed', 'card-click', 'pill-click', 'pill-hover', 'class-click', 'box-click', 'box-shown', 'badge-click', 'next-shown', 'sync-click'];

export async function recordHaloUi(db: any, b: Record<string, unknown>): Promise<{ ok: boolean; why?: string }> {
  const event = typeof b.event === 'string' ? b.event : '';
  if (!EVENTS.includes(event)) return { ok: false, why: 'event' };
  const key = typeof b.key === 'string' ? b.key.slice(0, 128) : '';
  if (!key) return { ok: false, why: 'key' };
  const user = ((await db.from('sync_keys').select('user_id').eq('key', key).maybeSingle()).data?.user_id as string | undefined) ?? null;
  if (!user) return { ok: false, why: 'unknown key' };
  const { error } = await db.rpc('bump_usage_for', { p_user: user, p_key: `halo:${event}` });
  return { ok: !error, why: error?.message };
}
