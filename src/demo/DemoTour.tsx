import { useEffect, useState } from 'react';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { leaveDemo, TOUR_KEY } from './DemoHost';
import { DEMO_STUDENT } from './demo';

interface Step {
  /** Where the moment is. */
  hash: string;
  /** The element to ring, when it is on screen. */
  target?: string;
  title: string;
  text: string;
  /** The presenter does this; the tour waits on it. */
  ask?: 'done';
}

/** The wow moments, in order (George, 2026-10-08): what a visitor at the market should see in ninety seconds. */
export const STEPS: Step[] = [
  { hash: '#/now', target: '[data-tour="reqs"]', title: 'Found in an announcement', text: "Dr. Raman's post said: main response by Wednesday, 250 words, APA, two replies by Sunday. Halo+ read it and put all three on the assignment itself." },
  { hash: '#/now', target: '[data-tour="done"]', title: 'Check it off', text: 'Tap Done on the card: confetti, the points, and how far the class is now.', ask: 'done' },
  { hash: '#/classes', target: '[data-tour="class-PSY-102"]', title: 'Every class, how far along', text: 'The grade straight from Halo, what is next, and the share of the class already done.' },
  { hash: '#/classes', target: '[data-tour="cook-MAT-250"]', title: 'The Cooked meter', text: 'Calculus is red: a quiz, two problem sets and a project inside seven days, about 6½ hours of work. Green under 3 hours, red from 6.' },
  { hash: '#/ask?q=How%20many%20words%20does%20the%20Case%20Study%20Analysis%20need%3F', title: 'Ask anything', text: "It answers from this student's own announcements and assignments: Dr. Raman's post said 1,200 to 1,500 words, APA, three sources." },
];

const read = (): number | null => {
  try {
    const v = sessionStorage.getItem(TOUR_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};

/**
 * "Play the wow moments": a card at the bottom of the screen that walks the presenter through the five moments,
 * moving between screens and ringing the thing to look at. It survives the route changes (sessionStorage) and goes
 * with the chip's ×. The chip in the top bar also leaves the demo.
 */
export function DemoTour() {
  const { navigate } = useRoute();
  const { data } = useStore();
  const [step, setStep] = useState<number | null>(read);
  const current = step === null ? null : STEPS[step];
  const go = (n: number | null) => {
    try {
      if (n === null) sessionStorage.removeItem(TOUR_KEY);
      else sessionStorage.setItem(TOUR_KEY, String(n));
    } catch {
      /* storage unavailable */
    }
    setStep(n);
    if (n !== null) window.location.hash = STEPS[n].hash;
  };
  // Ring the target once it is on screen.
  useEffect(() => {
    if (!current?.target) return;
    let el: Element | null = null;
    let tries = 0;
    const find = () => {
      el = document.querySelector(current.target!);
      if (el) {
        el.classList.add('demo-ring');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if (tries++ < 30) window.setTimeout(find, 200);
    };
    find();
    return () => el?.classList.remove('demo-ring');
  }, [current]);
  // The check-off step moves on by itself once the discussion is done.
  const dqDone = data.items.find((i) => i.title === 'Topic 3 DQ 1: Memory')?.status === 'done';
  useEffect(() => {
    if (current?.ask === 'done' && dqDone) {
      const t = window.setTimeout(() => go(2), 2600);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, dqDone]);
  void navigate;
  return (
    <>
      <div className="demo-chip" role="status">
        <span className="demo-chip-dot" aria-hidden />
        <b>Demo</b> · {DEMO_STUDENT}
        <button type="button" className="demo-chip-btn" onClick={() => go(0)}>
          ▶ Play the wow moments
        </button>
        <button type="button" className="demo-chip-x" onClick={leaveDemo} aria-label="Leave the demo" title="Leave the demo">
          ×
        </button>
      </div>
      {current && step !== null && (
        <aside className="demo-tour" role="dialog" aria-label="Wow moments">
          <p className="demo-tour-count mono">
            {step + 1} of {STEPS.length}
          </p>
          <h2 className="demo-tour-title">{current.title}</h2>
          <p className="demo-tour-text">{current.text}</p>
          <div className="demo-tour-actions">
            <button type="button" className="btn small" onClick={() => go(step === 0 ? null : step - 1)}>
              {step === 0 ? 'Close' : 'Back'}
            </button>
            {step + 1 < STEPS.length ? (
              <button type="button" className="btn small primary" onClick={() => go(step + 1)}>
                {current.ask ? 'Skip' : 'Next'}
              </button>
            ) : (
              <button type="button" className="btn small primary" onClick={() => go(null)}>
                Done
              </button>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
