import { useEffect, useState } from 'react';
import { bump } from '../analytics/usage';
import { useAccount } from '../auth/AccountContext';
import { SignIn } from '../auth/SignIn';
import { forgetSource, pendingSource } from '../auth/source';
import { funnel } from '../analytics/funnel';
import { IconHalo } from '../components/Icons';
import { track } from '../onboarding/track';
import { useRoute } from '../router';

/**
 * The welcome tab after a Chrome Web Store install (George, 2026-10-25, Loop 268): someone who found the extension in
 * the store and never saw haloplus.app. One step: make the free account. Then nothing else to do here: the first sync
 * happens on its own the next time they are on Halo (the extension syncs on a Halo visit), and the 7-day trial starts
 * with it, like everyone else's. Signed in already, it says so and points at Halo.
 */
export function Welcome() {
  const { auth } = useAccount();
  const signedIn = !!auth.session;
  // No-account mode (Loop 305): the extension works on Halo already; the account is offered second, not a gate.
  const { params } = useRoute();
  const open = params.get('mode') === 'open';
  const [showSignUp, setShowSignUp] = useState(params.get('signup') === '1');
  // Signed up on the phone with Google (the laptop page remembers it, Loop 298): one tap here.
  const [hint] = useState(() => {
    try {
      return localStorage.getItem('school-dashboard:acct-hint');
    } catch {
      return null;
    }
  });
  useEffect(() => {
    track('welcome', 'enter');
    // The welcome tab opens right after the Web Store install: for someone who came by the Instagram path (the laptop
    // page left the source on this site), that is the "installed" step of Admin's Instagram funnel (Loop 294).
    if (pendingSource() === 'ig') funnel('welcome', { via: 'direct' });
    // Every welcome tab, for Admin's install→account funnel (Loop 304): opened, then sign-up started.
    else if (!auth.session) funnel('welcome', { src: 'store' });
    // Already signed in on arrival: an account from the site that then installed from the store keeps its own source.
    if (auth.session) forgetSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    track('welcome', 'complete');
    bump('welcome:signed-in');
  }, [signedIn]);
  return (
    <div className="landing landing-login welcome">
      <header className="landing-head">
        <a className="brand" href="#/" aria-label="Halo+">
          <span className="brand-mark" aria-hidden>
            <IconHalo />
          </span>
          <span className="brand-text">Halo+</span>
        </a>
      </header>
      {signedIn ? (
        <section className="login-box welcome-done" aria-label="You're set">
          <h1 className="landing-title">You're set.</h1>
          <p className="landing-lede">Open Halo and your classes, due dates and grades come in on their own. This week shows right on Halo's home page.</p>
          <div className="welcome-actions">
            <a className="btn primary" href="https://halo.gcu.edu/" onClick={() => bump('welcome:open-halo')}>
              Open Halo
            </a>
            <a className="btn" href="#/now">
              Open Halo+
            </a>
          </div>
          <p className="hint">Nothing else to set up. Your first sync starts on its own the next time you're on Halo.</p>
        </section>
      ) : open && !showSignUp ? (
        <section className="login-box welcome-done" aria-label="You're set">
          <p className="eyebrow">The extension is installed</p>
          <h1 className="landing-title">You're set: open Halo.</h1>
          <p className="landing-lede">Halo+ is on your Halo pages now: what's next on every class, all your classes on one calendar, search, rubrics and more. Nothing to sign up for.</p>
          <div className="welcome-actions">
            <a className="btn primary" href="https://halo.gcu.edu/">
              Open Halo
            </a>
          </div>
          <p className="hint">
            Want Halo+ on your phone too, and your check-offs on every computer?{' '}
            <button type="button" className="hero-inline" onClick={() => setShowSignUp(true)}>
              Make a free account
            </button>
          </p>
          <p className="hint">Not affiliated with Grand Canyon University. Halo+ never asks for your GCU password.</p>
        </section>
      ) : (
        <section className="login-box" aria-label="Make your free account" onSubmitCapture={() => funnel('signup-start', { src: pendingSource() === 'ig' ? 'ig' : 'store' })}>
          <p className="eyebrow">{open ? 'Your free account' : 'The extension is installed'}</p>
          <h1 className="landing-title">{open ? 'Halo+ on your phone too.' : 'One step left.'}</h1>
          <p className="landing-lede">{open ? 'Make your free Halo+ account (not your GCU login). Everything you did on Halo moves into it, and your week shows in the Halo+ app on your phone and every computer.' : "Make your free Halo+ account (not your GCU login). The next time you're on Halo, your classes, due dates and grades come in on their own."}</p>
          {hint === 'google' && (
            <div className="welcome-one-tap">
              <p className="hint">You made your account on your phone with Google. Same account here:</p>
              <button type="button" className="lp-onphone-google" onClick={() => void auth.signInWithGoogle()}>
                <span>Continue with Google</span>
              </button>
              <p className="hint">Or use email below.</p>
            </div>
          )}
          <SignIn auth={auth} title="Make your free account" mode="signup" />
          <p className="hint">Not affiliated with Grand Canyon University. Halo+ never asks for your GCU password.</p>
        </section>
      )}
    </div>
  );
}
