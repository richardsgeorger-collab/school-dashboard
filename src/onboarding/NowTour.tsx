import { useEffect, useState } from 'react';
import { useStore } from '../storage/store';
import type { OnboardingState } from './state';

/**
 * The tour after the payoff: four stops on the real thing, Now, Calendar, Inbox, Study. Optional: Skip ends it on any stop.
 * A stop whose element is not on screen is skipped, never pointed at thin air.
 */
export const STOPS = [
  { selector: '.now .hero, .now .empty', title: 'Now', text: 'The one thing to do next, with what it is worth and how long it takes. Tap the check when it is done.' },
  { selector: '.nav-link[href="#/calendar"]', title: 'Calendar', text: 'Every due date by day, with the parts your professors added in announcements.' },
  { selector: '.nav-link[href="#/inbox"]', title: 'Inbox', text: 'Every announcement, read for you. What each one asks is already on its assignment.' },
  { selector: '.nav-link[href="#/study"]', title: 'Study', text: 'Practice for any quiz or exam from your own slides, ask anything about your classes, and check your work before you turn it in.' },
];

/** The visible one of several matches: the top bar's link on a laptop, the bottom bar's on a phone. */
function visible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

export function NowTour() {
  const { data, actions } = useStore();
  const ob = data.settings.onboarding as OnboardingState | undefined;
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const show = !!ob?.doneAt && !ob.tourDoneAt && !ob.skippedAt;
  const stop = STOPS[i];
  const end = () => actions.updateSettings({ onboarding: { ...ob!, tourDoneAt: new Date().toISOString() } });

  useEffect(() => {
    if (!show) return;
    if (!stop) {
      end();
      return;
    }
    const el = visible(stop.selector);
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

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && end();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show || !stop || !rect) return null;
  const width = Math.min(300, window.innerWidth - 32);
  const left = Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 16));
  const below = rect.bottom + 12 + 150 < window.innerHeight;
  return (
    <>
      <div className="tour-mark" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden />
      <div className="tour-tip" role="dialog" aria-label={`Tour: ${stop.title}`} style={{ left, width, ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }) }}>
        <p>
          <b>{stop.title}.</b> {stop.text}
        </p>
        <div className="onboard-actions">
          <span className="mono muted">
            {i + 1} of {STOPS.length}
          </span>
          <span className="spacer" />
          <button type="button" className="btn small" onClick={end}>
            Skip
          </button>
          <button type="button" className="btn small primary" onClick={() => setI((k) => k + 1)}>
            {i + 1 < STOPS.length ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </>
  );
}
