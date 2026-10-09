import { getAccessToken, supabaseConfig } from '../auth/client';
import type { Interval, Paid } from './subscription';
import { report, reportFunctionFailure } from '../monitor/report';
import { watchCheckout } from '../monitor/planWatch';

type Result = { ok: true; url: string } | { ok: false; error: string };

/** How long the last checkout took, step by step, for the slow-opening report (George, 2026-10-09: ~30 s once). */
export interface CheckoutTiming {
  tokenMs: number;
  functionMs: number;
  totalMs: number;
}
export let lastTiming: CheckoutTiming | null = null;

async function call(fn: string, body: Record<string, unknown>): Promise<Result> {
  const cfg = supabaseConfig();
  if (!cfg) return { ok: false, error: 'Accounts are not set up on this build.' };
  const t0 = performance.now();
  const token = await getAccessToken(4000);
  const t1 = performance.now();
  if (!token) return { ok: false, error: 'Sign in first.' };
  try {
    const ctrl = new AbortController();
    const kill = window.setTimeout(() => ctrl.abort(), 25_000);
    const res = await fetch(`${cfg.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: cfg.anonKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).finally(() => window.clearTimeout(kill));
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    const t2 = performance.now();
    lastTiming = { tokenMs: Math.round(t1 - t0), functionMs: Math.round(t2 - t1), totalMs: Math.round(t2 - t0) };
    if (lastTiming.totalMs > 8000) report({ kind: 'silent', title: `${FN_LABEL[fn] ?? fn} opened slowly: ${Math.round(lastTiming.totalMs / 1000)} s`, message: `token ${lastTiming.tokenMs} ms, function ${lastTiming.functionMs} ms`, place: fn, details: { ...lastTiming } });
    if (!res.ok || !data.url) {
      reportFunctionFailure(fn, res.status, data.error);
      return { ok: false, error: data.error ?? `The billing service answered ${res.status}.` };
    }
    return { ok: true, url: data.url };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    reportFunctionFailure(fn, 0, aborted ? 'timed out after 25 s' : e instanceof Error ? e.message : String(e));
    return { ok: false, error: aborted ? 'Checkout took too long to open. Try again.' : 'Could not reach the billing service. Check your connection.' };
  }
}
const FN_LABEL: Record<string, string> = { 'stripe-checkout': 'Checkout', 'stripe-portal': 'Billing portal' };

/** Wakes the checkout function and the session before the button is pressed, so the press itself is quick. */
export function warmCheckout(): void {
  const cfg = supabaseConfig();
  if (!cfg) return;
  void fetch(`${cfg.url}/functions/v1/stripe-checkout`, { method: 'OPTIONS' }).catch(() => undefined);
  void getAccessToken(4000);
}

/** Where Stripe should send the student back: this app, whatever host it is on. */
const returnTo = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

/** Stripe Checkout for a plan. On success the browser leaves for Stripe and comes back to You. */
export const startCheckout = async (tier: Paid, interval: Interval, next?: string): Promise<Result> => {
  const r = await call('stripe-checkout', { tier, interval, returnTo: returnTo(), next });
  // Watched from here: back with success and no plan change in 5 minutes is reported (monitor/planWatch.tsx).
  if (r.ok) watchCheckout(tier);
  return r;
};

/** Stripe's customer portal: the card and invoices, or with 'cancel' straight to the cancel confirmation for the plan. */
export const openPortal = (flow?: 'cancel'): Promise<Result> => call('stripe-portal', { returnTo: returnTo(), flow });
