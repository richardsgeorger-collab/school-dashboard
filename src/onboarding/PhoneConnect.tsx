import { useEffect, useState } from 'react';
import { funnel, laptopLinkUrl, visitorId } from '../analytics/funnel';
import { useAccount } from '../auth/AccountContext';
import { cameFromIg, pendingSource } from '../auth/source';
import { enterPreview } from '../demo/DemoHost';
import type { OnboardingState } from '../domain/types';
import { shareLaptopLink } from '../landing/shareLaptop';
import { useStore } from '../storage/store';
import { isIOSDevice, isIPad } from '../ui/device';
import { ImportSyllabus } from '../views/ImportSyllabus';
import { HomeSteps } from './ComeBack';
import { ExampleWeek } from './ExampleWeek';
import { track } from './track';

/**
 * Connect Halo on a phone or tablet. Since Loop 299 (George, 2026-10-30: "after they sign up on the phone, it must feel
 * like a win, not an empty app") the setup step is "You're in! 🎉": one step left, on the laptop, and the laptop link is
 * emailed at once (laptop-link, signed in: the account's own address, once, "we'll send one reminder"), with the share
 * sheet as a backup. Meanwhile the student can explore a Preview (the made-up Maya Torres, labelled, until their own
 * classes come in) and put Halo+ on the Home Screen, ready for when their data arrives. The card on Now (after setup)
 * keeps saying one step is left, until a sync lands. Five of five iPhone sign-ups in Oct 2026 got stuck in the phone's
 * own bookmark steps, so those stay one quiet tap away for anyone without a laptop.
 */
const SENT_KEY = 'school-dashboard:laptop-emailed';
let inFlight: Promise<boolean> | null = null;

/** The laptop link to the account's own address, once per device (the server never sends one address twice). */
function emailLaptopLink(token: string): Promise<boolean> {
  if (inFlight) return inFlight;
  const ig = pendingSource() === 'ig' || cameFromIg();
  inFlight = fetch(laptopLinkUrl(), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ src: ig ? 'ig' : undefined, vid: ig ? visitorId() : undefined }) })
    .then((r) => r.json() as Promise<{ ok: boolean }>)
    .then((r) => !!r.ok)
    .catch(() => false);
  return inFlight;
}
const sentBefore = (): boolean => {
  try {
    return !!localStorage.getItem(SENT_KEY);
  } catch {
    return false;
  }
};

export function PhoneConnect({ variant, onLaptop, onHere }: { variant: 'step' | 'card'; onLaptop?: () => void; onHere: () => void }) {
  const { data, actions } = useStore();
  const { auth } = useAccount();
  const ob = data.settings.onboarding as OnboardingState | undefined;
  const email = auth.session?.user.email ?? null;
  const [mail, setMail] = useState<'sending' | 'sent' | 'failed' | null>(() => (sentBefore() || ob?.emailedAt ? 'sent' : null));
  const [shared, setShared] = useState<'shared' | 'copied' | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [home, setHome] = useState(false);
  const [syllabus, setSyllabus] = useState(false);
  const here = isIPad() ? 'this iPad' : 'this phone';
  const ig = cameFromIg();

  const sent = () => {
    setMail('sent');
    try {
      localStorage.setItem(SENT_KEY, new Date().toISOString());
    } catch {
      /* storage off */
    }
    window.dispatchEvent(new Event('haloplus:laptop-emailed'));
    if (ob && !ob.emailedAt) actions.updateSettings({ onboarding: { ...ob, emailedAt: new Date().toISOString() } });
  };
  // The step and the card can both be on the page: both say sent.
  useEffect(() => {
    const on = () => setMail('sent');
    window.addEventListener('haloplus:laptop-emailed', on);
    return () => window.removeEventListener('haloplus:laptop-emailed', on);
  }, []);
  // "You're in!": the laptop link goes to the account's own address at once, no typing, once.
  const token = auth.session?.access_token;
  useEffect(() => {
    if (variant !== 'step' || !token || mail === 'sent' || mail === 'sending') return;
    setMail('sending');
    track('connect:email', 'complete');
    try {
      localStorage.removeItem('school-dashboard:phone-start');
    } catch {
      /* storage off */
    }
    void emailLaptopLink(token).then((ok) => (ok ? sent() : setMail('failed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, variant]);

  const share = async () => {
    const r = await shareLaptopLink(ig);
    if (r.done) setShared(r.done);
    if (r.manual) setManual(r.manual);
  };
  const preview = () => {
    if (ig) funnel('preview');
    track('connect:preview', 'complete');
    enterPreview();
  };
  const homeSteps = () => {
    if (!home && ig) funnel('home-steps');
    setHome(!home);
  };
  const shareLabel = typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (isIOSDevice() ? 'Text or AirDrop it to my laptop' : 'Send it to my laptop') : 'Copy the link instead';

  const status =
    mail === 'sending' ? (
      <p className="phone-connect-mail" role="status">
        Emailing you the link…
      </p>
    ) : mail === 'sent' ? (
      <p className="phone-connect-mail phone-connect-sent" role="status">
        <b>We emailed you the link</b>
        {email ? (
          <>
            {' '}
            (to <b>{email}</b>)
          </>
        ) : null}
        . Open it on your laptop.
      </p>
    ) : mail === 'failed' ? (
      <p className="phone-connect-mail" role="alert">
        We couldn't send the email just now. On your laptop, open <b>haloplus.app</b> and sign in, or send yourself the link below.
      </p>
    ) : null;

  if (variant === 'card')
    return (
      <section className="card phone-connect phone-connect-card" aria-label="One step left, on your laptop">
        <ExampleWeek />
        <h2 className="onboard-title phone-connect-title">One step left, on your laptop.</h2>
        <p className="onboard-text">Halo+ brings in your classes through Chrome on a laptop. After that, everything shows up here on {here} too.</p>
        {status}
        <div className="onboard-actions phone-connect-actions">
          <button type="button" className="btn block" onClick={() => void share()}>
            {shared === 'copied' ? 'Copied! Paste it to yourself' : shared === 'shared' ? 'Sent!' : shareLabel}
          </button>
          <button type="button" className="btn block" onClick={preview}>
            Explore the preview
          </button>
        </div>
        <p className="hint phone-connect-here">
          No laptop?{' '}
          <button type="button" className="hero-inline" onClick={onHere}>
            Set up on {here} instead
          </button>
        </p>
      </section>
    );

  return (
    <section className="onboard-step phone-connect phone-in" aria-label="You're in">
      <p className="phone-in-party" aria-hidden>
        🎉
      </p>
      <h1 className="onboard-title phone-connect-title">You’re in!</h1>
      <p className="onboard-text phone-in-lede">
        <b>One step left, on your laptop.</b> Halo+ brings in your classes from Halo there, in about 2 minutes. Then everything shows up here on {here} too.
      </p>
      {status}
      <button type="button" className="btn block phone-in-share" onClick={() => void share()}>
        {shared === 'copied' ? 'Copied! Paste it in a text or note to yourself' : shared === 'shared' ? 'Sent! Open it on your laptop' : shareLabel}
      </button>
      {manual && (
        <label className="lp-onphone-manual">
          Copy this link:
          <input readOnly value={manual} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <h2 className="phone-in-sub">While you wait</h2>
      <div className="phone-in-tiles">
        <button type="button" className="phone-in-tile" onClick={preview}>
          <b>Explore the preview</b>
          <span>See what your Now, Calendar and Classes will look like, with a made-up student.</span>
        </button>
        <button type="button" className="phone-in-tile" aria-expanded={home} onClick={homeSteps}>
          <b>Add Halo+ to your Home Screen</b>
          <span>It opens like an app, ready for when your classes arrive.</span>
        </button>
      </div>
      {home && (
        <div className="phone-in-home">
          <HomeSteps />
          <p className="hint">Then open Halo+ from your Home Screen and sign in once (the Home Screen app keeps its own sign-in).</p>
        </div>
      )}
      {onLaptop && (
        <button type="button" className="btn primary block onboard-big phone-in-done" onClick={onLaptop}>
          Got it
        </button>
      )}
      <p className="hint phone-connect-here">
        No laptop?{' '}
        <button type="button" className="hero-inline" onClick={onHere}>
          Set up on {here} instead
        </button>{' '}
        ·{' '}
        <button type="button" className="hero-inline" onClick={() => setSyllabus(true)}>
          Add your syllabus
        </button>
      </p>
      {syllabus && <ImportSyllabus onClose={() => setSyllabus(false)} />}
    </section>
  );
}
