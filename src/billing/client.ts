import { getAccessToken, supabaseConfig } from '../auth/client';
import type { Interval, Paid } from './subscription';
import { report, reportFunctionFailure } from '../monitor/report';
import { watchCheckout } from '../monitor/planWatch';

type Result = { ok: true; url: string; ms?: Record<string, number> } | { ok: false; error: string };

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
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; ms?: Record<string, number> };
    const t2 = performance.now();
    lastTiming = { tokenMs: Math.round(t1 - t0), functionMs: Math.round(t2 - t1), totalMs: Math.round(t2 - t0) };
    if (lastTiming.totalMs > 8000) report({ kind: 'silent', title: `${FN_LABEL[fn] ?? fn} opened slowly: ${Math.round(lastTiming.totalMs / 1000)} s`, message: `token ${lastTiming.tokenMs} ms, function ${lastTiming.functionMs} ms`, place: fn, details: { ...lastTiming } });
    if (!res.ok || !data.url) {
      reportFunctionFailure(fn, res.status, data.error);
      return { ok: false, error: data.error ?? `The billing service answered ${res.status}.` };
    }
    return { ok: true, url: data.url, ms: data.ms };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    reportFunctionFailure(fn, 0, aborted ? 'timed out after 25 s' : e instanceof Error ? e.message : String(e));
    return { ok: false, error: aborted ? 'Checkout took too long to open. Try again.' : 'Could not reach the billing service. Check your connection.' };
  }
}
const FN_LABEL: Record<string, string> = { 'stripe-checkout': 'Checkout', 'stripe-portal': 'Billing portal' };

/** Wakes the checkout function and the sign-in before the button is pressed, so the press itself is quick. */
export function warmCheckout(): void {
  const cfg = supabaseConfig();
  if (!cfg) return;
  void fetch(`${cfg.url}/functions/v1/stripe-checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.anonKey}`, apikey: cfg.anonKey }, body: '{"warm":true}' }).catch(() => undefined);
  void getAccessToken(4000);
}

/** Where Stripe should send the student back: this app, whatever host it is on. */
const returnTo = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

/**
 * Max's checkout made ready before the press (2026-10-29, George: it took about 30 seconds to open): asked for as soon
 * as a Max button is on screen, kept 20 minutes, so the press only opens Stripe's page. One at a time for each place to
 * land after paying (`next`): two buttons on one screen with different landings (Keep Max, and a study tool's "Unlock")
 * each keep their own, so one never throws away the other's.
 */
const prepared = new Map<string, { url: string; at: number }>();
const preparing = new Map<string, Promise<Result>>();
export function prepareCheckout(next = ''): Promise<Result> {
  const ready = prepared.get(next);
  if (ready && Date.now() - ready.at < 20 * 60_000) return Promise.resolve({ ok: true, url: ready.url });
  const onWay = preparing.get(next);
  if (onWay) return onWay;
  const p = call('stripe-checkout', { tier: 'max', interval: 'month', returnTo: returnTo(), next: next || undefined, source: 'app' }).then((r) => {
    if (r.ok) prepared.set(next, { url: r.url, at: Date.now() });
    preparing.delete(next);
    return r;
  });
  preparing.set(next, p);
  return p;
}

/** Stripe Checkout for Max. On success the browser leaves for Stripe and comes back to where the student was. */
export const startCheckout = async (tier: Paid, _interval: Interval = 'month', next?: string): Promise<Result> => {
  const r = await prepareCheckout(next ?? '');
  // A session is used once: the next press makes a new one.
  prepared.delete(next ?? '');
  // Watched from here: back with success and no plan change in 5 minutes is reported (monitor/planWatch.tsx).
  if (r.ok) watchCheckout(tier);
  return r;
};

/**
 * Max's checkout for a student who pressed a Max button in the extension (2026-10-29): the popup's "Max: $0.99/mo", or
 * "Unlock with Max" on a Halo page, which comes back to that same Halo page (the server allows only Halo+ and Halo).
 */
export function checkoutFrom(source: 'halo' | 'popup', back: string | null): Promise<Result> {
  const onHalo = source === 'halo' && !!back && /^https:\/\/halo\.gcu\.edu\//.test(back);
  if (source === 'halo' || source === 'popup') watchCheckout('max');
  return call('stripe-checkout', { tier: 'max', interval: 'month', returnTo: onHalo ? back : returnTo(), source });
}

/** Stripe's customer portal: the card and invoices, or with 'cancel' straight to the cancel confirmation for the plan. */
export const openPortal = (flow?: 'cancel'): Promise<Result> => call('stripe-portal', { returnTo: returnTo(), flow });
