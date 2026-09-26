import { useEffect } from 'react';
import { useAccount } from '../auth/AccountContext';
import { SignIn } from '../auth/SignIn';
import { IconHalo } from '../components/Icons';
import { useRoute } from '../router';

/**
 * Sign in on its own: for someone who has an account and a new device. No onboarding here; once the session lands
 * the app opens on Now, and the account's own data decides whether the first-run screens are still owed.
 */
export function Login() {
  const { auth } = useAccount();
  const { navigate } = useRoute();
  useEffect(() => {
    if (auth.session) navigate('now');
  }, [auth.session, navigate]);
  return (
    <div className="landing landing-login">
      <header className="landing-head">
        <a className="brand" href="#/" aria-label="Halo+">
          <span className="brand-mark" aria-hidden>
            <IconHalo />
          </span>
          <span className="brand-text">Halo+</span>
        </a>
        <nav className="landing-nav" aria-label="Account">
          <a className="btn" href="#/start">
            Sign up
          </a>
        </nav>
      </header>
      <section className="login-box" aria-label="Log in">
        <h1 className="landing-title">Log in.</h1>
        <p className="landing-lede">Your classes and work follow you between your phone and laptop. Email link or Google; no password.</p>
        <SignIn auth={auth} title="Log in" />
        <p className="hint">
          New here? <a href="#/start">Sign up</a> and connect Halo in two minutes.
        </p>
      </section>
    </div>
  );
}
