import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { startTrial } from '../auth/trial';
import { TRIAL } from '../config/tiers';
import { pixel } from '../analytics/pixel';

/**
 * Before connecting Halo (George, 2026-09-29): fifteen seconds, no reading required, on an example GCU student's Now
 * screen. Three beats: Free (a sparse planner with a few hand-added items), Plus (everything fills in from Halo,
 * grades appear, a hidden requirement lights up from an announcement), Max (a study plan and a practice worksheet
 * for Friday's quiz, and Ask answering a question about the class). It plays itself, can be skipped, and moves on.
 */
export const BEAT_MS = 5000;
const BEATS = [
  { plan: 'Free', line: 'What you add yourself.' },
  { plan: 'Plus', line: 'Everything from Halo, read for you.' },
  { plan: 'Max', line: 'Study help that knows your class.' },
] as const;

export function Compare({ onNext }: { onNext: () => void }) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    // The screenshot script can hold a beat; nothing else sets it.
    let hold: number | null = null;
    try {
      const v = localStorage.getItem('school-dashboard:story-hold');
      hold = v === null ? null : Number(v);
    } catch {
      /* storage unavailable */
    }
    if (hold !== null && Number.isFinite(hold)) {
      setBeat(hold);
      return;
    }
    const t = setTimeout(() => (beat < 2 ? setBeat(beat + 1) : onNext()), beat < 2 ? BEAT_MS : BEAT_MS + 800);
    return () => clearTimeout(t);
  }, [beat, onNext]);
  const b = BEATS[beat];
  return (
    <section className="onboard-step story" aria-label="What Free, Plus and Max look like">
      <div className="story-top">
        <div className="story-progress" aria-hidden>
          {BEATS.map((x, i) => (
            <span key={x.plan} data-state={i < beat ? 'done' : i === beat ? 'now' : 'next'}>
              <i />
            </span>
          ))}
        </div>
        <button type="button" className="hero-inline story-skip" onClick={onNext}>
          Skip the example
        </button>
      </div>
      <p className="story-caption" aria-live="polite">
        <b data-plan={b.plan}>{b.plan}</b> <span>{b.line}</span>
      </p>
      <StoryScreen beat={beat} />
      <p className="hint story-example">Example: a GCU student's week, not your data.</p>
    </section>
  );
}

/** The example Now screen, drawn in HTML so it follows light and dark. Each beat adds to the one before. */
function StoryScreen({ beat }: { beat: number }) {
  const plus = beat >= 1;
  const max = beat >= 2;
  return (
    <figure className="mock-now story-screen" data-beat={beat} role="img" aria-label={['Example Now on Free: two things the student typed in, no grades, no announcements.', 'Example Now on Plus: assignments and grades from Halo, and a requirement found in an announcement.', 'Example Now on Max: a study plan and worksheet for Friday’s quiz, and Ask answering a question about the class.'][beat]}>
      <div className="mock-screen">
        <p className="mock-status">{plus ? '3 things need you.' : '2 things you added.'}</p>
        {!plus && (
          <>
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
            </div>
          </>
        )}
        {plus && (
          <>
            <div className="mock-hero story-in">
              <span className="mock-meta">
                <i className="mock-dot" style={{ background: '#e0632e' }} /> CHM-113 · from Halo
              </span>
              <b className="mock-title">Lab 4 Titration Report</b>
              <span className="mock-pills">
                <i>75 pts</i>
                <i>due Fri</i>
                <i>~2h</i>
              </span>
              <span className="mock-req story-glow">
                <b>Reply to 2 classmates by Sunday</b>
                <em>found in an announcement</em>
              </span>
            </div>
            <div className="mock-row story-in story-d1">
              <span>Grades from Halo</span>
              <span className="mock-grades">
                <i>A 96%</i>
                <i>B+ 88%</i>
                <i>A 95%</i>
              </span>
            </div>
          </>
        )}
        {max && (
          <>
            <div className="mock-row story-in story-max">
              <span>
                <b>Quiz 2 on Friday</b> · study plan
              </span>
              <span className="mock-sessions">
                <i>Wed 30m</i>
                <i>Thu 45m</i>
              </span>
            </div>
            <div className="mock-row story-in story-max story-d1">
              <span>Practice worksheet · 12 problems</span>
              <span className="mock-faint">with answers</span>
            </div>
            <div className="story-ask story-in story-d2">
              <p className="story-q">What's on Friday's quiz?</p>
              <p className="story-a">Molarity and titration, chapters 4 and 5. Your worksheet covers both.</p>
            </div>
          </>
        )}
        {plus && !max && <p className="mock-foot story-in story-d2">24 assignments · 6 classes · synced 2 min ago</p>}
      </div>
    </figure>
  );
}

/** The trial screen. One huge button starts the week and goes straight on to connecting Halo. */
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
    <section className="onboard-step plan-offer" aria-label="Try everything free">
      <h1 className="onboard-title offer-title">{TRIAL.headline}</h1>
      <p className="offer-promise">{TRIAL.promise}</p>
      <button type="button" className="btn primary block offer-go" disabled={busy} onClick={() => void start()}>
        {busy ? 'Starting your week…' : 'Start my free week'}
      </button>
      <p className="offer-after">{TRIAL.after}</p>
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
          Continue with Free instead.
        </button>
      </p>
    </section>
  );
}
