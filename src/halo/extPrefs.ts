import type { Settings } from '../domain/types';

/**
 * Settings saved on a computer before its account existed (no-account mode, Loop 305): the extension's Halo+-on-Halo
 * switches, sent once by the extension after sign-up. Kept unless the account's own copy is newer. Returns the patch.
 */
export interface ExtPrefs {
  feat?: { off?: unknown; at?: unknown } | null;
  uiOn?: { on?: unknown; at?: unknown } | null;
}
export function prefsPatch(p: ExtPrefs, settings: Pick<Settings, 'stamps'>): Partial<Settings> {
  const out: Partial<Settings> = {};
  const stamp = (k: string) => (settings.stamps as Record<string, string> | undefined)?.[k] ?? '';
  const f = p.feat;
  if (f && Array.isArray(f.off) && typeof f.at === 'string' && f.at > stamp('haloFeaturesOff')) out.haloFeaturesOff = f.off.filter((x): x is string => typeof x === 'string' && /^[a-z-]{2,30}$/.test(x)).slice(0, 40);
  const u = p.uiOn;
  if (u && typeof u.on === 'boolean' && typeof u.at === 'string' && u.at > stamp('haloOnHalo')) out.haloOnHalo = u.on;
  return out;
}
