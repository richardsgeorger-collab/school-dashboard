import { describe, expect, it } from 'vitest';
import { callerIp, cleanEmail, funnelRow, keyedHash, laptopEmail, laptopUrl } from '../functions/_shared/laptopLink';

describe('the one laptop email (Loop 294)', () => {
  it('takes a real-looking address, tidied; refuses the rest', () => {
    expect(cleanEmail('  Maya.Torres@My.GCU.edu ')).toBe('maya.torres@my.gcu.edu');
    for (const bad of ['', 'maya', 'maya@gcu', 'a b@gcu.edu', 'x@y.c', '<x@y.com>', 'a@b.com, c@d.com', 42, null, `${'a'.repeat(250)}@b.com`]) expect(cleanEmail(bad)).toBeNull();
  });
  it('the laptop link says where it came from', () => {
    expect(laptopUrl('email', 'ig', 'abcDEF12_-')).toBe('https://haloplus.app/laptop/?src=ig&via=email&t=abcDEF12_-');
    expect(laptopUrl('share', null, null)).toBe('https://haloplus.app/laptop/?via=share');
  });
  it('one email: the link, "Open this on your laptop", "Just this one", no unsubscribe list, the link escaped', () => {
    const m = laptopEmail('https://haloplus.app/laptop/?src=ig&via=email');
    expect(m.subject).toBe('Open this on your laptop');
    expect(m.text).toContain('https://haloplus.app/laptop/?src=ig&via=email');
    expect(m.text).toContain('Just this one');
    expect(m.html).toContain('href="https://haloplus.app/laptop/?src=ig&amp;via=email"');
    expect(m.html.toLowerCase()).not.toContain('unsubscribe');
  });
  it('signed up on the phone with Google: the link says so, the email says Continue with Google (Loop 298)', () => {
    expect(laptopUrl('email', 'ig', 'abcDEF12_-', 'google')).toBe('https://haloplus.app/laptop/?src=ig&via=email&t=abcDEF12_-&acct=google');
    const m = laptopEmail('https://haloplus.app/laptop/?acct=google', 'google');
    expect(m.text).toContain('You’re in!');
    expect(m.text).toContain('we’ll send you one reminder');
    expect(laptopEmail('https://x', 'email').text).toContain('sign in with your email');
    expect(m.text).toContain('Continue with Google');
    expect(laptopEmail('https://x', 'apple').text).toContain('Continue with Apple');
    expect(m.text).not.toContain('didn’t keep your address');
  });
  it('the same address always hashes the same, under the secret; never the address itself', async () => {
    const a = await keyedHash('s3cret', 'email:maya@my.gcu.edu');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await keyedHash('s3cret', 'email:maya@my.gcu.edu')).toBe(a);
    expect(await keyedHash('other', 'email:maya@my.gcu.edu')).not.toBe(a);
    expect(a).not.toContain('maya');
  });
  it('the caller IP is the first forwarded hop', () => {
    const h = (v: string | null) => ({ get: () => v });
    expect(callerIp(h('203.0.113.9, 10.0.0.1'))).toBe('203.0.113.9');
    expect(callerIp(h(null))).toBe('');
  });
});

describe('the Instagram funnel steps a browser may report', () => {
  it('known steps from Instagram, with a browser id; the rest refused', () => {
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'visit', src: 'ig', device: 'phone', browser: 'Safari 17!' })).toEqual({ vid: 'abcdEFGH12', step: 'visit', src: 'ig', via: null, device: 'phone', browser: 'Safari' });
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'laptop', src: 'ig', via: 'email' })?.via).toBe('email');
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'visit', src: 'tiktok' })).toBeNull();
    expect(funnelRow({ vid: 'short', step: 'visit', src: 'ig' })).toBeNull();
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'paid', src: 'ig' })).toBeNull();
    for (const step of ['fold', 'email-focus', 'email-signup', 'google', 'apple', 'safari', 'preview', 'home-steps', 'home-screen']) expect(funnelRow({ vid: 'abcdEFGH12', step, src: 'ig' })?.step).toBe(step);
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'visit', src: 'ig', via: 'pigeon', device: 'fridge' })).toMatchObject({ via: null, device: null });
  });
  it('the email step only comes from laptop-link, when the email really went', () => {
    expect(funnelRow({ vid: 'abcdEFGH12', step: 'email', src: 'ig' })).toBeNull();
  });
});
