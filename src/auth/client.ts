import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  if (!url || !anonKey || PLACEHOLDER.test(url) || PLACEHOLDER.test(anonKey)) return null;
  return { url, anonKey };
}

export const isConfigured = (): boolean => supabaseConfig() !== null;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = supabaseConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const c = supabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.access_token ?? null;
}
