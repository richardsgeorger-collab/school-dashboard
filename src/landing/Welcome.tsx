import { useEffect } from 'react';
import { bump } from '../analytics/usage';
import { useAccount } from '../auth/AccountContext';
import { SignIn } from '../auth/SignIn';
import { forgetSource } from '../auth/source';
import { IconHalo } from '../components/Icons';
import { track } from '../onboarding/track';

/**
 * The welcome tab after a Chrome Web Store install (George, 2026-10-25, Loop 268): someone who found the extension in
 * the store and never saw haloplus.app. One step: make the free account. Then nothing else to do here: the first sync
 * happens on its own the next time they are on Halo (the extension syncs on a Halo visit), and the 7-day trial starts
 * with it, like everyone else's. Signed in already, it says so and points at Halo.
 */
export function Welcome() {
  const { auth } = useAccount();
  const signedIn = !!auth.session;
  useEffect(() => {
    track('welcome', 'enter');
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
          <p className="hint">Your free week of everything starts with your first sync. No card.</p>
        </section>
      ) : (
        <section className="login-box" aria-label="Make your free account">
          <p className="eyebrow">The extension is installed</p>
          <h1 className="landing-title">One step left.</h1>
          <p className="landing-lede">Make your free Halo+ account. The next time you're on Halo, your classes come in on their own.</p>
          <SignIn auth={auth} title="Make your free account" mode="signup" />
        </section>
      )}
    </div>
  );
}
