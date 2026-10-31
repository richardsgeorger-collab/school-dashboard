/**
 * Sign in with Apple (Loop 298): the button is built and follows Apple's rules, but it shows only once Apple is set up
 * as a sign-in provider in Supabase (Authentication → Providers → Apple: an Apple Developer account, a Services ID,
 * haloplus.app as its domain and Supabase's callback as its return URL, and a key). Until then it stays off so no
 * student taps a button that fails. Turn it on here when that is done.
 */
export const APPLE_SIGNIN = false;

/** Instagram's, Facebook's and other apps' own browsers (Google refuses to sign in inside them). */
export const inAppBrowser = (ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean => /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|Snapchat|TikTok|musical_ly|BytedanceWebview/i.test(ua);

/**
 * The same page in the phone's real browser, to continue with Google there: Safari on an iPhone (the x-safari-https
 * link, iOS 17 and later), Chrome on Android (an intent link, falling back to the default browser).
 */
export function openInBrowserUrl(href: string, ios: boolean): string {
  const u = new URL(href);
  const scheme = u.protocol.replace(':', '');
  // Android: Chrome by name, and if Chrome is not there, the same page in whatever opens links.
  return ios ? `x-safari-${scheme}://${u.host}${u.pathname}${u.search}${u.hash}` : `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
