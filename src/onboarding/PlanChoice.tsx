import { useEffect, useState } from 'react';
import { IconAsk, IconColour, IconInbox, IconNow, IconStudy, IconSync } from '../components/Icons';
import { TRIAL } from '../config/tiers';

/**
 * Before connecting Halo (George, 2026-09-29): fifteen seconds on an example student's Now screen. Three beats: Free (a
 * sparse planner with a few hand-added items), Plus (everything fills in from Halo, grades appear, a hidden
 * requirement lights up from an announcement), Max (a study plan and a practice worksheet for Friday's quiz, and Ask
 * answering a question about the class). It plays itself, can be skipped, and moves on.
 *
 * Framed as a demo (George, 2026-09-30, who took it for his own data): a title, the screen inside a device outline
 * with "Example student" in it and sample names, a big plan pill per beat, one caption under the frame, and tabs that
 * show the sequence and jump to a beat. The animations themselves are unchanged.
 */
export const BEAT_MS = 5000;
const BEATS = [
  { plan: 'Free', line: 'You add everything yourself.' },
  { plan: 'Plus', line: 'Everything from Halo, automatically. Hidden work found in announcements.' },
  { plan: 'Max', line: 'Plus study plans, practice worksheets, and answers about your classes.' },
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
    <section className="onboard-step story" aria-label="See what each plan does">
      <div className="story-top">
        <h1 className="onboard-title story-title">See what each plan does</h1>
        <button type="button" className="hero-inline story-skip" onClick={onNext}>
          Skip the example
        </button>
      </div>
      <div className="story-device" data-beat={beat}>
        <div className="story-device-bar">
          <span className="story-device-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="story-device-tag">Example student · Sam Sample</span>
        </div>
        <div className="story-device-body">
          <span className="story-pill" data-plan={b.plan} key={b.plan}>
            {b.plan.toUpperCase()}
          </span>
          <StoryScreen beat={beat} />
        </div>
      </div>
      <p className="story-caption" aria-live="polite">
        {b.line}
      </p>
      <div className="story-tabs" role="tablist" aria-label="Plans">
        {BEATS.map((x, i) => (
          <button key={x.plan} type="button" role="tab" aria-selected={i === beat} data-state={i < beat ? 'done' : i === beat ? 'now' : 'next'} onClick={() => setBeat(i)}>
            <span>{x.plan}</span>
            <i className="story-tab-bar" aria-hidden>
              <i />
            </i>
          </button>
        ))}
      </div>
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
                <i className="mock-dot" style={{ background: '#e0632e' }} /> CHEM 101 · from Halo
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

/** The Halo+ ring drawing itself in gold, a soft glow, the plus, a few sparkles: a halo lighting up (no emoji). */
function HaloLightsUp() {
  return (
    <div className="halo-up" aria-hidden>
      <svg viewBox="0 0 64 64" width="108" height="108" className="halo-up-mark" data-viz>
        <path className="halo-up-glow" d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" pathLength={1} />
        <path className="halo-up-ring" d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" pathLength={1} />
        <path className="halo-up-plus" d="M47.1 9.3v15.2M39.5 16.9h15.2" />
      </svg>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 10 10" width="14" height="14" className="halo-up-spark" data-n={i}>
          <path d="M5 0 L6.1 3.9 L10 5 L6.1 6.1 L5 10 L3.9 6.1 L0 5 L3.9 3.9 Z" />
        </svg>
      ))}
    </div>
  );
}

const GIFT_LINES: { icon: () => React.ReactElement; text: string }[] = [
  { icon: IconSync, text: 'Pulls every class, assignment, and grade from Halo' },
  { icon: IconInbox, text: 'Reads your announcements so you never miss hidden work' },
  { icon: IconNow, text: 'Tells you what to do next' },
  { icon: IconStudy, text: 'Builds study plans and practice worksheets for your quizzes' },
  { icon: IconAsk, text: 'Answers questions about your own classes' },
  { icon: IconColour, text: 'Pick your own color' },
];

/**
 * The welcome gift (George, 2026-09-29, replacing the offer): every new account already has Max for 7 days, so this
 * is not a choice. It says what they have, what it does for them, and what happens after, then one button.
 */
export function Gift({ onNext, invited = false }: { onNext: () => void; invited?: boolean }) {
  return (
    <section className="onboard-step gift" aria-label="Your welcome gift">
      <HaloLightsUp />
      <h1 className="onboard-title gift-title">You've got Max free for 7 days.</h1>
      <p className="offer-promise">{TRIAL.promise}</p>
      <ul className="offer-lines gift-lines">
        {GIFT_LINES.map(({ icon: Icon, text }) => (
          <li key={text}>
            <span className="offer-icon" aria-hidden>
              <Icon />
            </span>
            {text}
          </li>
        ))}
      </ul>
      {invited && <p className="gift-invited">Then 30 days of Plus free, from your friend's invite.</p>}
      <p className="gift-after">After 7 days you choose what to keep. Free stays free.</p>
      <button type="button" className="btn primary block offer-go" onClick={onNext}>
        Connect Halo
      </button>
    </section>
  );
}
