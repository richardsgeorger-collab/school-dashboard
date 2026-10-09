import { describe, expect, it } from 'vitest';
import { renderEmail, unsubToken, unsubUrlFor } from '../functions/_shared/emails';

describe('the two student emails (George, 2026-10-09)', () => {
  const unsub = 'https://x.supabase.co/functions/v1/email-unsub?u=abc&t=123';
  it('the day before the free week ends: the date, what changes, the prices, Stay on Free, no guilt, one-click unsubscribe', () => {
    const m = renderEmail('trial_ending', { ends_at: '2026-10-12T23:59:00-07:00' }, unsub)!;
    expect(m.subject).toBe('Your free week of Halo+ Max ends tomorrow');
    expect(m.text).toContain('Your free week ends Monday, Oct 12.');
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
});
