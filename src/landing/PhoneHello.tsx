import { useEffect, useRef, useState } from 'react';
import { funnel } from '../analytics/funnel';
import { authMessage } from '../auth/useAuth';
import { supabase } from '../auth/client';
import { pendingSource, sourceIn } from '../auth/source';
import { APPLE_SIGNIN, inAppBrowser, openInBrowserUrl } from '../config/signin';
import { isIOSDevice } from '../ui/device';

/**
 * The phone screen (Loop 299, George 2026-10-30: "a simple sign-up, not 'looks like you're on your phone'"). A
 * signed-out phone or tablet visitor (html.hp-phone, set by index.html's first script before first paint) is asked one
 * thing: make your account. The hook and one line, Continue with Google first (inside Instagram's browser, where Google
 * refuses to sign in, the same page opens in Safari and carries on), then "or sign up with email" (one field; the
 * password appears after it), a short true line (and the real student count, live and rounded down), and Sign in.
 * Then the calm reel and the landing as always. After a sign-up the app's phone step takes over ("You're in!",
 * onboarding/PhoneConnect.tsx): the laptop link is emailed at once. Desktop visitors and anyone signed in never see this.
 */
const BACK = /^sb-[a-z0-9]+-auth-token$/;
const START = 'school-dashboard:phone-start';

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

/** The honest count for the trust line: real students only, rounded down by the server; null until it is worth saying. */
async function studentCount(): Promise<number | null> {
  try {
    const c = supabase();
    if (!c) return null;
    const { data, error } = await c.rpc('public_student_count');
    return !error && typeof data === 'number' && data >= 20 ? data : null;
  } catch {
    return null;
  }
}

const remember = (how: string) => {
  try {
    localStorage.setItem(START, how);
  } catch {
    /* storage off: the laptop email can still be asked for in the app */
  }
};

/** The app's own sign-up (useAuth's), without its context: this screen is also pre-rendered on its own. */
async function signUp(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = supabase();
  if (!c) return { ok: false, error: 'Sign-up isn’t working right now. Try again in a minute.' };
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` } });
  if (error) return { ok: false, error: authMessage(error.message) };
  if (!data.session && (data.user?.identities?.length ?? 0) === 0) return { ok: false, error: authMessage('already registered') };
  if (!data.session) return { ok: false, error: 'Your account was made, but it needs confirming. Sign in, or contact George.' };
  return { ok: true };
}

export function PhoneHello() {
  const [on, setOn] = useState(false);
  const [fromIg, setFromIg] = useState(false);
  const [ios, setIos] = useState(true);
  const [inApp, setInApp] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [safariHref, setSafariHref] = useState('');
  const [oauth, setOauth] = useState<'google' | 'apple' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const mainRef = useRef<HTMLElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ig = (sourceIn(window.location.hash, window.location.search) ?? pendingSource()) === 'ig';
    if (!phoneVisitor()) {
      document.documentElement.classList.remove('hp-phone');
      // Desktop visitors from Instagram count as visits too (they need no phone screen).
      if (sourceIn(window.location.hash, window.location.search) === 'ig') funnel('visit');
      return;
    }
    setOn(true);
    setIos(isIOSDevice());
    setFromIg(ig);
    const app = inAppBrowser();
    setInApp(app);
    if (app) {
      const here = new URL(window.location.href);
      here.searchParams.set('go', 'google');
      if (ig) here.searchParams.set('src', 'ig');
      here.hash = '';
      setSafariHref(openInBrowserUrl(here.toString(), isIOSDevice()));
    }
    void studentCount().then(setCount);
    if (ig) funnel('visit');
    // Is the main button on screen without scrolling (George: "find where people stop")?
    const r = mainRef.current?.getBoundingClientRect();
    if (ig && r && window.scrollY === 0 && r.bottom <= window.innerHeight) funnel('fold');
    // Arrived from "Open in Safari" in Instagram's browser: carry on with Google straight away.
    if (/[?&]go=google(&|$)/.test(window.location.search) && !app) void startWith('google', ig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (step === 'password') pwRef.current?.focus();
  }, [step]);

  /** Google or Apple: the account is made there, and the app's phone step emails the laptop link when it comes back. */
  const startWith = async (provider: 'google' | 'apple', ig = fromIg) => {
    setError(null);
    if (ig) funnel(provider);
    const c = supabase();
    if (!c) return setError('Sign-up isn’t working right now. Try again in a minute.');
    setOauth(provider);
    remember(provider);
    const { error: e } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` } });
    if (e) {
      setOauth(null);
      setError(`We couldn’t open ${provider === 'apple' ? 'Apple' : 'Google'} just now. Sign up with email instead?`);
    }
  };
  /** Email: the address, then a password (the phone offers a strong one), then in. */
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (step === 'email') {
      if (fromIg) funnel('email-signup');
      setStep('password');
      return;
    }
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    remember('email');
    const r = await signUp(email.trim(), password);
    setBusy(false);
    if (!r.ok) {
      try {
        localStorage.removeItem(START);
      } catch {
        /* storage off */
      }
      setError(/already/i.test(r.error) ? <>You already have an account with that email. <a href="#/login">Sign in</a></> : r.error);
    }
    // Signed in: the app takes over (the "You're in!" step).
  };

  return (
    <section className="lp-onphone" aria-label="Make your free Halo+ account">
      <div className="lp-onphone-card">
        <h2 className="lp-onphone-title">
          The Halo <span className="lp-onphone-gold">upgrade</span> every GCU student needs.
        </h2>
        <p className="lp-onphone-lede">What’s due next on every class, all your classes on one calendar, and search, right on Halo.</p>
        {inApp ? (
          <>
            {/* Google refuses to sign in inside Instagram's browser: the same page in Safari, then one tap. */}
            <a className="lp-onphone-google lp-onphone-main" ref={mainRef as React.Ref<HTMLAnchorElement>} href={safariHref || undefined} onClick={() => fromIg && funnel('safari')}>
              <GoogleG />
              <span>Continue with Google</span>
            </a>
            <p className="lp-onphone-opens">Opens {ios ? 'Safari' : 'your browser'}</p>
          </>
        ) : (
          <button type="button" ref={mainRef as React.Ref<HTMLButtonElement>} className="lp-onphone-google lp-onphone-main" onClick={() => void startWith('google')} disabled={!!oauth}>
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
        <div className="lp-onphone-or" role="separator">
          <span>or sign up with email</span>
        </div>
        <form className="lp-onphone-mail" onSubmit={(e) => void submit(e)} autoComplete="on">
          <label className="visually-hidden" htmlFor="lp-onphone-email">
            Your email
          </label>
          <input id="lp-onphone-email" name="email" className="input" type="email" inputMode="email" autoComplete="email" enterKeyHint={step === 'email' ? 'next' : 'done'} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Your email" required value={email} readOnly={step === 'password'} onChange={(e) => setEmail(e.target.value)} onFocus={() => fromIg && funnel('email-focus')} />
          {step === 'password' && (
            <>
              <label className="visually-hidden" htmlFor="lp-onphone-password">
                Make a password
              </label>
              <input id="lp-onphone-password" ref={pwRef} name="new-password" className="input" type="password" autoComplete="new-password" enterKeyHint="go" placeholder="Make a password (8+ characters)" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          )}
          <button type="submit" className="btn block lp-onphone-big lp-onphone-email-btn" disabled={busy}>
            {busy ? 'Making your account…' : step === 'email' ? 'Sign up with email' : 'Create my account'}
          </button>
          {step === 'password' && (
            <button type="button" className="lp-onphone-link" onClick={() => setStep('email')}>
              Change email
            </button>
          )}
        </form>
        {error ? (
          <p className="lp-onphone-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="lp-onphone-why">
          <b>Takes 10 seconds.</b> Free. Made by a GCU student.{count ? ` Join ${count}+ GCU students.` : ''}
        </p>
        <p className="lp-onphone-signin">
          Already have an account? <a href="#/login">Sign in</a>
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
