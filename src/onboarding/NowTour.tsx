import { useEffect, useState } from 'react';
import { useStore } from '../storage/store';
import type { OnboardingState } from './state';

const STOPS = [
  { selector: '.now-status', text: 'One line on the day. Tap it any time for the full picture.' },
  { selector: '.hero, .now .empty', text: 'The one thing to do right now, with what you need to start it. Done, Start, or More.' },
  { selector: '.synced', text: 'When this last matched Halo. If it says sync, sync: the bookmark does the rest.' },
];

/** Three tooltips on Now, once, after onboarding. Each points at the real element; a missing one is skipped. */
export function NowTour() {
  const { data, actions } = useStore();
  const ob = data.settings.onboarding as OnboardingState | undefined;
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const show = !!ob?.doneAt && !ob.tourDoneAt && !ob.skippedAt;
  const stop = STOPS[i];

  useEffect(() => {
    if (!show) return;
    if (!stop) {
      actions.updateSettings({ onboarding: { ...ob!, tourDoneAt: new Date().toISOString() } });
      return;
    }
    const el = document.querySelector<HTMLElement>(stop.selector);
    if (!el) {
      setI((k) => k + 1);
      return;
    }
    el.scrollIntoView({ block: 'center' });
    const place = () => setRect(el.getBoundingClientRect());
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, i]);

  if (!show || !stop || !rect) return null;
  const width = Math.min(300, window.innerWidth - 32);
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
  const below = rect.bottom + 12 + 120 < window.innerHeight;
  return (
    <>
      <div className="tour-mark" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden />
      <div className="tour-tip" role="dialog" aria-label="Tour" style={{ left, width, ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }) }}>
        <p>{stop.text}</p>
        <div className="onboard-actions">
          <span className="mono muted">
            {i + 1} of {STOPS.length}
          </span>
          <span className="spacer" />
          <button type="button" className="btn small primary" onClick={() => setI((k) => k + 1)}>
            {i + 1 < STOPS.length ? 'Next' : 'Got it'}
          </button>
        </div>
      </div>
    </>
  );
}
