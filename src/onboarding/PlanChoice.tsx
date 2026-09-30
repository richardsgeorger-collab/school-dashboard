import { useEffect, useState } from 'react';
import { IconAsk, IconColour, IconInbox, IconNow, IconStudy, IconSync } from '../components/Icons';
import { TRIAL } from '../config/tiers';

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
      <div className="gift-burst" aria-hidden>
        <span className="gift-ring" />
        <span className="gift-bow">🎁</span>
      </div>
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
