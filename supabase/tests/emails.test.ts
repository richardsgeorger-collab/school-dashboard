import { describe, expect, it } from 'vitest';
import { isAllowedKind, maySend, renderEmail, unsubToken, unsubUrlFor } from '../functions/_shared/emails';

const unsubForSetup = 'https://x.supabase.co/functions/v1/email-unsub?u=def&t=456';

describe('the two student emails (George, 2026-10-09)', () => {
  const unsub = 'https://x.supabase.co/functions/v1/email-unsub?u=abc&t=123';
  it('the day before the free week ends: the date, what changes, the prices, Stay on Free, no guilt, one-click unsubscribe', () => {
    // Days of use (2026-10-22): the 30-day limit, one day of use left, the last day.
    const m = renderEmail('trial_ending', { why: 'cap', ends_at: '2026-10-12T23:59:00-07:00', cap_at: '2026-10-12T23:59:00-07:00' }, unsub)!;
    expect(m.subject).toBe('Your free Halo+ Max ends Monday, Oct 12');
    expect(m.text).toContain('Your free days of Max end Monday, Oct 12, 30 days after your first sync');
    const one = renderEmail('trial_ending', { why: 'one-left', used: 6, cap_at: '2026-11-20T20:00:00Z' }, unsub)!;
    expect(one.subject).toBe('1 day of Halo+ Max left');
    expect(one.text).toContain("You've used 6 of your 7 free days of Max. A day counts when you open Halo+");
    expect(renderEmail('trial_ending', { why: 'last-day', used: 7 }, unsub)!.subject).toBe('Your last day of Halo+ Max');
    expect(m.text).toContain('nothing charges unless you choose a plan');
    expect(m.text).toContain('$7.99');
    expect(m.text).toContain('$4.99');
    expect(m.text).toContain("Or stay on Free. That's fine too.");
    expect(m.text).toContain('See the plans: https://haloplus.app/#/you?s=plan');
    expect(m.text).toContain(`One click: ${unsub}`);
    expect(m.html).toContain(`href="${unsub}"`);
    expect(m.text).not.toMatch(/miss out|last chance|don't lose|hurry/i);
  });
  it('a sync broken for three days: when, what to do, and that it comes once', () => {
    const m = renderEmail('sync_broken', { last_at: '2026-10-06T13:00:00Z', days: 3 }, unsub)!;
    expect(m.subject).toBe("Halo+ hasn't heard from Halo in 3 days");
    expect(m.text).toContain('Your last sync was Tuesday, Oct 6.');
    expect(m.text).toContain('open halo.gcu.edu and log in, then open Halo+ and press Sync');
    expect(m.text).toContain("You'll get this once");
    expect(m.text).toContain('Account emails (password resets, receipts) still arrive.');
  });
  it('an unknown kind renders nothing', () => {
    expect(renderEmail('newsletter', {}, unsub)).toBeNull();
  });
  it('the unsubscribe token is a stable HMAC of the account id, and the link carries both', async () => {
    const a = await unsubToken('8c3c8dde-6375-4b46-8955-c49bd64f5e2b', 'secret-one');
    const b = await unsubToken('8c3c8dde-6375-4b46-8955-c49bd64f5e2b', 'secret-one');
    const c = await unsubToken('8c3c8dde-6375-4b46-8955-c49bd64f5e2b', 'secret-two');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(await unsubUrlFor('https://x.supabase.co', 'u-1', 's')).toBe(`https://x.supabase.co/functions/v1/email-unsub?u=u-1&t=${await unsubToken('u-1', 's')}`);
  });

  it('the allowlist and the week (George, 2026-10-09): account mail always; one non-account a week; no reminder to someone who opened Halo+ in three days', () => {
    const now = '2026-10-09T20:00:00Z';
    expect(isAllowedKind('newsletter')).toBe(false);
    expect(maySend('newsletter', { lastNonAccountSentAt: null, lastOpenedAt: null, now })).toEqual({ ok: false, why: 'not an email Halo+ sends' });
    expect(maySend('market_setup', { lastNonAccountSentAt: '2026-10-09T10:00:00Z', lastOpenedAt: '2026-10-09T10:00:00Z', now })).toEqual({ ok: true });
    expect(maySend('trial_ending', { lastNonAccountSentAt: '2026-10-05T10:00:00Z', lastOpenedAt: null, now }).ok).toBe(false);
    expect(maySend('trial_ending', { lastNonAccountSentAt: '2026-10-01T10:00:00Z', lastOpenedAt: null, now }).ok).toBe(true);
    expect(maySend('reminder', { lastNonAccountSentAt: null, lastOpenedAt: '2026-10-08T12:00:00Z', now }).ok).toBe(false);
    expect(maySend('reminder', { lastNonAccountSentAt: null, lastOpenedAt: '2026-10-03T12:00:00Z', now }).ok).toBe(true);
    expect(maySend('sync_broken', { lastNonAccountSentAt: null, lastOpenedAt: '2026-10-09T12:00:00Z', now }).ok).toBe(true);
    expect(renderEmail('reminder', {}, 'https://u')!.subject).toBe("Don't forget about Halo+");
  });
  it('finish setup (George, 2026-10-13): once, a day after a sign-up that never synced; counts toward the week; unsubscribe; the free week not used up', () => {
    const now = '2026-10-13T20:00:00Z';
    expect(isAllowedKind('finish_setup')).toBe(true);
    expect(maySend('finish_setup', { lastNonAccountSentAt: '2026-10-10T10:00:00Z', lastOpenedAt: null, now }).ok).toBe(false);
    expect(maySend('finish_setup', { lastNonAccountSentAt: null, lastOpenedAt: '2026-10-13T10:00:00Z', now }).ok).toBe(true);
    const m = renderEmail('finish_setup', {}, unsubForSetup)!;
    expect(m.subject).toBe('Your Halo+ classes are 2 minutes away');
    expect(m.text).toContain('Add to Chrome');
    expect(m.text).toContain('none of it is used up yet');
    expect(m.text).toContain('https://haloplus.app/#/now');
    expect(m.text).toContain(unsubForSetup);
  });
});
