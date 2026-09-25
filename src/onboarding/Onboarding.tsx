import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { SignIn } from '../auth/SignIn';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { dateOf, fmtDate } from '../domain/dates';
import { rankItems } from '../domain/now';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { SyncSteps } from '../views/SyncSheet';
import { visibleSteps, type OnboardingState, type Step } from './state';
import { pixel } from '../analytics/pixel';
import { track } from './track';

const SLIDES = [
  { title: 'Your day, from Halo.', text: 'One screen says what to do right now: the due date, how long it takes, what it is worth. Nothing you have to sort.' },
  { title: 'Sync in one tap.', text: 'A bookmark reads Halo while you are logged in there. It never sees your password, and you approve every change before it lands.' },
  { title: 'Know where you stand.', text: 'Every item says when it last matched Halo and where it came from. When an announcement moves a deadline, it moves here too, with the professor’s words.' },
];

const HOURS = ['1', '2', '3', '4'] as const;
const WEEKEND = ['2', '4', '6', '8'] as const;
const MORNING = [
  { value: '07:00', label: '7:00' },
  { value: '07:30', label: '7:30' },
  { value: '08:00', label: '8:00' },
  { value: 'off', label: 'No note' },
] as const;

/**
 * The first five minutes. Welcome, an account (when the build has them), Halo, two preferences, done. Every step can
 * be skipped, the whole thing can be skipped, and it can be run again from You. A student who arrives from an ad
 * should be looking at their own assignments within two minutes of the first screen.
 */
export function Onboarding() {
  const { data, schedule, actions } = useStore();
  const { auth } = useAccount();
  const { navigate } = useRoute();
  const tz = data.settings.timezone;
  const ob = data.settings.onboarding as OnboardingState;
  const step = ob.step;
  const steps = visibleSteps(auth.configured);
  const [slide, setSlide] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const set = (patch: Partial<OnboardingState>) => actions.updateSettings({ onboarding: { ...ob, ...patch } });
  const go = (next: Step) => {
    track(step, 'complete');
    track(next, 'enter');
    set({ step: next });
  };
  const skipStep = (next: Step) => {
    track(step, 'skip');
    track(next, 'enter');
    set({ step: next });
  };
  const skipAll = () => {
    track(step, 'skip');
    set({ skippedAt: new Date().toISOString() });
  };
  const finish = () => {
    track(step, 'complete');
    pixel('CompleteRegistration');
    set({ step: 'done', doneAt: new Date().toISOString() });
    navigate('now');
  };

  // The account step only exists on a build with accounts, and passes itself the moment someone is signed in.
  useEffect(() => {
    if (step === 'account' && (!auth.configured || auth.session)) set({ step: 'halo' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, auth.configured, auth.session]);

  const synced = data.courses.length > 0;
  const hero = useMemo(() => (synced ? (rankItems(data.items.filter((i) => i.type !== 'participation'), schedule, new Date().toISOString(), tz)[0] ?? null) : null), [synced, data.items, schedule, tz]);
  const n = Math.max(1, steps.indexOf(step) + 1);
  const hours = (min: number) => String(Math.round(min / 60));

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="onboard-inner">
        <header className="onboard-head">
          <span className="mono muted">
            Step {n} of {steps.length}
          </span>
          <span className="onboard-progress" aria-hidden>
            {steps.map((s, i) => (
              <i key={s} data-done={i < n - 1} data-current={i === n - 1} />
            ))}
          </span>
          <button type="button" className="diff-toggle" onClick={skipAll}>
            Skip for now
          </button>
        </header>

        {step === 'welcome' && (
          <section className="onboard-step" aria-label="Welcome">
            <p className="onboard-eyebrow mono">The planner built for Halo</p>
            <h1 className="onboard-title">{SLIDES[slide].title}</h1>
            <p className="onboard-text">{SLIDES[slide].text}</p>
            <div className="onboard-dots" aria-hidden>
              {SLIDES.map((_, i) => (
                <i key={i} data-on={i === slide} />
              ))}
            </div>
            <div className="onboard-actions">
              {slide > 0 && (
                <button type="button" className="btn" onClick={() => setSlide((s) => s - 1)}>
                  Back
                </button>
              )}
              <span className="spacer" />
              {slide < SLIDES.length - 1 ? (
                <button type="button" className="btn primary" onClick={() => setSlide((s) => s + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={() => go(auth.configured ? 'account' : 'halo')}>
                  Get started
                </button>
              )}
            </div>
            <p className="hint onboard-foot">Not affiliated with Grand Canyon University. Never asks for your GCU password.</p>
          </section>
        )}

        {step === 'account' && (
          <section className="onboard-step" aria-label="Account">
            <h1 className="onboard-title">Save it to an account.</h1>
            <p className="onboard-text">Your classes and work follow you between your phone and laptop, and nothing is lost if a browser is cleared. Email link or Google; no password.</p>
            <SignIn auth={auth} title="Sign in" />
            <div className="onboard-actions">
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => skipStep('halo')}>
                Not now, keep it on this device
              </button>
            </div>
          </section>
        )}

        {step === 'halo' && !synced && (
          <section className="onboard-step" aria-label="Connect Halo">
            <h1 className="onboard-title">Connect Halo.</h1>
            <p className="onboard-text">One bookmark, pressed while you are logged in to Halo. Your classes, assignments, grades and announcements arrive together; you approve them before they land.</p>
            <SyncSteps onNote={setNote} />
            {note && (
              <p className="hint" role="status">
                {note}
              </p>
            )}
            <div className="onboard-actions">
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => skipStep('preferences')}>
                I’ll do this later
              </button>
            </div>
          </section>
        )}

        {step === 'halo' && synced && (
          <section className="onboard-step onboard-celebrate" aria-label="Halo is connected">
            <p className="onboard-big" aria-hidden>
              ✓
            </p>
            <h1 className="onboard-title">
              {data.courses.length} {data.courses.length === 1 ? 'class' : 'classes'} and {data.items.length} {data.items.length === 1 ? 'assignment' : 'assignments'} are in.
            </h1>
            <p className="onboard-chips">
              {data.courses.map((c) => (
                <CourseChip key={c.id} course={c} />
              ))}
            </p>
            {hero && (
              <p className="onboard-text">
                First up: <b>{hero.label}</b>, due {fmtDate(dateOf(hero.dueAt, tz), 'short')}.
              </p>
            )}
            <div className="onboard-actions">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => go('preferences')}>
                Keep going
              </button>
            </div>
          </section>
        )}

        {step === 'preferences' && (
          <section className="onboard-step" aria-label="Two quick settings">
            <h1 className="onboard-title">Two quick things.</h1>
            <p className="onboard-text">Start-by dates and the workload view are built from your study hours. You can change these any time under You.</p>
            <div className="field">
              <span>Hours of schoolwork on a weekday, outside class</span>
              <SegmentedControl label="Weekday hours" value={(HOURS.includes(hours(data.settings.weekdayMinutes) as (typeof HOURS)[number]) ? hours(data.settings.weekdayMinutes) : '3') as (typeof HOURS)[number]} options={HOURS.map((h) => ({ value: h, label: `${h}h` }))} onChange={(v) => actions.updateSettings({ weekdayMinutes: Number(v) * 60 })} />
            </div>
            <div className="field">
              <span>On a weekend day</span>
              <SegmentedControl label="Weekend hours" value={(WEEKEND.includes(hours(data.settings.weekendMinutes) as (typeof WEEKEND)[number]) ? hours(data.settings.weekendMinutes) : '4') as (typeof WEEKEND)[number]} options={WEEKEND.map((h) => ({ value: h, label: `${h}h` }))} onChange={(v) => actions.updateSettings({ weekendMinutes: Number(v) * 60 })} />
            </div>
            <div className="field">
              <span>A morning note with your day</span>
              <SegmentedControl label="Morning note" value={(data.settings.reminders?.morningTime ?? '07:30') as (typeof MORNING)[number]['value']} options={[...MORNING]} onChange={(v) => actions.updateSettings({ reminders: { ...(data.settings.reminders ?? {}), morningTime: v } })} />
            </div>
            <div className="onboard-actions">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={finish}>
                Show me my day
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
