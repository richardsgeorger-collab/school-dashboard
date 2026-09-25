import { useEffect } from 'react';
import { useStore } from '../storage/store';
import { SupabaseRepo } from '../storage/supabaseRepo';
import { supabase } from './client';

/**
 * Keeps the store's remote mirror in step with the signed-in account: sign in and this device's data merges into the
 * account (last write wins, deletions kept), sign out and it stays on this device. The connection is the build's,
 * not something typed into a screen.
 */
export function useAccountSync() {
  const { actions } = useStore();
  useEffect(() => {
    const client = supabase();
    if (!client) {
      void actions.connectRemote(null, null);
      return;
    }
    const apply = (userId: string | null, email: string | null) => {
      void actions.connectRemote(userId ? new SupabaseRepo(client, userId) : null, email);
    };
    void client.auth.getSession().then(({ data: s }) => apply(s.session?.user.id ?? null, s.session?.user.email ?? null));
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        apply(session?.user.id ?? null, session?.user.email ?? null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [actions]);
}
