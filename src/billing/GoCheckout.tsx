import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { IconHalo } from '../components/Icons';
import { PRICES } from '../config/tiers';
import { useRoute } from '../router';
import { checkoutFrom } from './client';

const AFTER_LOGIN = 'school-dashboard:after-login';

/** Where to go once signed in, when Max's checkout sent the student to sign in first. Read once. */
export function takeAfterLogin(): string | null {
  try {
    const v = sessionStorage.getItem(AFTER_LOGIN);
    sessionStorage.removeItem(AFTER_LOGIN);
    return v && v.startsWith('#/checkout') ? v : null;
  } catch {
    return null;
  }
}

/**
 * #/checkout?from=halo|popup&back=<Halo page> (2026-10-29): the extension's Max buttons open this, and it goes straight
 * on to Stripe's checkout for the signed-in account (Apple Pay and Google Pay at the top, the email filled in). From
 * Halo it comes back to that Halo page, where the extension shows what was locked. Signed out: sign in, then on.
 * Already on Max: says so, and goes back.
 */
export function GoCheckout() {
  const { auth, tier, planKnown } = useAccount();
  const { params, navigate } = useRoute();
  const from = params.get('from') === 'halo' ? 'halo' : 'popup';
  const back = params.get('back');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const signedOut = auth.configured && !auth.loading && !auth.session && !auth.knownUserId;
  useEffect(() => {
    if (!signedOut) return;
    try {
      sessionStorage.setItem(AFTER_LOGIN, window.location.hash);
    } catch {
      /* storage unavailable: signs in and lands on Now */
    }
    navigate('login');
  }, [signedOut, navigate]);
  const already = planKnown && tier === 'max';
  useEffect(() => {
    if (started.current || !auth.session || !planKnown || already) return;
    started.current = true;
    void checkoutFrom(from, back).then((r) => (r.ok ? window.location.replace(r.url) : setError(r.error)));
  }, [auth.session, planKnown, already, from, back]);
  const home = from === 'halo' && back && /^https:\/\/halo\.gcu\.edu\//.test(back) ? back : '#/now';
  return (
    <div className="landing landing-login go-checkout" aria-busy={!error && !already}>
      <div className="landing-login-card">
        <span className="brand-mark" aria-hidden>
          <IconHalo />
        </span>
        {already ? (
          <>
            <h1>You have Max</h1>
            <p>Everything is already on.</p>
            <a className="btn primary" href={home}>
              {from === 'halo' ? 'Back to Halo' : 'Open Halo+'}
            </a>
          </>
        ) : error ? (
          <>
            <h1>Checkout didn't open</h1>
            <p>{error}</p>
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </>
        ) : (
          <>
            <h1>Opening checkout…</h1>
            <p>Max · ${PRICES.max.month.toFixed(2)} a month. Cancel anytime.</p>
          </>
        )}
      </div>
    </div>
  );
}
