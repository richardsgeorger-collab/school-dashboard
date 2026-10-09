import { useEffect, useState } from 'react';
import { queueMarketEmail } from '../auth/source';
import { isIPad } from '../ui/device';
import { track } from './track';

/**
 * Signed up on a phone at the market table (2026-10-08): the free week is running, and the setup that brings the
 * classes in (the extension) is a laptop job. One screen that says so, sends the link by email, and keeps the
 * phone or iPad way open for anyone without a laptop nearby.
 */
export function MarketHandoff({ email, onLater, onHere }: { email: string | null; onLater: () => void; onHere: () => void }) {
  const [sent, setSent] = useState<boolean | null>(null);
  useEffect(() => {
    track('market-handoff', 'enter');
    void queueMarketEmail().then(setSent);
  }, []);
  const here = isIPad() ? 'this iPad' : 'this phone';
  return (
    <section className="onboard-step market-handoff" aria-label="Finish setup on your laptop">
      <span className="connect-halo-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none">
          <path d="M19.73 9.93A8 8 0 1 1 14.07 4.27" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          <path d="M17.66 3.5v5.7M14.8 6.35h5.7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
      <p className="eyebrow">You're in. Max is free for 7 days.</p>
      <h1 className="onboard-title">Finish setup on your laptop.</h1>
      <p className="onboard-text">
        Open <b>haloplus.app</b> on your laptop and add the extension. It takes a minute, and your classes sync by themselves after that.
      </p>
      <p className="onboard-text market-mail" role="status">
        {sent === false ? 'We could not send the email just now; the link is haloplus.app.' : <>We emailed you the link{email ? <> at <b>{email}</b></> : null}.</>}
      </p>
      <div className="onboard-actions">
        <button type="button" className="btn primary block onboard-big" onClick={onLater}>
          Got it
        </button>
      </div>
      <button type="button" className="hero-inline market-here" onClick={onHere}>
        No laptop nearby? Set up on {here} instead
      </button>
    </section>
  );
}
