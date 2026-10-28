import { describe, expect, it } from 'vitest';
import { INTRO, INTRO_COUPON_ID, introCoupon, introEligible } from '../functions/_shared/intro';
import { INTRO_FIRST_MONTH, PRICES } from '../functions/_shared/tiers';
import { INTRO_FIRST_MONTH as APP_INTRO, PRICES as APP_PRICES } from '../../src/config/tiers';

describe('the intro offer (Max 2026-10-09, Plus 2026-10-27)', () => {
  const base = { tier: 'max', interval: 'month', trialStartedAt: '2026-10-01T00:00:00Z', introOfferAt: null, everPaid: false };
  it('Plus or Max monthly, after a free week, never paid, once per account', () => {
    expect(introEligible(base)).toEqual({ ok: true });
    expect(introEligible({ ...base, tier: 'plus' })).toEqual({ ok: true });
    expect(introEligible({ ...base, tier: 'free' }).ok).toBe(false);
    expect(introEligible({ ...base, interval: 'year' }).ok).toBe(false);
    expect(introEligible({ ...base, tier: 'plus', interval: 'semester' }).ok).toBe(false);
    expect(introEligible({ ...base, trialStartedAt: null }).ok).toBe(false);
    // One intro per account: a Max intro used means no Plus intro, and the other way round.
    expect(introEligible({ ...base, introOfferAt: '2026-10-05T00:00:00Z' })).toEqual({ ok: false, why: 'used' });
    expect(introEligible({ ...base, tier: 'plus', introOfferAt: '2026-10-05T00:00:00Z' })).toEqual({ ok: false, why: 'used' });
    expect(introEligible({ ...base, everPaid: true })).toEqual({ ok: false, why: 'paid before' });
    expect(introEligible({ ...base, tier: 'plus', everPaid: true })).toEqual({ ok: false, why: 'paid before' });
  });
  it('Max: $5.00 off once, so $7.99 becomes $2.99 and the next month is $7.99', () => {
    const c = introCoupon('max');
    expect(c.id).toBe(INTRO_COUPON_ID);
    expect(c.id).toBe('halo-intro-max-299');
    expect(c.duration).toBe('once');
    expect((799 - c.amount_off) / 100).toBe(2.99);
    expect(introCoupon().id).toBe(INTRO_COUPON_ID);
  });
  it('Plus: $4.00 off once, so $4.99 becomes $0.99 and the next month is $4.99', () => {
    const c = introCoupon('plus');
    expect(c.id).toBe('halo-intro-plus-099');
    expect(c.duration).toBe('once');
    expect(c.currency).toBe('usd');
    expect((499 - c.amount_off) / 100).toBe(0.99);
  });
  it('the prices shown match the coupons, on the server and in the app', () => {
    for (const t of ['plus', 'max'] as const) {
      expect(Math.round(PRICES[t].month * 100) - INTRO[t].amountOffCents).toBe(Math.round(INTRO[t].firstMonth * 100));
      expect(INTRO_FIRST_MONTH[t]).toBe(INTRO[t].firstMonth);
      expect(APP_INTRO[t]).toBe(INTRO[t].firstMonth);
      expect(APP_PRICES[t].month).toBe(PRICES[t].month);
    }
  });
});
