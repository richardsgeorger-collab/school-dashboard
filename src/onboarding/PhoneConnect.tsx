import { useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { queueMarketEmail } from '../auth/source';
import type { OnboardingState } from '../domain/types';
import { useStore } from '../storage/store';
import { isIPad } from '../ui/device';
import { ImportSyllabus } from '../views/ImportSyllabus';
import { ExampleWeek } from './ExampleWeek';
import { track } from './track';

/**
 * Connect Halo on a phone or tablet (George, 2026-10-13). Five of five iPhone sign-ups in the week before got stuck in
 * the phone bookmark steps; the extension that syncs by itself is a laptop job. So a phone shows what Halo+ will look
 * like (an example week, labeled), one clear step (finish on a laptop, with the link by email, once), a syllabus to add
 * so the app is not empty, and the phone's own setup one quiet tap away for anyone without a laptop.
 *
 * As the setup step, "Finish on my laptop" is the only way past it; as the card on Now (after that), it stays until a
 * sync lands.
 */
export function PhoneConnect({ variant, onLaptop, onHere }: { variant: 'step' | 'card'; onLaptop?: () => void; onHere: () => void }) {
  const { data, actions } = useStore();
  const { auth } = useAccount();
  const ob = data.settings.onboarding as OnboardingState | undefined;
  const email = auth.session?.user.email ?? null;
  const [sending, setSending] = useState(false);
  const [mail, setMail] = useState<'sent' | 'failed' | null>(ob?.emailedAt ? 'sent' : null);
  const [syllabus, setSyllabus] = useState(false);
  const here = isIPad() ? 'this iPad' : 'this phone';
  const send = async () => {
    setSending(true);
    track('connect:email', 'complete');
    const ok = await queueMarketEmail();
    setSending(false);
    // Once per account: an email already on its way (asked for before) is still "sent".
    if (ok || ob?.emailedAt) {
      setMail('sent');
      if (ob && !ob.emailedAt) actions.updateSettings({ onboarding: { ...ob, emailedAt: new Date().toISOString() } });
    } else setMail('failed');
  };
  const Title = variant === 'step' ? 'h1' : 'h2';
  return (
    <section className={variant === 'step' ? 'onboard-step phone-connect' : 'card phone-connect phone-connect-card'} aria-label="Finish on your laptop">
      <ExampleWeek />
      <Title className="onboard-title phone-connect-title">Finish on your laptop in 2 minutes.</Title>
      <p className="onboard-text">Halo+ brings in your classes through a Chrome extension on a laptop. After that, everything shows up here on {here} too.</p>
      {mail === 'sent' ? (
        <p className="phone-connect-mail" role="status">
          Sent{email ? (
            <>
              {' '}
              to <b>{email}</b>
            </>
          ) : null}
          . Open it on your laptop.
        </p>
      ) : mail === 'failed' ? (
        <p className="phone-connect-mail" role="alert">
          We couldn't send the email just now. On your laptop, open <b>haloplus.app</b> and log in.
        </p>
      ) : null}
      <div className="onboard-actions phone-connect-actions">
        {mail !== 'sent' && auth.session && (
          <button type="button" className="btn primary block onboard-big" disabled={sending} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Email me the link'}
          </button>
        )}
        {variant === 'step' && onLaptop && (
          <button type="button" className={`btn block${mail === 'sent' || !auth.session ? ' primary onboard-big' : ''}`} onClick={onLaptop}>
            Finish on my laptop
          </button>
        )}
        <button type="button" className="btn block" onClick={() => setSyllabus(true)}>
          Add your syllabus
        </button>
      </div>
      <p className="hint phone-connect-here">
        No laptop?{' '}
        <button type="button" className="hero-inline" onClick={onHere}>
          Set up on {here} instead
        </button>
      </p>
      {syllabus && <ImportSyllabus onClose={() => setSyllabus(false)} />}
    </section>
  );
}
