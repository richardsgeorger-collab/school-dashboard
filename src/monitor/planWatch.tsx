import { useEffect, useRef } from 'react';
import { useAccount } from '../auth/AccountContext';
import { friendGift, rewardDaysLeft, trialDaysLeft } from '../config/flags';
import { useMyGrants } from '../referral/Invite';
import { useRoute } from '../router';
import { report } from './report';

const RANK = ['free', 'plus', 'pro', 'max'];
const rank = (t: string | null | undefined) => Math.max(0, RANK.indexOf(t ?? 'free'));
const CHECKOUT_KEY = 'school-dashboard:checkout-watch';
const FIVE_MIN = 5 * 60_000;

/** Called when checkout opens: the plan it was for, so a return that never upgrades is noticed. */
export function watchCheckout(tier: string): void {
  try {
    localStorage.setItem(CHECKOUT_KEY, JSON.stringify({ tier, startedAt: new Date().toISOString(), returnedAt: null }));
  } catch {
    /* storage off */
  }
}

/**
 * Two silent failures about plans (George, 2026-09-30), reported once each:
 *  - checkout came back successful but the plan had not changed 5 minutes later (the Stripe webhook did not land);
 *  - the plan loaded as Free for an account that is paying, on its free week, or on a friend link or invite credit.
 */
export function PlanWatch() {
  const { tier, planKnown, profile, auth } = useAccount();
  const grants = useMyGrants();
  const { params } = useRoute();
  const returned = params.get('checkout') === 'success';
  const said = useRef(new Set<string>());

  // Back from Stripe with success: the clock starts now.
  useEffect(() => {
    if (!returned) return;
    try {
      const w = JSON.parse(localStorage.getItem(CHECKOUT_KEY) ?? 'null') as { tier: string; returnedAt: string | null } | null;
      if (w && !w.returnedAt) localStorage.setItem(CHECKOUT_KEY, JSON.stringify({ ...w, returnedAt: new Date().toISOString() }));
    } catch {
      /* storage off */
    }
  }, [returned]);

  // The plan caught up (done), or 5 minutes passed without it (reported once, then forgotten).
  useEffect(() => {
    if (!planKnown || !auth.session) return;
    const check = () => {
      let w: { tier: string; returnedAt: string | null } | null = null;
      try {
        w = JSON.parse(localStorage.getItem(CHECKOUT_KEY) ?? 'null');
      } catch {
        w = null;
      }
      if (!w?.returnedAt) return;
      const forget = () => {
        try {
          localStorage.removeItem(CHECKOUT_KEY);
        } catch {
          /* storage off */
        }
      };
      if (rank(tier) >= rank(w.tier)) return forget();
      if (Date.now() - Date.parse(w.returnedAt) < FIVE_MIN) return;
      report({ kind: 'silent', title: 'Checkout finished but the plan did not change within 5 minutes', place: 'checkout', details: { bought: w.tier, plan: tier, minutes: Math.round((Date.now() - Date.parse(w.returnedAt)) / 60_000) } });
      forget();
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [tier, planKnown, auth.session]);

  // Free, but the account's own facts say it should not be.
  useEffect(() => {
    if (!planKnown || !profile || tier !== 'free') return;
    const now = new Date().toISOString();
    const why = profile.tier !== 'free' ? 'a paid plan' : trialDaysLeft(profile) !== null ? 'its free week' : friendGift(profile) ? 'a friend link' : rewardDaysLeft(profile) !== null ? 'referral days' : grants.some((g) => g.starts <= now && g.ends > now) ? 'invite credit' : null;
    if (!why || said.current.has(why)) return;
    said.current.add(why);
    report({ kind: 'silent', title: `A plan loaded as Free for an account on ${why}`, place: 'plan', details: { should: why } });
  }, [planKnown, profile, tier, grants]);
  return null;
}
