import { getAccessToken, supabaseConfig } from '../auth/client';
import type { Interval, Paid } from './subscription';

type Result = { ok: true; url: string } | { ok: false; error: string };

async function call(fn: string, body: Record<string, unknown>): Promise<Result> {
  const cfg = supabaseConfig();
  if (!cfg) return { ok: false, error: 'Accounts are not set up on this build.' };
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'Sign in first.' };
  try {
    const res = await fetch(`${cfg.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: cfg.anonKey },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) return { ok: false, error: data.error ?? `The billing service answered ${res.status}.` };
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, error: 'Could not reach the billing service. Check your connection.' };
  }
}

/** Where Stripe should send the student back: this app, whatever host it is on. */
const returnTo = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

/** Stripe Checkout for a plan. On success the browser leaves for Stripe and comes back to You. */
export const startCheckout = (tier: Paid, interval: Interval): Promise<Result> => call('stripe-checkout', { tier, interval, returnTo: returnTo() });

/** Stripe's customer portal: change the card, switch plans, cancel. */
export const openPortal = (): Promise<Result> => call('stripe-portal', { returnTo: returnTo() });
