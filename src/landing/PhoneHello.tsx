import { useEffect, useRef, useState } from 'react';
import { funnel, laptopLink, laptopLinkUrl, visitorId } from '../analytics/funnel';
import { pendingSource, sourceIn } from '../auth/source';
import { IconHalo } from '../components/Icons';
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
    if (ig) funnel('visit');
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
        <button type="button" className="btn primary block lp-onphone-big" onClick={() => void share()}>
          {!canShare ? 'Copy link' : ios ? 'Text or AirDrop it to my laptop' : 'Send it to my laptop'}
        </button>
        {manual && (
          <label className="lp-onphone-manual">
            Copy this link:
            <input readOnly value={manual} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        <form className="lp-onphone-mail" onSubmit={(e) => void mail(e)}>
          <label className="lp-onphone-label" htmlFor="lp-onphone-email">
            Or get it by email
          </label>
          <input id="lp-onphone-email" className="input" type="email" inputMode="email" autoComplete="email" enterKeyHint="send" autoCapitalize="none" spellCheck={false} placeholder="you@my.gcu.edu" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn block lp-onphone-big" disabled={sending}>
            {sending ? 'Sending…' : 'Email me the link'}
          </button>
          {mailError ? (
            <p className="lp-onphone-error" role="alert">
              {mailError}
            </p>
          ) : (
            <p className="lp-onphone-note">Just this one email. No sign-up, no list.</p>
          )}
        </form>
        <p className="lp-onphone-app">
          <b>Your whole week, in your pocket.</b> Once it’s on your laptop, add the Halo+ app to your Home Screen and your classes, due dates and grades are on your {here} too.{' '}
          <a href="#/start" onClick={() => fromIg && funnel('app')}>
            Make your account now
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
