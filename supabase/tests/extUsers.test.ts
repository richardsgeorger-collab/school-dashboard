import { describe, expect, it } from 'vitest';
import { cleanReason, pingRow } from '../functions/_shared/extUsers';
import { funnelRow } from '../functions/_shared/laptopLink';

describe('the extension counting itself (Loop 304)', () => {
  it('a ping: a browser id, the Phoenix day, the version, the plan, signed in; nothing else', () => {
    const r = pingRow({ device_id: 'ext-1234abcd-ef', ext_version: '0.12.16', plan: 'max', signed_in: true, email: 'x@y.z', classes: [1] }, new Date('2026-11-01T05:00:00Z'));
    expect(r).toEqual({ device_id: 'ext-1234abcd-ef', day: '2026-10-31', ext_version: '0.12.16', plan: 'max', signed_in: true });
    expect(pingRow({ device_id: 'ext-1234abcd-ef', plan: 'gold', ext_version: '<script>' })).toMatchObject({ plan: 'none', ext_version: null, signed_in: false });
    expect(pingRow({ device_id: 'x' })).toBeNull();
  });
  it('an uninstall reason only from the list', () => {
    expect(cleanReason('didnt-work')).toBe('didnt-work');
    expect(cleanReason('my email is me@x.com')).toBeNull();
  });
  it('the welcome tab after a store install counts its two steps, nothing else', () => {
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'welcome', src: 'store' })?.src).toBe('store');
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'signup-start', src: 'store' })?.step).toBe('signup-start');
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'visit', src: 'store' })).toBeNull();
  });
});
