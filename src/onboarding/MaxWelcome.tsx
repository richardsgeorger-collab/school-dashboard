import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { HaloDraw } from '../components/HaloDraw';
import { ACCENTS, DEFAULT_ACCENT, type AccentId } from '../config/accents';
import { trialDaysLeft } from '../config/flags';
import { TRIAL } from '../config/tiers';
import { announceDb } from '../halo/announce';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';
import { AccentPicker } from '../views/AccentPicker';
import { useReceipts } from '../views/TrialOffer';
import { MAX_STEPS, maxStepIndex, type MaxOnboardingState } from './maxState';
import { NowPreview } from './NowPreview';
import { track } from './track';

/**
 * Welcome to Max, four screens, once: what is on and for how long; pick a colour on a live copy of Now; what Max
 * has already done with this student's own announcements (real counts, or an honest "next sync"); a short tour of
 * the coach, the prompt panel, study kits and transcripts on their own classes. Then Now, in their colour.
 */
export function MaxWelcome() {
  const { data, actions } = useStore();
  const { profile } = useAccount();
  const { navigate } = useRoute();
  const mo = data.settings.maxOnboarding as MaxOnboardingState;
  const step = mo.step === 'done' ? 'tour' : mo.step;
  const n = maxStepIndex(step) + 1;
  const days = trialDaysLeft(profile) ?? TRIAL.days;
  const accent: AccentId = data.settings.accent ?? DEFAULT_ACCENT;
  const receipts = useReceipts();
  const [onFile, setOnFile] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const ids = new Set(data.courses.map((c) => c.id));
    void announceDb
      .list()
      .then((l) => live && setOnFile(l.filter((a) => ids.has(a.courseId)).length))
      .catch(() => live && setOnFile(0));
    return () => {
      live = false;
    };
  }, [data.courses]);

  const set = (patch: Partial<MaxOnboardingState>) => actions.updateSettings({ maxOnboarding: { ...mo, ...patch } });
  const go = (next: MaxOnboardingState['step']) => {
    track(`max-${step}`, 'complete');
    track(`max-${next}`, 'enter');
    set({ step: next });
  };
  const finish = (to?: string) => {
    track(`max-${step}`, 'complete');
    set({ step: 'done', doneAt: new Date().toISOString() });
    if (to) window.location.hash = to;
    else navigate('now');
  };
  const skip = () => {
    track(`max-${step}`, 'skip');
    set({ step: 'done', doneAt: new Date().toISOString() });
  };
  const first = data.courses[0];
  const second = data.courses[1] ?? first;
  const third = data.courses[2] ?? first;
  const chosen = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];

  return (
    <div className="onboard max-welcome" role="dialog" aria-modal="true" aria-label="Welcome to Max">
      <div className="onboard-inner">
        <header className="onboard-head">
          <span className="onboard-count">
            {n} of {MAX_STEPS.length}
          </span>
          <span className="onboard-progress" aria-hidden>
            {MAX_STEPS.map((s, i) => (
              <i key={s} data-done={i < n - 1} data-current={i === n - 1} />
            ))}
          </span>
          <button type="button" className="diff-toggle" onClick={skip}>
            Skip
          </button>
        </header>

        {step === 'welcome' && (
          <section className="onboard-step" aria-label="Welcome to Max">
            <HaloDraw size={80} />
            <p className="eyebrow">Max is on</p>
            <h1 className="onboard-title">Welcome to Max.</h1>
            <p className="onboard-text">
              For the next {days} day{days === 1 ? '' : 's'} Halo+ reads every announcement for hidden requirements, plans your studying, turns lectures into notes, and answers what to do next. {TRIAL.line} Let's set it up in a minute.
            </p>
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={() => go('colour')}>
                Let's go
              </button>
            </div>
          </section>
        )}

        {step === 'colour' && (
          <section className="onboard-step" aria-label="Pick your colour">
            <h1 className="onboard-title">Pick your colour.</h1>
            <p className="onboard-text">Max wears the accent you choose, on every screen. Gold is the halo; the rest are yours. Change it any time under You → Display.</p>
            <AccentPicker value={accent} allowed onChange={(a) => actions.updateSettings({ accent: a })} />
            <NowPreview accent={accent} />
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={() => go('receipts')}>
                Keep {chosen.name.toLowerCase()}
              </button>
            </div>
          </section>
        )}

        {step === 'receipts' && (
          <section className="onboard-step" aria-label="What Max did">
            {receipts && receipts.announcementsRead > 0 ? (
              <>
                <p className="eyebrow">Already done</p>
                <h1 className="onboard-title">
                  Max read <span className="payoff-num">{receipts.announcementsRead}</span> announcement{receipts.announcementsRead === 1 ? '' : 's'}
                  {receipts.requirementsFound > 0 ? (
                    <>
                      {' '}
                      and found <span className="payoff-num">{receipts.requirementsFound}</span> requirement{receipts.requirementsFound === 1 ? '' : 's'} your professors only said there.
                    </>
                  ) : (
                    '.'
                  )}
                </h1>
                <p className="onboard-text">Each one sits on the assignment it belongs to, in the professor's own words. Open any assignment and look under Details.</p>
              </>
            ) : onFile && onFile > 0 ? (
              <>
                <p className="eyebrow">Reading now</p>
                <h1 className="onboard-title">
                  Max is reading your <span className="payoff-num">{onFile}</span> announcement{onFile === 1 ? '' : 's'}.
                </h1>
                <p className="onboard-text">It runs in the background and finishes in a minute or two. What it finds lands on the assignment it belongs to, and Now says so.</p>
              </>
            ) : (
              <>
                <p className="eyebrow">Next sync</p>
                <h1 className="onboard-title">Max starts with your next sync.</h1>
                <p className="onboard-text">Open Halo and click the bookmark. Every announcement comes across and Max reads it for the things your professors only said there.</p>
              </>
            )}
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={() => go('tour')}>
                Next
              </button>
              {!(receipts && receipts.announcementsRead > 0) && !(onFile && onFile > 0) && (
                <button type="button" className="btn" onClick={() => { finish(); syncPress.current?.(); }}>
                  Sync Halo now
                </button>
              )}
            </div>
          </section>
        )}

        {step === 'tour' && (
          <section className="onboard-step" aria-label="What Max does">
            <h1 className="onboard-title">Four things Max does, on your classes.</h1>
            <ul className="max-tour">
              <li className="card max-tour-card">
                <b>Ask what to do next</b>
                <span>{first ? `The coach knows ${first.code} and the rest. Ask what first, what can wait, what a professor really wants.` : 'The coach knows your classes. Ask what first, what can wait, what a professor really wants.'}</span>
                <button type="button" className="btn small" onClick={() => finish('/ai')}>
                  Open the coach
                </button>
              </li>
              <li className="card max-tour-card">
                <b>A prompt for the thing in front of you</b>
                <span>On Now, tap Details, then Prompt for this: a prompt written for that assignment, with its rubric and sources.</span>
                <button type="button" className="btn small" onClick={() => finish()}>
                  Show me on Now
                </button>
              </li>
              <li className="card max-tour-card">
                <b>Study kits</b>
                <span>{second ? `Flashcards and practice questions for ${second.code}, from your own slides and lectures.` : 'Flashcards and practice questions from your own slides and lectures.'}</span>
                <button type="button" className="btn small" onClick={() => finish(second ? `/study?c=${second.id}` : '/study')}>
                  {second ? `Study kit for ${second.code}` : 'Open study kits'}
                </button>
              </li>
              <li className="card max-tour-card">
                <b>Lectures into notes</b>
                <span>{third ? `Paste a ${third.code} lecture transcript and get notes, a summary and what the professor flagged for the exam.` : 'Paste a lecture transcript and get notes, a summary and what the professor flagged for the exam.'}</span>
                <button type="button" className="btn small" onClick={() => finish(third ? `/class?c=${third.id}` : '/classes')}>
                  {third ? `Open ${third.code}` : 'Open classes'}
                </button>
              </li>
            </ul>
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={() => finish()}>
                Take me to Now
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
