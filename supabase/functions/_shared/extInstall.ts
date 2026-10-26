// The extension installed (Loop 268), and later linked to the account that signed in: Admin's Web Store funnel.
// No sign-in is needed to say "installed" (a Web Store install has no account yet); a link needs the account's sync key,
// so a device can only be tied to the account whose key it holds.
// deno-lint-ignore-file no-explicit-any
const DEVICE = /^[A-Za-z0-9_-]{8,80}$/;

export async function recordExtInstall(db: any, b: Record<string, unknown>): Promise<{ ok: boolean; why?: string; linked?: boolean }> {
  const device = typeof b.device_id === 'string' && DEVICE.test(b.device_id) ? b.device_id : '';
  if (!device) return { ok: false, why: 'device' };
  if (b.kind === 'ext-install') {
    // Test browsers (headless) install the extension all day; they are not students.
    if (b.headless === true) return { ok: true, why: 'headless' };
    const source = b.source === 'store' ? 'store' : 'site';
    const { error } = await db.from('ext_installs').upsert({ device_id: device, source, ext_version: typeof b.ext_version === 'string' ? b.ext_version.slice(0, 20) : null, browser: typeof b.browser === 'string' ? b.browser.slice(0, 20) : null }, { onConflict: 'device_id', ignoreDuplicates: true });
    return { ok: !error, why: error?.message };
  }
  const key = typeof b.key === 'string' ? b.key.slice(0, 128) : '';
  if (!key) return { ok: false, why: 'key' };
  const user = ((await db.from('sync_keys').select('user_id').eq('key', key).maybeSingle()).data?.user_id as string | undefined) ?? null;
  if (!user) return { ok: false, why: 'unknown key' };
  const { data, error } = await db.from('ext_installs').update({ user_id: user, linked_at: new Date().toISOString() }).eq('device_id', device).is('user_id', null).select('device_id');
  // Linked now, or already linked to this account (another key message): either way the extension can stop saying it.
  const already = !data?.length && (await db.from('ext_installs').select('user_id').eq('device_id', device).maybeSingle()).data?.user_id === user;
  return { ok: !error, why: error?.message, linked: !error && (!!data?.length || already) };
}
