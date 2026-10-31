import { useEffect, useRef, useState } from 'react';
import { funnel, laptopLink, laptopLinkUrl, visitorId } from '../analytics/funnel';
import { pendingSource, sourceIn } from '../auth/source';
import { supabase } from '../auth/client';
import { IconHalo } from '../components/Icons';
import { APPLE_SIGNIN, inAppBrowser, openInBrowserUrl } from '../config/signin';
import { isIOSDevice, isIPad } from '../ui/device';

/**
 * The phone screen (Loop 294, George 2026-10-30): most Instagram visitors open haloplus.app on a phone, where the
 * Chrome extension cannot go. A signed-out phone (or tablet) visitor is greeted at the top of the landing page with the
 * easiest way to get Halo+ onto their laptop: the share sheet (Text or AirDrop; "Copy link" where sharing is not
 * supported, as in some in-app browsers), or one email with the laptop page. Then the calm reel, then the landing as
 * always. Desktop visitors and anyone signed in never see it.
 *
 * Pre-rendered with the landing (nothing touches window while rendering): index.html's first script marks a phone
 * (html.hp-phone) before first paint, so the screen is there at once on cell data; this component only wires it up.
 * Phone-only Halo sync is not good enough to offer as a start (Loop 245: 5 of 7 phone sign-ups got stuck), so the app
 * is a line under the two buttons, not a third.
 */
type Done = 'shared' | 'copied' | 'emailed' | 'already' | null;
const BACK = /^sb-[a-z0-9]+-auth-token$/;

/** Signed in, or on a laptop: no phone screen (the same test as index.html's first script, plus a session). */
export function phoneVisitor(): boolean {
  try {
    if (!document.documentElement.classList.contains('hp-phone')) return false;
    for (let i = 0; i < localStorage.length; i++) if (BACK.test(localStorage.key(i) ?? '')) return false;
    return true;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch {
    return false;
  }
}

export function PhoneHello() {
  const [on, setOn] = useState(false);
  const [canShare, setCanShare] = useState(true);
  const [fromIg, setFromIg] = useState(false);
  const [here, setHere] = useState<'phone' | 'iPad'>('phone');
  const [ios, setIos] = useState(true);
  const [done, setDone] = useState<Done>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const [inApp, setInApp] = useState(false);
  const [oauth, setOauth] = useState<'google' | 'apple' | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    const phone = phoneVisitor();
    if (!phone) {
      document.documentElement.classList.remove('hp-phone');
      return;
    }
    setOn(true);
    setHere(isIPad() ? 'iPad' : 'phone');
    setIos(isIOSDevice());
    setCanShare(typeof navigator.share === 'function');
    const ig = (sourceIn(window.location.hash, window.location.search) ?? pendingSource()) === 'ig';
    setFromIg(ig);
    setInApp(inAppBrowser());
    if (ig) funnel('visit');
    // Is the main button on screen without scrolling (George: "find where people stop")?
    const r = mainRef.current?.getBoundingClientRect();
    if (ig && r && window.scrollY === 0 && r.bottom <= window.innerHeight) funnel('fold');
    // Arrived from "Open in Safari" in Instagram's browser: carry on with Google straight away.
    if (/[?&]go=google(&|$)/.test(window.location.search) && !inAppBrowser()) void startWith('google', ig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Desktop visitors from Instagram count as visits too (they need no phone screen).
  useEffect(() => {
    if (phoneVisitor()) return;
    if (sourceIn(window.location.hash, window.location.search) === 'ig') funnel('visit');
  }, []);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const copy = async (url: string) => {
    if (await copyText(url)) {
      setDone('copied');
      if (fromIg) funnel('copy', { via: 'copy' });
    } else setManual(url);
  };
  const share = async () => {
    const url = laptopLink(canShare ? 'share' : 'copy', fromIg);
    if (!canShare) return copy(url);
    try {
      await navigator.share({ title: 'Halo+ for my laptop', text: 'Open this on your laptop to add Halo+ to Chrome:', url });
      setDone('shared');
      if (fromIg) funnel('share', { via: 'share' });
    } catch (e) {
      // Closing the share sheet is not a failure; a browser that will not share (some in-app browsers) copies instead.
      if ((e as Error)?.name === 'AbortError') return;
      setCanShare(false);
      await copy(laptopLink('copy', fromIg));
    }
  };
  /**
   * Start on the phone with Google or Apple: the account is made, the laptop link is emailed to its address at once
   * (PhoneConnect, after the sign-in comes back), and the laptop's welcome tab offers the same one tap.
   */
  const startWith = async (provider: 'google' | 'apple', ig = fromIg) => {
    setOauthError(null);
    if (ig) funnel(provider);
    const c = supabase();
    if (!c) return setOauthError('Sign-in isn’t working right now. Email yourself the link instead.');
    setOauth(provider);
    try {
      localStorage.setItem('school-dashboard:phone-start', provider);
    } catch {
      /* storage off: the laptop email can still be asked for in the app */
    }
    const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` } });
    if (error) {
      setOauth(null);
      setOauthError(`We couldn’t open ${provider === 'apple' ? 'Apple' : 'Google'} just now. Email yourself the link instead.`);
    }
  };
  const [safariHref, setSafariHref] = useState('');
  useEffect(() => {
    if (!inApp) return;
    const here = new URL(window.location.href);
    here.searchParams.set('go', 'google');
    if (fromIg) here.searchParams.set('src', 'ig');
    here.hash = '';
    setSafariHref(openInBrowserUrl(here.toString(), ios));
  }, [inApp, fromIg, ios]);
  const mail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMailError(null);
    const url = laptopLinkUrl();
    if (!url) return setMailError('Email isn’t working right now. Use the button above instead.');
    setSending(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, vid: fromIg ? visitorId() : undefined, src: fromIg ? 'ig' : undefined }) });
      const r = (await res.json()) as { ok: boolean; already?: boolean; why?: string };
      if (r.ok) setDone(r.already ? 'already' : 'emailed');
      else if (r.why === 'email') setMailError('That email doesn’t look right. Check it and try again?');
      else if (r.why === 'limit' || r.why === 'busy') setMailError('Too many emails from here today. Use the button above instead.');
      else setMailError('We couldn’t send it just now. Use the button above instead.');
    } catch {
      setMailError('We couldn’t send it just now. Use the button above instead.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="lp-onphone" aria-label="Get Halo+ on your laptop">
      <div className="lp-onphone-card">
        <span className="lp-onphone-mark" aria-hidden>
          <IconHalo />
        </span>
        <h2 className="lp-onphone-title">Hey! Looks like you’re on your {here} 👋</h2>
        <p className="lp-onphone-lede">Halo+ lives in Chrome on your laptop. Here’s the easiest way to get it there:</p>
        {done ? (
          <p className="lp-onphone-done" role="status" tabIndex={-1} ref={doneRef}>
            {done === 'copied' ? (
              <>
                <b>Copied!</b> Paste it in a text or note to yourself, then open it on your laptop. You’re 2 minutes away.
              </>
            ) : done === 'already' ? (
              <>
                <b>Already sent!</b> Check that inbox (and spam) on your laptop. You’re 2 minutes away.
              </>
            ) : (
              <>
                <b>Sent!</b> Open it on your laptop and you’re 2 minutes away.
              </>
            )}
          </p>
        ) : null}
        {/* One tap: the phone offers the student's own address above the keyboard (type email, autocomplete email). */}
        <form className="lp-onphone-mail" onSubmit={(e) => void mail(e)} autoComplete="on">
          <label className="visually-hidden" htmlFor="lp-onphone-email">
            Your email
          </label>
          <input id="lp-onphone-email" name="email" className="input" type="email" inputMode="email" autoComplete="email" enterKeyHint="send" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Your email" required value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => fromIg && funnel('email-focus')} />
          <button type="submit" ref={mainRef} className="btn primary block lp-onphone-big" disabled={sending}>
            {sending ? 'Sending…' : 'Email me the link'}
          </button>
          {mailError ? (
            <p className="lp-onphone-error" role="alert">
              {mailError}
            </p>
          ) : (
            <p className="lp-onphone-why">
              <b>Takes 10 seconds.</b> Free, made by a GCU student. Just this one email.
            </p>
          )}
        </form>
        <button type="button" className="btn block lp-onphone-second" onClick={() => void share()}>
          {!canShare ? 'Copy the link instead' : ios ? 'Text or AirDrop it to my laptop' : 'Send it to my laptop'}
        </button>
        {manual && (
          <label className="lp-onphone-manual">
            Copy this link:
            <input readOnly value={manual} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        <div className="lp-onphone-or" role="separator">
          <span>or start on your {here}</span>
        </div>
        {inApp ? (
          <>
            {/* Google refuses to sign in inside Instagram's browser: the same page in Safari, then one tap. */}
            <a className="lp-onphone-google" href={safariHref || undefined} onClick={() => fromIg && funnel('safari')}>
              <GoogleG />
              <span>Open in {ios ? 'Safari' : 'your browser'} to continue with Google</span>
            </a>
            <p className="lp-onphone-hint">Google sign-in doesn’t work inside Instagram. Or tap ••• at the top, then Open in {ios ? 'external browser' : 'browser'}.</p>
          </>
        ) : (
          <button type="button" className="lp-onphone-google" onClick={() => void startWith('google')} disabled={!!oauth}>
            <GoogleG />
            <span>{oauth === 'google' ? 'Opening Google…' : 'Continue with Google'}</span>
          </button>
        )}
        {APPLE_SIGNIN && (
          <button type="button" className="lp-onphone-apple" onClick={() => void startWith('apple')} disabled={!!oauth}>
            <AppleLogo />
            <span>{oauth === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}</span>
          </button>
        )}
        {oauthError && (
          <p className="lp-onphone-error" role="alert">
            {oauthError}
          </p>
        )}
        <p className="lp-onphone-app">
          <b>Your whole week, in your pocket.</b> Once it’s on your laptop, add the Halo+ app to your Home Screen and your classes, due dates and grades are on your {here} too.{' '}
          <a href="#/start" onClick={() => fromIg && funnel('app')}>
            Make your account with email
          </a>
        </p>
        <p className="lp-onphone-signin">
          Already have it on your laptop? <a href="#/login">Sign in</a>
        </p>
      </div>
      <div className="lp-onphone-reel">{on && <video src={`${import.meta.env.BASE_URL}reel/halo-plus-calm.mp4`} poster={`${import.meta.env.BASE_URL}reel/halo-plus-calm.jpg`} muted autoPlay loop playsInline preload="metadata" aria-label="Halo+ on Halo: what’s next on every class, one calendar, search, and checking things off" />}</div>
    </section>
  );
}

/** Google's "G", in its own colours (Google's sign-in branding rules). */
const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

/** Apple's logo, white on the black button (Apple's Sign in with Apple rules). */
const AppleLogo = () => (
  <svg width="18" height="20" viewBox="0 0 17 20" aria-hidden="true">
    <path fill="#fff" d="M14.04 10.62c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.33-3.55zM11.84 4.16c.61-.74 1.02-1.76.91-2.79-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.59-1.23z" />
  </svg>
);
