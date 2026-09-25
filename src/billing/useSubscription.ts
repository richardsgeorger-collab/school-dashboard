import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import type { Interval, Paid } from './subscription';

export interface SubscriptionRow {
  tier: Paid;
  interval: Interval;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** The student's subscription row, written only by the Stripe webhook. Null when there is none. */
export function useSubscription(userId: string | null, tick = 0): SubscriptionRow | null {
  const [row, setRow] = useState<SubscriptionRow | null>(null);
  useEffect(() => {
    const c = supabase();
    if (!c || !userId) {
      setRow(null);
      return;
    }
    let live = true;
    void c
      .from('subscriptions')
      .select('tier, interval, status, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => live && setRow((data as SubscriptionRow | null) ?? null));
    return () => {
      live = false;
    };
  }, [userId, tick]);
  return row;
}
