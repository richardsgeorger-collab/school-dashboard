import { describe, expect, it } from 'vitest';
import { INTRO_COUPON_ID, introCoupon, introEligible } from '../functions/_shared/intro';

describe('the intro offer (George, 2026-10-09)', () => {
  const base = { tier: 'max', interval: 'month', trialStartedAt: '2026-10-01T00:00:00Z', introOfferAt: null, everPaid: false };
  it('Max monthly, after a free week, never paid, once', () => {
    expect(introEligible(base)).toEqual({ ok: true });
    expect(introEligible({ ...base, tier: 'plus' }).ok).toBe(false);
    expect(introEligible({ ...base, interval: 'year' }).ok).toBe(false);
    expect(introEligible({ ...base, trialStartedAt: null }).ok).toBe(false);
    expect(introEligible({ ...base, introOfferAt: '2026-10-05T00:00:00Z' })).toEqual({ ok: false, why: 'used' });
    expect(introEligible({ ...base, everPaid: true })).toEqual({ ok: false, why: 'paid before' });
  });
  it('the coupon is $5.00 off once, so $7.99 becomes $2.99 and the next month is $7.99', () => {
    const c = introCoupon();
    expect(c.id).toBe(INTRO_COUPON_ID);
    expect(c.duration).toBe('once');
    expect((799 - c.amount_off) / 100).toBe(2.99);
  });
});
