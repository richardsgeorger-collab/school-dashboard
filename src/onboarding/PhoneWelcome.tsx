import { useEffect, useState } from 'react';
import { funnel } from '../analytics/funnel';
import { useAccount } from '../auth/AccountContext';
import { cameFromIg } from '../auth/source';
import { enterPreview } from '../demo/DemoHost';
import type { OnboardingState } from '../domain/types';
import { shareLaptopLink } from '../landing/shareLaptop';
import { useStore } from '../storage/store';
import { isIOSDevice } from '../ui/device';
import { emailLaptopLink, SENT_KEY } from './PhoneConnect';
import { track } from './track';

/**
 * Signed up from the phone screen (Loop 301, George 2026-10-30: "skip the usual Halo+ onboarding completely"): one
 * screen, until the account's classes arrive. "You're in! 🎉 Check your email to get Halo+ on your laptop." The laptop
 * link is emailed at once (laptop-link, signed in), with the share sheet as a smaller backup and a small "Explore a
 * preview" (the made-up Maya Torres). No plan screens, no setup steps. Setup is recorded as "finish on my laptop"
 * (laptopAt), so the laptop, signing in, opens at Connect Halo as usual, and the phone never reopens setup.
 * Only on the device that signed up from the phone screen (PHONE_SIGNUP); a laptop sign-up keeps the usual onboarding.
 */
export const PHONE_SIGNUP = 'school-dashboard:phone-signup';
export const phoneSignup = (): boolean => {
  try {
    return localStorage.getItem(PHONE_SIGNUP) !== null;
  } catch {
    return false;
  }
};

export function PhoneWelcome() {
  const { data, actions } = useStore();
  const { auth } = useAccount();
  const ob = data.settings.onboarding as OnboardingState | undefined;
  const [mail, setMail] = useState<'sending' | 'sent' | 'failed'>(() => {
    try {
      return localStorage.getItem(SENT_KEY) || ob?.emailedAt ? 'sent' : 'sending';
    } catch {
      return 'sending';
    }
  });
  const [shared, setShared] = useState<'shared' | 'copied' | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const ig = cameFromIg();
  const email = auth.session?.user.email ?? null;

  // Setup is the laptop's job: recorded once, so nothing else opens on this phone.
  useEffect(() => {
    if (ob?.laptopAt) return;
    const now = new Date().toISOString();
    const base: OnboardingState = ob ?? { startedAt: now, step: 'halo', doneAt: null, skippedAt: null, tourDoneAt: null };
    actions.updateSettings({ onboarding: { ...base, laptopAt: now, screen: null, focus: null } });
    track('phone-welcome', 'enter');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ob?.laptopAt]);
  // The laptop link, emailed at once, once.
  const token = auth.session?.access_token;
  useEffect(() => {
    if (!token || mail === 'sent') return;
    void emailLaptopLink(token).then((ok) => {
      if (!ok) return setMail('failed');
      setMail('sent');
      try {
        localStorage.setItem(SENT_KEY, new Date().toISOString());
      } catch {
        /* storage off */
      }
      const cur = data.settings.onboarding as OnboardingState | undefined;
      if (cur && !cur.emailedAt) actions.updateSettings({ onboarding: { ...cur, emailedAt: new Date().toISOString() } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const share = async () => {
    const r = await shareLaptopLink(ig);
    if (r.done) setShared(r.done);
    if (r.manual) setManual(r.manual);
  };
  const shareLabel = typeof navigator.share === 'function' ? (isIOSDevice() ? 'Text or AirDrop it to my laptop' : 'Send it to my laptop') : 'Copy the link instead';
  return (
    <div className="phone-welcome" role="dialog" aria-modal="true" aria-label="You're in">
      <div className="phone-welcome-inner">
        <p className="phone-welcome-party" aria-hidden>
          🎉
        </p>
        <h1 className="phone-welcome-title">You’re in!</h1>
        <p className="phone-welcome-lede">Check your email to get Halo+ on your laptop.</p>
        <p className="phone-welcome-mail" role="status">
          {mail === 'sent' ? (
            <>
              We sent the link{email ? (
                <>
                  {' '}
                  to <b>{email}</b>
                </>
              ) : null}
              .
            </>
          ) : mail === 'failed' ? (
            <>We couldn’t send the email just now. Send yourself the link instead:</>
          ) : (
            <>Sending the link…</>
          )}
        </p>
        <button type="button" className="btn block phone-welcome-share" onClick={() => void share()}>
          {shared === 'copied' ? 'Copied! Paste it in a text to yourself' : shared === 'shared' ? 'Sent! Open it on your laptop' : shareLabel}
        </button>
        {manual && (
          <label className="lp-onphone-manual">
            Copy this link:
            <input readOnly value={manual} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        <button
          type="button"
          className="phone-welcome-preview"
          onClick={() => {
            if (ig) funnel('preview');
            enterPreview();
          }}
        >
          Explore a preview
        </button>
      </div>
    </div>
  );
}
