import { describe, expect, it } from 'vitest';
import { inAppBrowser, openInBrowserUrl } from './signin';

describe('in-app browsers and the way out to the real one (Loop 298)', () => {
  it('knows Instagram and Facebook, not Safari or Chrome', () => {
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.32.112')).toBe(true);
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14) … [FB_IAB/FB4A;FBAV/450.0.0.0;]')).toBe(true);
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe(false);
  });
  it('Safari on iPhone, the default browser on Android', () => {
    expect(openInBrowserUrl('https://haloplus.app/?src=ig&go=google', true)).toBe('x-safari-https://haloplus.app/?src=ig&go=google');
    expect(openInBrowserUrl('https://haloplus.app/?src=ig&go=google', false)).toBe('intent://haloplus.app/?src=ig&go=google#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fhaloplus.app%2F%3Fsrc%3Dig%26go%3Dgoogle;end');
  });
});
