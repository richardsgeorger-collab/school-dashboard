// The intro offer (George, 2026-10-09): Max at $2.99 for the first month, then $7.99. A Stripe coupon, $5.00 off,
// once, on the Max monthly price only; for an account that started its free week and has never paid; one use.
// Pure, so the rule is tested; the checkout function applies it with the Stripe key it has (test or live).
export const INTRO_COUPON_ID = 'halo-intro-max-299';
export const INTRO_AMOUNT_OFF_CENTS = 500;
export const INTRO_FIRST_MONTH = 2.99;

export interface IntroFacts {
  tier: string;
  interval: string;
  trialStartedAt: string | null;
  introOfferAt: string | null;
  /** The account has or had a subscription row (paid before). */
  everPaid: boolean;
}

export function introEligible(f: IntroFacts): { ok: true } | { ok: false; why: string } {
  if (f.tier !== 'max' || f.interval !== 'month') return { ok: false, why: 'Max monthly only' };
  if (!f.trialStartedAt) return { ok: false, why: 'no free week' };
  if (f.introOfferAt) return { ok: false, why: 'used' };
  if (f.everPaid) return { ok: false, why: 'paid before' };
  return { ok: true };
}

/** The coupon as Stripe should hold it; created once per mode (test, live) by the checkout function. */
export const introCoupon = () => ({ id: INTRO_COUPON_ID, amount_off: INTRO_AMOUNT_OFF_CENTS, currency: 'usd', duration: 'once' as const, name: 'Halo+ Max, first month $2.99' });
