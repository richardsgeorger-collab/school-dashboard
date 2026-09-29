import { useEffect, useMemo, useState } from 'react';
import { HaloDraw } from '../components/HaloDraw';
import { ACCENTS, DEFAULT_ACCENT, type AccentId } from '../config/accents';
import { EXTENSION_URL as STORE_URL } from '../config/extension';
import { isIOSDevice, isTouchDevice } from '../ui/device';
/** No Chrome extensions on an iPad or a phone: never offered there. */
const EXTENSION_URL = isTouchDevice() ? null : STORE_URL;
import { rank } from '../config/flags';
import type { Tier } from '../config/tiers';
import { dateOf, fmtDate, fmtMinutes } from '../domain/dates';
import { nextTestPlan } from '../domain/exam';
import { shortLine } from '../domain/shortLine';
import type { MaxOnboardingState, Settings } from '../domain/types';
import { useReadStatus } from '../halo/backgroundRead';
import { enablePush, pushSupported } from '../notify/push';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { AccentPicker } from '../views/AccentPicker';
import { NowPreview } from './NowPreview';
import { track } from './track';

/**
 * Which upgrade welcome is due, or null. Max when the account is on Max (paid, trial or a friend's gift) and has not
 * seen it; Plus when it is on Plus and has not seen that. Someone going from Plus to Max sees only the Max part, and
 * someone landing straight on Max never sees the Plus part (Max includes it). A Max welcome finished under the old
 * four-screen version counts as seen.
 */
export function upgradeDue(tier: Tier, seen: Settings['upgradeSeen'], oldMax?: MaxOnboardingState): 'plus' | 'max' | null {
  if (rank(tier) >= rank('max')) return seen?.max || oldMax?.doneAt ? null : 'max';
  if (rank(tier) >= rank('plus')) return seen?.plus || seen?.max ? null : 'plus';
  return null;
}

/**
 * The celebration after an upgrade, three screens at most, on the student's own data. Plus: what is now on, what it
 * found in their real announcements, then auto-sync and notifications one tap each. Max: welcome, pick a colour on a
 * live copy of their Now, then their next quiz or exam with a study plan and a practice worksheet, and Ask in
 * one line. Shown once each, ever.
 */
export function Upgrade({ kind }: { kind: 'plus' | 'max' }) {
  const { data, actions } = useStore();
  const { navigate } = useRoute();
  const [i, setI] = useState(0);
  const screens = 3;
  useEffect(() => track(`upgrade-${kind}-${i + 1}`, 'enter'), [kind, i]);
  const done = (to?: string) => {
    track(`upgrade-${kind}`, 'complete');
    const now = new Date().toISOString();
    actions.updateSettings({ upgradeSeen: { ...(data.settings.upgradeSeen ?? {}), [kind]: now, ...(kind === 'max' ? { plus: data.settings.upgradeSeen?.plus ?? now } : {}) } });
    if (to) window.location.hash = to;
    else navigate('now');
  };
  const next = () => (i + 1 < screens ? setI(i + 1) : done());
  return (
    <div className="onboard upgrade" role="dialog" aria-modal="true" aria-label={`Welcome to ${kind === 'max' ? 'Max' : 'Plus'}`}>
      <div className="onboard-inner">
        <header className="onboard-head">
          <span className="onboard-count">
            {i + 1} of {screens}
          </span>
          <span className="onboard-progress" aria-hidden>
            {Array.from({ length: screens }, (_, k) => (
              <i key={k} data-done={k < i} data-current={k === i} />
            ))}
          </span>
          <button type="button" className="diff-toggle" onClick={() => done()}>
            Skip
          </button>
        </header>
        {kind === 'plus' ? <PlusScreens i={i} next={next} /> : <MaxScreens i={i} next={next} done={done} />}
      </div>
    </div>
  );
}

function PlusScreens({ i, next }: { i: number; next: () => void }) {
  const { data, courseById, actions } = useStore();
  const reading = useReadStatus();
  const finds = useMemo(
    () => data.items.flatMap((it) => (it.requirements ?? []).filter((r) => r.source?.kind === 'announcement').map((r) => ({ id: r.id, text: shortLine(r.text), code: courseById.get(it.courseId)?.code ?? '' }))),
    [data.items, courseById],
  );
  const [push, setPush] = useState<string | null>(null);
  const turnOnPush = async () => {
    const r = await enablePush();
    if (r.ok) {
      actions.updateSettings({ reminders: { ...(data.settings.reminders ?? {}), pushEnabled: true } });
      setPush('On. A morning note with your day, and a heads-up before a heavy one.');
    } else setPush(r.error);
  };
  if (i === 0)
    return (
      <section className="onboard-step" aria-label="Welcome to Plus">
        <HaloDraw size={80} />
        <p className="eyebrow">Plus is on</p>
        <h1 className="onboard-title">Welcome to Plus.</h1>
        <p className="onboard-text">Your announcements are now read for you. What each one asks lands on its assignment, and your real Halo grades come with every sync.</p>
        <div className="onboard-actions">
          <button type="button" className="btn primary" onClick={next}>
            Show me
          </button>
        </div>
      </section>
    );
  if (i === 1)
    return (
      <section className="onboard-step" aria-label="What it found">
        <p className="eyebrow">In your announcements</p>
        <h1 className="onboard-title">{finds.length > 0 ? `${finds.length} thing${finds.length === 1 ? '' : 's'} your assignments don't say.` : reading.running ? 'Reading your announcements now.' : 'Nothing hidden so far.'}</h1>
        {finds.length > 0 && (
          <ul className="payoff-finds">
            {finds.slice(0, 5).map((f) => (
              <li key={f.id}>
                <span className="mono muted">{f.code}</span> {f.text}
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          {reading.running && reading.progress ? `Reading ${reading.progress.done} of ${reading.progress.total}; more will appear.` : finds.length > 5 ? `And ${finds.length - 5} more, each on its assignment.` : 'New announcements are read as they arrive.'}
        </p>
        <div className="onboard-actions">
          <button type="button" className="btn primary" onClick={next}>
            Next
          </button>
        </div>
      </section>
    );
  return (
    <section className="onboard-step" aria-label="Two taps">
      <h1 className="onboard-title">{EXTENSION_URL ? 'Two things, one tap each.' : 'One more tap.'}</h1>
      <div className="upgrade-rows">
        {!isTouchDevice() && <div>
          <b>Sync on its own.</b>{' '}
          {EXTENSION_URL ? (
            <>
              The Chrome extension syncs whenever you open Halo.{' '}
              <a className="btn small" href={EXTENSION_URL} target="_blank" rel="noreferrer">
                Add to Chrome
              </a>
            </>
          ) : (
            <span className="hint">The Chrome extension is on its way to the Web Store. Until then the bookmark takes one click.</span>
          )}
        </div>}
        <div>
          <b>Notifications.</b> A morning note with your day.{' '}
          {pushSupported() || isIOSDevice() ? (
            <button type="button" className="btn small" onClick={() => void turnOnPush()}>
              Turn on
            </button>
          ) : null}
          {push && <p className="hint">{push}</p>}
        </div>
      </div>
      <div className="onboard-actions">
        <button type="button" className="btn primary" onClick={next}>
          Done
        </button>
      </div>
    </section>
  );
}

function MaxScreens({ i, next, done }: { i: number; next: () => void; done: (to?: string) => void }) {
  const { data, schedule, today, actions, courseById } = useStore();
  const tz = data.settings.timezone;
  const accent: AccentId = data.settings.accent ?? DEFAULT_ACCENT;
  const chosen = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];
  const plan = useMemo(() => nextTestPlan(data.items, schedule, data.settings, today), [data.items, schedule, data.settings, today]);
  if (i === 0)
    return (
      <section className="onboard-step" aria-label="Welcome to Max">
        <HaloDraw size={80} />
        <p className="eyebrow">Max is on</p>
        <h1 className="onboard-title">Welcome to Max.</h1>
        <p className="onboard-text">Everything in Plus, and the Study tab: ask anything about your classes, practice for any quiz or exam with a plan, a worksheet and quiz me, and check your work before you turn it in. Two quick things.</p>
        <div className="onboard-actions">
          <button type="button" className="btn primary" onClick={next}>
            Let's go
          </button>
        </div>
      </section>
    );
  if (i === 1)
    return (
      <section className="onboard-step" aria-label="Pick your colour">
        <h1 className="onboard-title">Pick your colour.</h1>
        <p className="onboard-text">This is your Now, in it.</p>
        <AccentPicker value={accent} allowed onChange={(a) => actions.updateSettings({ accent: a })} />
        <NowPreview accent={accent} />
        <div className="onboard-actions">
          <button type="button" className="btn primary" onClick={next}>
            Keep {chosen.name.toLowerCase()}
          </button>
        </div>
      </section>
    );
  const course = plan ? courseById.get(plan.exam.courseId) : null;
  return (
    <section className="onboard-step" aria-label="Your next test">
      {plan && course ? (
        <>
          <p className="eyebrow">Your next {plan.exam.type === 'exam' ? 'exam' : 'quiz'}</p>
          <h1 className="onboard-title">
            {plan.exam.label}, {fmtDate(dateOf(plan.exam.dueAt, tz), 'long')}.
          </h1>
          <p className="onboard-text">
            A study plan that fits your week, about {fmtMinutes(plan.remainingMinutes)}: {plan.sessions.map((x) => x.label).join(', ')}.
          </p>
          <div className="onboard-actions upgrade-actions">
            <button type="button" className="btn primary" onClick={() => done(`#/practice?i=${plan.exam.id}&k=worksheet`)}>
              Make my practice worksheet
            </button>
            <button type="button" className="btn" onClick={() => done(`#/practice?i=${plan.exam.id}&k=quiz`)}>
              Quiz me
            </button>
            <button type="button" className="btn" onClick={() => done()}>
              Maybe later
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="eyebrow">Study, on your classes</p>
          <h1 className="onboard-title">No quiz or exam in the next three weeks.</h1>
          <p className="onboard-text">When one comes up, Now plans the studying around it. Any time, make a practice worksheet from a class's material.</p>
          <div className="onboard-actions">
            <button type="button" className="btn primary" onClick={() => done('#/practice')}>
              Make a practice worksheet
            </button>
            <button type="button" className="btn" onClick={() => done()}>
              Maybe later
            </button>
          </div>
        </>
      )}
      <p className="hint">
        Optional. It's all on the Study tab whenever you want it, along with Ask for what to do tonight.
      </p>
    </section>
  );
}
