import { supabase } from '../auth/client';

/**
 * Which screens and buttons get used, counted, nothing more. Keys are short names ("screen:now", "sync",
 * "done"), never a title, a class or anything typed. Counts are kept on this device and sent in one batch a
 * minute, only for a signed-in account on a build with accounts; otherwise they are counted and dropped.
 */
const pending = new Map<string, number>();
let timer: number | null = null;
const KEY_RE = /^[a-z0-9_.:-]{1,64}$/;

export function bump(key: string): void {
  if (!KEY_RE.test(key)) return;
  pending.set(key, (pending.get(key) ?? 0) + 1);
  if (typeof window === 'undefined') return;
  if (timer === null) timer = window.setTimeout(() => void flush(), 60_000);
}

export async function flush(): Promise<void> {
  timer = null;
  if (pending.size === 0) return;
  const keys = [...pending.keys()];
  const counts = keys.map((k) => pending.get(k) ?? 1);
  pending.clear();
  const c = supabase();
  if (!c) return;
  try {
    const { data } = await c.auth.getSession();
    if (!data.session) return;
    await c.rpc('bump_usage', { p_keys: keys, p_counts: counts });
  } catch {
    // Counting is never worth an error in the app.
  }
}

/** Sends what is pending when the tab goes away, so a short visit still counts. */
export function installUsageFlush(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
