import { describe, expect, it } from 'vitest';
import { creditLine, creditSource, plusCredit } from './credit';

// The timelines scripts/e2e-referral-timeline.mjs reads back from the real backend (2026-09-30).
const now = '2026-09-30T19:46:00.000Z';
const weekEnds = '2026-10-07T19:46:00.000Z';
const g = (starts: string, ends: string, source = 'referral:inviter') => ({ tier: 'plus', starts, ends, source });
const tz = 'America/Phoenix';
const trial = { trialEndsAt: weekEnds, rewardTier: null, rewardUntil: null };

describe('Plus credit from invites', () => {
  it('an invited friend: 30 days, starting the moment the Max week ends', () => {
    const c = plusCredit([g(weekEnds, '2026-11-06T19:46:00.000Z', 'referral:invitee')], trial, now)!;
    expect(creditLine(c, tz)).toBe('Plus credit: 30 days, starts Oct 7 when your Max week ends.');
    expect(creditSource(c)).toBe("From your friend's invite.");
  });
  it('an inviter with two friends: one stretch of 60 days, never the first 30 alone', () => {
    const c = plusCredit([g(weekEnds, '2026-11-06T19:46:00.000Z'), g('2026-11-06T19:46:00.000Z', '2026-12-06T19:46:00.000Z')], trial, now)!;
    expect(c.days).toBe(60);
    expect(creditLine(c, tz)).toBe('Plus credit: 60 days, starts Oct 7 when your Max week ends, through Dec 6.');
    expect(creditSource(c)).toBe('For the friends you invited.');
  });
  it('running now (the free week long over): days left and the end', () => {
    const c = plusCredit([g('2026-09-30T19:46:00.000Z', '2026-10-30T19:46:00.000Z')], { trialEndsAt: '2026-08-28T19:46:00.000Z', rewardTier: null, rewardUntil: null }, now)!;
    expect(creditLine(c, tz)).toBe('Plus credit: on now, 30 days left, until Oct 30.');
  });
  it('after Max from a friend link, and after a paid plan that is ending', () => {
    const gift = plusCredit([g('2026-10-20T19:46:00.000Z', '2026-11-19T19:46:00.000Z')], { trialEndsAt: now, rewardTier: 'max', rewardUntil: '2026-10-20T19:46:00.000Z' }, now)!;
    expect(creditLine(gift, tz)).toBe('Plus credit: 30 days, starts Oct 20 when your free Max ends.');
    const paid = plusCredit([g('2026-10-12T19:46:00.000Z', '2026-11-11T19:46:00.000Z')], { trialEndsAt: '2026-09-10T19:46:00.000Z', rewardTier: null, rewardUntil: null }, now)!;
    expect(creditLine(paid, tz)).toBe('Plus credit: 30 days, starts Oct 12 when your paid plan ends.');
  });
  it('nothing when there is no Plus credit left', () => {
    expect(plusCredit([], trial, now)).toBeNull();
    expect(plusCredit([g('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z')], trial, now)).toBeNull();
  });
});

describe('the invite progress line', () => {
  it('Plus days for grants, a moved charge for a paying inviter', async () => {
    const { progressLine } = await import('./Invite');
    expect(progressLine({ joined: 2, days: 60 })).toBe("2 friends joined. You've earned 60 days of Plus.");
    expect(progressLine({ joined: 1, days: 30, paused: 1 })).toBe('1 friend joined. Your next charge moves 30 days later.');
    expect(progressLine({ joined: 3, days: 90, paused: 1 })).toBe("3 friends joined. You've earned 60 days of Plus. Your next charge moves 30 days later.");
    expect(progressLine({ joined: 0, days: 0 })).toBeNull();
  });
});
