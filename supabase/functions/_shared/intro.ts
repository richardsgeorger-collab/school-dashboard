// The intro offer: the first month of a paid plan for less, then the regular price. Max at $2.99 (George, 2026-10-09),
// Plus at $0.99 (George, 2026-10-27). A Stripe coupon per plan, applied once, on that plan's monthly price only; for an
// account that started its free week and has never paid; one intro per account, whichever plan it is on.
// Pure, so the rule is tested; the checkout function applies it with the Stripe key it has (test or live).
export type IntroTier = 'plus' | 'max';

export const INTRO: Record<IntroTier, { couponId: string; amountOffCents: number; firstMonth: number; name: string }> = {
  max: { couponId: 'halo-intro-max-299', amountOffCents: 500, firstMonth: 2.99, name: 'Halo+ Max, first month $2.99' },
  plus: { couponId: 'halo-intro-plus-099', amountOffCents: 400, firstMonth: 0.99, name: 'Halo+ Plus, first month $0.99' },
};
/** Kept for the Max coupon already made in test and live mode. */
export const INTRO_COUPON_ID = INTRO.max.couponId;

export interface IntroFacts {
  tier: string;
  interval: string;
  trialStartedAt: string | null;
  introOfferAt: string | null;
  /** The account has or had a subscription row (paid before). */
  everPaid: boolean;
}

export const isIntroTier = (t: string): t is IntroTier => t === 'plus' || t === 'max';

export function introEligible(f: IntroFacts): { ok: true } | { ok: false; why: string } {
  if (!isIntroTier(f.tier) || f.interval !== 'month') return { ok: false, why: 'monthly Plus or Max only' };
  if (!f.trialStartedAt) return { ok: false, why: 'no free week' };
  if (f.introOfferAt) return { ok: false, why: 'used' };
  if (f.everPaid) return { ok: false, why: 'paid before' };
  return { ok: true };
}

/** The plan's coupon as Stripe should hold it; created once per mode (test, live) by the checkout function. */
export const introCoupon = (tier: IntroTier = 'max') => ({ id: INTRO[tier].couponId, amount_off: INTRO[tier].amountOffCents, currency: 'usd', duration: 'once' as const, name: INTRO[tier].name });
