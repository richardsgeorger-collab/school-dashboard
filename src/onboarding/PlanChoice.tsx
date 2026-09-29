import { useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { startTrial } from '../auth/trial';
import { IconAsk, IconColour, IconInbox, IconNow, IconStudy, IconSync } from '../components/Icons';
import { TRIAL } from '../config/tiers';
import { pixel } from '../analytics/pixel';

/**
 * Right after sign-up, before anything is connected: what the difference between Free and Max looks like on the
 * one screen that matters, for an example student. Visual first, almost no words. Max is shown first.
 */
export function Compare({ onNext }: { onNext: () => void }) {
  const [side, setSide] = useState<'max' | 'free'>('max');
  return (
    <section className="onboard-step plan-compare" aria-label="Free and Max, side by side">
      <h1 className="onboard-title">Same week, two plans.</h1>
      <div className="segmented plan-toggle" role="group" aria-label="Show">
        <button type="button" aria-pressed={side === 'max'} onClick={() => setSide('max')}>
          Max
        </button>
        <button type="button" aria-pressed={side === 'free'} onClick={() => setSide('free')}>
          Free
        </button>
      </div>
      <div className="plan-sides" data-side={side}>
        <MockNow kind="max" />
        <MockNow kind="free" />
      </div>
      <p className="hint plan-example">An example student at GCU, not your data.</p>
      <div className="onboard-actions">
        <button type="button" className="btn primary block" onClick={onNext}>
          Next
        </button>
      </div>
    </section>
  );
}

/** A drawn Now screen: Max full and alive, Free sparse. Built in HTML so it follows light and dark. */
function MockNow({ kind }: { kind: 'max' | 'free' }) {
  const max = kind === 'max';
  return (
    <figure className="mock-now" data-kind={kind} aria-label={max ? 'Example: Now on Max' : 'Example: Now on Free'}>
      <figcaption className="mock-cap">
        <b>{max ? 'Max' : 'Free'}</b>
        <span className="mock-example">Example</span>
      </figcaption>
      <div className="mock-screen">
        {max ? (
          <>
            <p className="mock-status">3 things need you.</p>
            <div className="mock-hero">
              <span className="mock-meta">
                <i className="mock-dot" style={{ background: '#e0632e' }} /> CHM-113 · from Halo
              </span>
              <b className="mock-title">Lab 4 Titration Report</b>
              <span className="mock-pills">
                <i>75 pts</i>
                <i>due Fri</i>
                <i>~2h</i>
              </span>
              <span className="mock-req">
                <b>Reply to 2 classmates by Sunday</b>
                <em>only in an announcement</em>
              </span>
            </div>
            <div className="mock-row">
              <span>Study plan · Quiz 2 Friday</span>
              <span className="mock-sessions">
                <i>Wed 30m</i>
                <i>Thu 45m</i>
              </span>
            </div>
            <div className="mock-row">
              <span>Grades from Halo</span>
              <span className="mock-grades">
                <i>A 96%</i>
                <i>B+ 88%</i>
                <i>A 95%</i>
              </span>
            </div>
            <p className="mock-foot">24 assignments · 6 classes · synced 2 min ago</p>
          </>
        ) : (
          <>
            <p className="mock-status">2 things you added.</p>
            <div className="mock-row mock-plain">
              <span>Chem homework</span>
              <span className="mock-faint">Oct 1</span>
            </div>
            <div className="mock-row mock-plain">
              <span>English essay</span>
              <span className="mock-faint">Oct 9</span>
            </div>
            <div className="mock-empty">
              <span>No grades</span>
              <span>No announcements</span>
              <span>Nothing found for you</span>
            </div>
          </>
        )}
      </div>
    </figure>
  );
}

const LINES: { icon: () => React.ReactElement; text: string }[] = [
  { icon: IconSync, text: 'Pulls every class, assignment, and grade from Halo' },
  { icon: IconInbox, text: 'Reads your announcements so you never miss hidden work' },
  { icon: IconNow, text: 'Tells you what to do next' },
  { icon: IconStudy, text: 'Builds study plans and practice worksheets for your quizzes' },
  { icon: IconAsk, text: 'Answers questions about your own classes' },
  { icon: IconColour, text: 'Pick your own color' },
];

/** The offer. One button starts the week and goes straight on to connecting Halo; the other stays on Free. */
export function Offer({ onStarted, onFree }: { onStarted: () => void; onFree: () => void }) {
  const { reloadProfile } = useAccount();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setNote(null);
    const r = await startTrial();
    setBusy(false);
    if (r.ok || r.why === 'already_max') {
      pixel('StartTrial');
      reloadProfile();
      onStarted();
      return;
    }
    // Used already (a returning account): say so and carry on to Halo on the plan they have.
    setNote(r.message);
  };
  return (
    <section className="onboard-step plan-offer" aria-label="Try Max free">
      <h1 className="onboard-title">{TRIAL.offer}</h1>
      <ul className="offer-lines">
        {LINES.map(({ icon: Icon, text }) => (
          <li key={text}>
            <span className="offer-icon" aria-hidden>
              <Icon />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <button type="button" className="btn primary block onboard-big" disabled={busy} onClick={() => void start()}>
        {busy ? 'Starting your week…' : 'Start my free week'}
      </button>
      <p className="hint offer-after">{TRIAL.after}</p>
      {note && (
        <p className="hint" role="alert">
          {note}{' '}
          <button type="button" className="hero-inline" onClick={onStarted}>
            Continue
          </button>
        </p>
      )}
      <p className="offer-free">
        <button type="button" className="hero-inline" onClick={onFree}>
          Stay on Free and upload syllabi instead
        </button>
      </p>
    </section>
  );
}
