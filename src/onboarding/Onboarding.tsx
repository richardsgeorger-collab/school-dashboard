import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { SignIn } from '../auth/SignIn';
import { CourseChip } from '../components/CourseChip';
import { HaloDraw } from '../components/HaloDraw';
import { SegmentedControl } from '../components/SegmentedControl';
import { dateOf, fmtDate } from '../domain/dates';
import { rankItems } from '../domain/now';
import type { Item } from '../domain/types';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { BookmarkButton, SyncSteps } from '../views/SyncSheet';
import { visibleSteps, type OnboardingState, type Step } from './state';
import { pixel } from '../analytics/pixel';
import { announceDb } from '../halo/announce';
import { TrialOffer } from '../views/TrialOffer';
import { track } from './track';

const HOURS = ['1', '2', '3', '4'] as const;
const WEEKEND = ['2', '4', '6', '8'] as const;
const MORNING = [
  { value: '07:00', label: '7:00' },
  { value: '07:30', label: '7:30' },
  { value: '08:00', label: '8:00' },
  { value: 'off', label: 'No note' },
] as const;

const isPhone = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent));

/** A number that counts up to its target over about a second, easing out. Reduced motion lands immediately. */
function useCountUp(target: number, ms = 1300): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

/** Things the professors only said in announcements: work made from a post, and parts attached from one. */
export function announcementFinds(items: Item[]): number {
  let n = 0;
  for (const i of items) {
    if (i.origin?.kind === 'announcement') n += 1;
    for (const r of i.requirements ?? []) if (r.source?.kind === 'announcement') n += 1;
  }
  return n;
}

/**
 * The first two minutes, one question per screen: sign up, drag the bookmark (shown, not described), open Halo and
 * click it, then the payoff: how much was found, counted up, and the real first assignment. Extras come later.
 */
export function Onboarding() {
  const { data, schedule, actions } = useStore();
  const { auth } = useAccount();
  const { navigate } = useRoute();
  const tz = data.settings.timezone;
  const ob = data.settings.onboarding as OnboardingState;
  const step = ob.step;
  const steps = visibleSteps(auth.configured);
  const [phase, setPhase] = useState<'install' | 'sync'>('install');
  const [note, setNote] = useState<string | null>(null);
  const phone = useMemo(isPhone, []);

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
  const found = useCountUp(synced ? data.items.length : 0);
  const finds = announcementFinds(data.items);
  const foundPosts = useCountUp(synced ? finds : 0, 1600);
  // How many announcements the sync brought: the honest, cheap number the trial card can quote when none has been read.
  const [posts, setPosts] = useState(0);
  useEffect(() => {
    if (!synced) return;
    let live = true;
    const ids = new Set(data.courses.map((c) => c.id));
    void announceDb
      .list()
      .then((l) => live && setPosts(l.filter((a) => ids.has(a.courseId)).length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [synced, data.courses]);
  const n = Math.max(1, steps.indexOf(step) + 1);
  const hours = (min: number) => String(Math.round(min / 60));

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="onboard-inner">
        <header className="onboard-head">
          <span className="onboard-count">
            {n} of {steps.length}
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
            <HaloDraw size={72} />
            <p className="eyebrow">The planner built for Halo</p>
            <h1 className="onboard-title">Your day, from Halo.</h1>
            <p className="onboard-text">One screen says what to do right now: the due date, how long it takes, what it is worth. Every announcement read for you. Nothing you have to sort.</p>
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={() => go(auth.configured && !auth.session ? 'account' : 'halo')}>
                {auth.configured && !auth.session ? 'Sign up' : 'Get started'}
              </button>
            </div>
            {auth.configured && !auth.session && (
              <p className="hint">
                Already have an account? <a href="#/login">Log in</a>
              </p>
            )}
            <p className="hint onboard-foot">Not affiliated with Grand Canyon University. Never asks for your GCU password.</p>
          </section>
        )}

        {step === 'account' && (
          <section className="onboard-step" aria-label="Sign up">
            <h1 className="onboard-title">Create your account.</h1>
            <p className="onboard-text">Your classes and work follow you between your phone and laptop. Email link or Google; no password to invent. Already have one? The same form signs you in.</p>
            <SignIn auth={auth} title="Your account" />
            <div className="onboard-actions">
              <button type="button" className="btn" onClick={() => skipStep('halo')}>
                Not now, keep it on this device
              </button>
            </div>
          </section>
        )}

        {step === 'halo' && !synced && phase === 'install' && (
          <section className="onboard-step" aria-label="Connect Halo">
            <h1 className="onboard-title">Drag this to your bookmarks bar.</h1>
            {phone ? (
              <>
                <p className="onboard-text">On a phone the bookmark is made by hand. Four short steps.</p>
                <SyncSteps onNote={setNote} />
              </>
            ) : (
              <>
                <div className="drag-demo" aria-hidden>
                  <div className="demo-chrome">
                    <span className="demo-dot" />
                    <span className="demo-dot" />
                    <span className="demo-dot" />
                    <span className="demo-url">halo.gcu.edu</span>
                  </div>
                  <div className="demo-bar">
                    <span className="demo-bm" />
                    <span className="demo-bm" />
                    <span className="demo-slot">
                      <i>Sync Halo</i>
                    </span>
                  </div>
                  <div className="demo-page">
                    <span className="demo-pill">Sync Halo</span>
                    <span className="demo-cursor" />
                  </div>
                </div>
                <p className="onboard-text">
                  Drag <BookmarkButton onClickNote={setNote} /> up to the bookmarks bar. (Hidden bar: ⌘⇧B on Mac, Ctrl+Shift+B on Windows.) It reads Halo while you are logged in there and never sees your password.
                </p>
              </>
            )}
            {note && (
              <p className="hint" role="status">
                {note}
              </p>
            )}
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={() => setPhase('sync')}>
                {phone ? 'I made the bookmark' : 'I dragged it'}
              </button>
              <button type="button" className="btn" onClick={() => skipStep('preferences')}>
                Later
              </button>
            </div>
          </section>
        )}

        {step === 'halo' && !synced && phase === 'sync' && (
          <section className="onboard-step onboard-wait" aria-label="First sync">
            <span className="wait-ring" aria-hidden>
              <HaloDraw size={72} />
            </span>
            <h1 className="onboard-title">Open Halo and {phone ? 'tap' : 'click'} Sync Halo.</h1>
            <p className="onboard-text">Log in at halo.gcu.edu, then {phone ? 'open your bookmarks and tap Sync Halo' : 'click the bookmark'}. This page fills in on its own the moment your classes arrive.</p>
            <p className="hint">
              <a href="https://halo.gcu.edu" target="_blank" rel="noreferrer">
                Open halo.gcu.edu
              </a>
            </p>
            <div className="onboard-actions">
              <button type="button" className="btn" onClick={() => setPhase('install')}>
                Back
              </button>
              <button type="button" className="btn" onClick={() => skipStep('preferences')}>
                Later
              </button>
            </div>
          </section>
        )}

        {step === 'halo' && synced && (
          <section className="onboard-step onboard-payoff" aria-label="Halo is connected">
            <HaloDraw size={80} />
            <h1 className="onboard-title">
              We found <span className="payoff-num">{found}</span> {data.items.length === 1 ? 'assignment' : 'assignments'}
              {finds > 0 ? (
                <>
                  {' '}
                  and <span className="payoff-num">{foundPosts}</span> {finds === 1 ? 'thing' : 'things'} your professors only mentioned in announcements.
                </>
              ) : (
                '.'
              )}
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
            <TrialOffer
              variant="card"
              lead={
                finds > 0
                  ? 'Max already found what your professors only said in announcements. Keep it reading, plan your studying, and ask what to do next.'
                  : posts > 0
                    ? `Your professors have posted ${posts} announcement${posts === 1 ? '' : 's'}. Max reads every one for the requirements they only said there, plans your studying, and answers what to do next.`
                    : undefined
              }
            />
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={finish}>
                Show me my day
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
