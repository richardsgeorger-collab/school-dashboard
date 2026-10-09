import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ENV } from '../env';

/**
 * The Supabase connection, baked into the build from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. The anon key is
 * public by design; row-level security is what keeps one student's data from another. Nothing here is typed into
 * a Settings screen any more.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const PLACEHOLDER = /PLACEHOLDER|xxxx/i;

export function supabaseConfig(): SupabaseConfig | null {
  const url = ENV.SUPABASE_URL;
  const anonKey = ENV.SUPABASE_ANON_KEY;
  if (!url || !anonKey || PLACEHOLDER.test(url) || PLACEHOLDER.test(anonKey)) return null;
  return { url, anonKey };
}

export const isConfigured = (): boolean => supabaseConfig() !== null;

let client: SupabaseClient | null = null;
/**
 * Arrived from a password-reset email. The client reads the link's tokens from the address as it starts, before any
 * screen is listening for its one-off PASSWORD_RECOVERY event, so the address is checked here first.
 */
let recoveryFromUrl = false;
export const arrivedForRecovery = (): boolean => recoveryFromUrl;

export function supabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = supabaseConfig();
  if (!cfg) return null;
  if (typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search)) recoveryFromUrl = true;
  client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

/** The stored session, read straight from storage: what getSession would hand back once it gets its lock. */
function storedAccessToken(): string | null {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const ref = new URL(cfg.url).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const s = JSON.parse(raw) as { access_token?: string; expires_at?: number };
    if (!s.access_token || (s.expires_at && s.expires_at * 1000 < Date.now() + 30_000)) return null;
    return s.access_token;
  } catch {
    return null;
  }
}

/**
 * The signed-in session's token. getSession waits on a lock shared by every tab; when another tab holds it (a
 * refresh in flight), that wait has run to tens of seconds (George's 30-second checkout, 2026-10-09). With a limit,
 * the stored session's own token stands in once the wait passes it.
 */
export async function getAccessToken(limitMs?: number): Promise<string | null> {
  const c = supabase();
  if (!c) return null;
  const viaClient = c.auth.getSession().then(({ data }) => data.session?.access_token ?? null);
  if (!limitMs) return viaClient;
  const fallback = new Promise<string | null>((resolve) => setTimeout(() => resolve(storedAccessToken()), limitMs));
  const first = await Promise.race([viaClient, fallback]);
  return first ?? (await viaClient);
}
