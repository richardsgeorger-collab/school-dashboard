import { useEffect, useState } from 'react';
import { CANONICAL_ORIGIN } from '../config/site';
import { canonicalHref, MOVED_KEY, newSiteLive, sendMove } from './move';

/**
 * On the old address only. Nothing shows until haloplus.app is really up. Then: a student with nothing saved here is
 * forwarded straight away; anyone else gets one screen and one button that brings the planner along (sign-in,
 * classes, slides, recordings and all). Until they tap it, the old address keeps working as it always has.
 */
export function LegacyMove({ hadData }: { hadData: boolean }) {
  const [live, setLive] = useState(false);
  const [state, setState] = useState<'idle' | 'moving' | 'done' | 'blocked' | 'failed'>('idle');
  useEffect(() => {
    let on = true;
    void newSiteLive().then((ok) => {
      if (!on || !ok) return;
      if (!hadData) {
        try {
          localStorage.setItem(MOVED_KEY, new Date().toISOString());
        } catch {
          /* forwards anyway */
        }
        window.location.replace(canonicalHref());
        return;
      }
      setLive(true);
    });
    return () => {
      on = false;
    };
  }, []);
  if (!live) return null;
  const move = async () => {
    setState('moving');
    const r = await sendMove();
    setState(r);
    if (r === 'done') setTimeout(() => window.location.replace(canonicalHref()), 1500);
  };
  const host = CANONICAL_ORIGIN.replace(/^https:\/\//, '');
  return (
    <div className="onboard legacy-move" role="dialog" aria-modal="true" aria-label="Halo+ has moved">
      <div className="onboard-inner">
        <section className="onboard-step">
          <p className="eyebrow">New address</p>
          <h1 className="onboard-title">Halo+ now lives at {host}.</h1>
          <p className="onboard-text">One tap brings everything with you: your classes, what you've checked off, your sign-in, slides and lecture notes. Your 😇 Sync Halo bookmark keeps working as it is. If you use notifications, turn them on once more there (You, Notifications).</p>
          <button type="button" className="btn primary block onboard-big" disabled={state === 'moving' || state === 'done'} onClick={() => void move()}>
            {state === 'moving' ? 'Moving…' : state === 'done' ? 'Moved ✓' : `Move my planner to ${host}`}
          </button>
          {state === 'done' && <p className="hint" role="status">Done. Opening {host}…</p>}
          {state === 'blocked' && (
            <p className="hint" role="alert">
              Your browser blocked the new tab. Allow pop-ups for this page and tap the button again.
            </p>
          )}
          {state === 'failed' && (
            <p className="hint" role="alert">
              That did not finish. Try once more; if it keeps failing, sign in at {host} and your account brings your classes back.
            </p>
          )}
          <p className="hint">
            <a href={canonicalHref()}>Go to {host} without moving anything</a>
          </p>
        </section>
      </div>
    </div>
  );
}
