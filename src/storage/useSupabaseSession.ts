import { useEffect } from 'react';
import { useStore } from './store';
import { getSupabaseClient, SupabaseRepo } from './supabaseRepo';

/** Keeps the store's remote connection in step with the Supabase auth session. */
export function useSupabaseSession() {
  const { data, actions } = useStore();
  const { supabaseUrl, supabaseAnonKey } = data.settings;

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      void actions.connectRemote(null, null);
      return;
    }
    let client;
    try {
      client = getSupabaseClient(supabaseUrl, supabaseAnonKey);
    } catch {
      void actions.connectRemote(null, null);
      return;
    }
    const apply = (userId: string | null, email: string | null) => {
      void actions.connectRemote(userId ? new SupabaseRepo(client, userId) : null, email);
    };
    void client.auth.getSession().then(({ data: s }) => apply(s.session?.user.id ?? null, s.session?.user.email ?? null));
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        apply(session?.user.id ?? null, session?.user.email ?? null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabaseUrl, supabaseAnonKey, actions]);
}
