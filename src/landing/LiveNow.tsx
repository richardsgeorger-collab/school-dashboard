import { useRef, useState } from 'react';
import { IconCheck } from '../components/Icons';
import { Confetti } from '../joy/JoyHost';

/**
 * The hero's live Now (George, 2026-10-23: "show, don't tell"): the demo student's (Maya Torres) next three things,
 * in the app's own markup and tokens. Check the top one off and it plays the real gold burst and confetti, and the next
 * one slides up. Nothing is saved; at the end it says what Now says, and can go again.
 */
interface DemoItem {
  code: string;
  color: string;
  kind: string;
  title: string;
  why: string;
  pts: string;
  time: string;
  due: string;
}
const ITEMS: DemoItem[] = [
  { code: 'BIO-181L', color: '#3B7DD8', kind: 'Quiz', title: 'Lab 4 Prelab Quiz', why: 'Due before lab. Only Dr. Morales’s announcement says so.', pts: '10 pts', time: '~20m', due: 'due 11:59 PM' },
  { code: 'MAT-250', color: '#7A5AD0', kind: 'Quiz', title: 'Quiz 2: Derivatives', why: 'Moved to Thursday. Scientific calculator only.', pts: '40 pts', time: '~2h', due: 'due Thu' },
  { code: 'PSY-102', color: '#D9534F', kind: 'Discussion', title: 'Topic 3 DQ 1: Memory', why: 'Main post by Wednesday.', pts: '10 pts', time: '~25m', due: 'due Wed' },
];

export function LiveNow() {
  const [done, setDone] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const [confetti, setConfetti] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const left = ITEMS.length - done;
  const top = ITEMS[done] ?? null;
  const later = ITEMS.slice(done + 1);
  const circ = 113.1;

  const check = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (leaving || !top) return;
    const r = e.currentTarget.getBoundingClientRect();
    setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2, key: Date.now() });
    setConfetti(Date.now());
    setLeaving(true);
    timers.current.push(
      window.setTimeout(() => {
        setDone((d) => d + 1);
        setLeaving(false);
      }, 420),
      window.setTimeout(() => setBurst(null), 900),
      window.setTimeout(() => setConfetti(null), 2600),
    );
  };
  const again = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setDone(0);
    setLeaving(false);
    setConfetti(null);
  };

  return (
    <div className="lp-live" aria-label="Try Halo+: check off the top item">
      <div className="now lp-now">
        <header className="now-head">
          <div>
            <p className="eyebrow">Maya’s Tuesday</p>
            <h2 className="now-title">{left ? `${left} thing${left === 1 ? '' : 's'} need${left === 1 ? 's' : ''} you.` : 'You’re clear for today.'}</h2>
          </div>
          <div className="now-ring" aria-hidden>
            <svg className="ring" viewBox="0 0 44 44" width="48" height="48" data-done={left === 0}>
              <circle className="ring-track" cx="22" cy="22" r="18" />
              <circle className="ring-fill" cx="22" cy="22" r="18" strokeDasharray={circ} strokeDashoffset={circ * (left / ITEMS.length)} />
            </svg>
            <span className="now-ring-label">
              {done}/{ITEMS.length}
            </span>
          </div>
        </header>
        {top ? (
          <section key={top.title} className="hero lp-hero-card" data-state="work" data-leaving={leaving || undefined} style={{ '--course': top.color } as React.CSSProperties}>
            <div className="hero-top">
              <span className="hero-eyebrow">
                <span className="chip" style={{ '--course': top.color } as React.CSSProperties}>
                  <span className="dot" />
                  {top.code}
                </span>
                <span className="hero-kind">{top.kind}</span>
              </span>
            </div>
            <h3 className="hero-title">{top.title}</h3>
            <p className="hero-why">{top.why}</p>
            <p className="hero-meta">
              <span className="pill">{top.pts}</span>
              <span className="pill">{top.time}</span>
              <span className="pill">{top.due}</span>
            </p>
            <div className="hero-actions">
              <button type="button" className="btn primary lp-done" onClick={check}>
                <IconCheck /> Done
              </button>
              <span className="lp-try" aria-hidden>
                ← try it
              </span>
            </div>
          </section>
        ) : (
          <section className="hero lp-hero-card lp-clear" data-state="calm">
            <p className="hero-why">One thing at a time, and a little gold when it’s done.</p>
            <button type="button" className="btn" onClick={again}>
              Do it again
            </button>
          </section>
        )}
        {later.length > 0 && (
          <section className="then">
            <h3 className="section-title">Then</h3>
            <ul className="item-list">
              {later.map((i) => (
                <li key={i.title} className="lp-rise">
                  <span className="row" style={{ '--course': i.color } as React.CSSProperties}>
                    <span className="dot" aria-hidden />
                    <span className="row-body">
                      <span className="row-title">{i.title}</span>
                      <span className="row-meta">
                        {i.code} · {i.due.replace('due ', '')}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {burst && (
        <span className="joy-burst" style={{ left: burst.x, top: burst.y }} aria-hidden key={burst.key}>
          <i />
          <i />
        </span>
      )}
      {confetti !== null && <Confetti seed={confetti} />}
    </div>
  );
}
