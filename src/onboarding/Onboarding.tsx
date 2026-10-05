import { InviteButton } from '../referral/Invite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { installedVersion, useExtension } from '../config/extension';
import { IconCheck } from '../components/Icons';
import { useAccount } from '../auth/AccountContext';
import { SignIn } from '../auth/SignIn';
import { pendingFriend, pendingRef } from '../auth/referral';
import { CourseChip } from '../components/CourseChip';
import { HaloDraw } from '../components/HaloDraw';
import { friendGift, trialState } from '../config/flags';
import { TRIAL } from '../config/tiers';
import { dateOf, diffDays, fmtDate, fmtMinutes } from '../domain/dates';
import { nextTestPlan } from '../domain/exam';
import { shortLine } from '../domain/shortLine';
import type { Item } from '../domain/types';
import { useReadStatus } from '../halo/backgroundRead';
import { announceDb } from '../halo/announce';
import { pixel } from '../analytics/pixel';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { HaloImport } from '../views/HaloImport';
import { BookmarkButton, useBookmarkHref } from '../views/BookmarkButton';
import { type OnboardingState, type Step } from './state';
import { Compare, Gift } from './PlanChoice';
import { HomeScreenAsk, isPhoneLike, NotifyAsk } from './ComeBack';
import { isStandalone as isStandaloneApp } from '../notify/push';
import { ChromeMenuPicture, HaloBarPicture, ShortcutKeyboard } from './Keyboard';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { deviceSyncHow } from '../halo/syncHow';
import { IPadHalo, ipadScreens, type IPadScreen } from './IPadHalo';
import { TouchPicture, type TouchBrowser } from './TouchPictures';
import { isChromeIOS, isIOSDevice, isIPad, isMacComputer, isTouchDevice } from '../ui/device';
import { ImportSyllabus } from '../views/ImportSyllabus';
import { can } from '../config/flags';
import { track } from './track';

/**
 * The first two minutes. Goal: a GCU student who has never seen the app sees their own real assignments without
 * asking anyone. One action per screen, short words, a progress line, and every screen saved so a student who leaves
 * comes back exactly where they were. Nothing is asked that Halo already knows (classes, times, the time zone).
 *
 * The bookmark is the hard part, so it is split into single moves: show the bookmarks bar (detected), drag the button
 * (the drop is detected), open Halo (a button that opens it), click the bookmark (the sync is detected by its arrival,
 * with the likely fixes after a minute). A phone gets its own path, since a phone has no bookmarks bar to drag to.
 */

type Screen = 'ext' | 'ext-wait' | 'bar' | 'drag' | 'open' | 'wait' | 'p-copy' | 'p-save' | 'p-edit' | 'p-open' | 'p-wait' | IPadScreen;
const DESKTOP: Screen[] = ['bar', 'drag', 'open', 'wait'];
/** Desktop Chrome, Edge or Brave with the store address set: the extension first, the bookmark one tap away (2026-10-05). */
const DESKTOP_EXT: Screen[] = ['ext', 'ext-wait', ...DESKTOP];
const PHONE: Screen[] = ['p-copy', 'p-save', 'p-edit', 'p-open', 'p-wait'];
/** A minute with nothing arriving is when a student starts to wonder; that is when the fixes show. */
export const WAIT_MS = 60_000;

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);
/** Phones and iPads (an iPad can say it is a Mac; ui/device.ts tells them apart by the touch screen). */
export const isPhoneDevice = () => isTouchDevice();
export const isIOS = () => isIOSDevice();
export const isSafari = () => /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua());
const isMac = () => isMacComputer();
/** Which touch browser's steps and pictures to show. */
const touchBrowser = (): TouchBrowser => (isChromeIOS() ? 'chrome-ios' : isIOSDevice() ? 'safari' : 'android');

/** The bar appearing shrinks the page by about 25 to 40px while the window keeps its size. */
export const barAppeared = (before: { outer: number; inner: number }, after: { outer: number; inner: number }) => Math.abs(after.outer - before.outer) <= 2 && before.inner - after.inner >= 18 && before.inner - after.inner <= 60;

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

/** The next big deadline: the most points due in the next two weeks, the soonest on a tie. */
export function nextBig(items: Item[], today: string, tz: string): Item | null {
  const soon = items.filter((i) => i.status !== 'done' && i.points > 0 && i.type !== 'participation' && dateOf(i.dueAt, tz) >= today && diffDays(today, dateOf(i.dueAt, tz)) <= 14);
  return soon.sort((a, b) => b.points - a.points || a.dueAt.localeCompare(b.dueAt))[0] ?? null;
}

export function Onboarding() {
  const { data, schedule, actions, today } = useStore();
  const { auth, profile, tier, loading, planKnown } = useAccount();
  const { navigate } = useRoute();
  const tz = data.settings.timezone;
  const ob = data.settings.onboarding as OnboardingState;
  const step = ob.step;
  // An iPad gets its own setup and stays on the iPad (2026-09-29); an iPad that started on the phone steps keeps them.
  const path = ob.path ?? (isIPad() ? 'ipad' : isPhoneDevice() ? 'phone' : 'desktop');
  const ext = useExtension();
  const extFirst = path === 'desktop' && !!ext.url && !!ext.browser && !ext.installed;
  const screens: Screen[] = path === 'ipad' ? ipadScreens() : path === 'phone' ? PHONE : extFirst ? DESKTOP_EXT : DESKTOP;
  const screen = (screens as string[]).includes(ob.screen ?? '') ? (ob.screen as Screen) : screens[0];
  const [paste, setPaste] = useState(false);

  const set = (patch: Partial<OnboardingState>) => actions.updateSettings({ onboarding: { ...ob, ...patch } });
  const go = (next: Step) => {
    track(step, 'complete');
    track(next, 'enter');
    set({ step: next });
  };
  const show = (s: Screen) => {
    track(`halo:${screen}`, 'complete');
    track(`halo:${s}`, 'enter');
    set({ screen: s, path });
  };
  const switchPath = () => set({ path: path === 'phone' ? 'desktop' : 'phone', screen: null });
  // Opened from "Set up": only the Halo steps, and "Not now" just closes them.
  const focus = ob.focus === 'halo';
  // Skipping is safe (2026-10-01): one line on how to come back, then Now. The free week keeps running either way.
  const [leaving, setLeaving] = useState(false);
  const leave = () => {
    const now = new Date().toISOString();
    // One write: the skip, and (on the free week) the Max welcome marked seen, as finishing does. Skipping used to land
    // on "Welcome to Max", three more setup screens about classes that were not there yet (2026-10-01).
    const seen = trialState(profile) === 'active' && !data.settings.upgradeSeen?.max ? { upgradeSeen: { ...(data.settings.upgradeSeen ?? {}), max: now, plus: data.settings.upgradeSeen?.plus ?? now } } : {};
    actions.updateSettings({ onboarding: { ...ob, skippedAt: now, focus: null }, ...seen });
    navigate('now');
  };
  const skipAll = () => {
    track(step, 'skip');
    if (focus) return leave();
    setLeaving(true);
  };
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(leave, 4500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);
  const onTrial = trialState(profile) === 'active';
  const gift = friendGift(profile);
  const finish = () => {
    track('payoff', 'complete');
    pixel('CompleteRegistration');
    const now = new Date().toISOString();
    set({ step: 'done', doneAt: now, focus: null });
    // A student on the welcome gift has just been shown what Max does (the gift screen) and their study plan (the
    // payoff): the three-screen "Welcome to Max" after the tour said it all a third time, twelve screens in, before
    // they ever reached Now (walkthrough, 2026-09-30). It stays for a real upgrade; the colour is under You, Display.
    if (onTrial && !data.settings.upgradeSeen?.max) actions.updateSettings({ upgradeSeen: { ...(data.settings.upgradeSeen ?? {}), max: now, plus: data.settings.upgradeSeen?.plus ?? now } });
    // The welcome for a paid plan (colour, study plan) follows the tour on its own; see onboarding/Upgrade.tsx.
    navigate('now');
  };

  // After the first sync (2026-09-29): the payoff, then a morning note, then on a phone the Home Screen. Skipped where
  // there is nothing to ask: no accounts on this build, or notifications already on.
  const after = ob.after ?? 'payoff';
  const afterPayoff = () => {
    const pushOn = !!data.settings.reminders?.pushEnabled;
    if (auth.configured && auth.session && !pushOn) set({ after: 'notify' });
    else if (isPhoneLike() && !isStandaloneApp()) set({ after: 'home' });
    else finish();
  };
  // The welcome (2026-09-29): every new account has Max for 7 days from sign-up, so a new student sees the fifteen
  // seconds and then the gift. A friend's guest, a paid plan, or a build without accounts goes straight to Halo.
  const welcoming = auth.configured && !!auth.session && !gift && !pendingFriend() && trialState(profile) === 'active' && !profile?.friendFrom;
  // The account step passes itself the moment someone is signed in (including coming back from the email link).
  useEffect(() => {
    if (step === 'account' && (!auth.configured || auth.session)) set({ step: focus ? 'halo' : 'compare' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, auth.configured, auth.session]);
  // Nothing to choose (a friend's link, a trial already used or running, a paid plan, no accounts on this build):
  // straight on to Halo. Waits for the profile, so a new account is never sent past its own offer.
  useEffect(() => {
    if ((step === 'compare' || step === 'offer') && !loading && !welcoming) set({ step: 'halo' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading, welcoming]);

  const synced = data.courses.length > 0;
  // Record the arrival once, so the admin screen sees who got as far as their own classes.
  const logged = useRef(false);
  useEffect(() => {
    if (synced && step === 'halo' && !logged.current) {
      logged.current = true;
      track('payoff', 'enter');
    }
  }, [synced, step]);

  // The free path adds classes from syllabi; everyone else connects Halo.
  const freePath = step === 'syllabus' || (synced && planKnown && !can('haloManualSync', tier) && !ob.path);
  const labels = auth.configured ? ['Welcome', 'Account', 'Your plan', freePath ? 'Syllabi' : 'Connect Halo', 'Your classes'] : ['Welcome', 'Connect Halo', 'Your classes'];
  const at = auth.configured
    ? synced ? 4 : step === 'welcome' ? 0 : step === 'account' ? 1 : step === 'compare' || step === 'offer' ? 2 : 3
    : synced ? 2 : step === 'welcome' ? 0 : 1;

  if (leaving)
    return (
      <div className="onboard" role="dialog" aria-modal="true" aria-label="Setup skipped">
        <div className="onboard-inner">
          <section className="onboard-step skip-note" role="status">
            <h1 className="onboard-title">No problem.</h1>
            <p className="onboard-text">
              Tap <b className="skip-note-pill">Set up</b> {window.matchMedia?.('(max-width: 639px)').matches ? 'at the top' : 'in the top right'} whenever you're ready.
            </p>
            {trialState(profile) === 'active' && !profile?.friendFrom && <p className="hint">Your free week of Max is already running.</p>}
            <button type="button" className="btn primary" onClick={leave}>
              Go to Now
            </button>
          </section>
        </div>
      </div>
    );

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label={focus ? 'Connect Halo' : 'Welcome'}>
      <div className="onboard-inner">
        <header className="onboard-head">
          {focus ? (
            <span className="onboard-count">{step === 'account' ? 'Sign up, then connect Halo' : 'Connect Halo'}</span>
          ) : (
            <>
              <span className="onboard-count">
                Step {at + 1} of {labels.length}: {labels[at]}
              </span>
              <span className="onboard-progress" aria-hidden>
                {labels.map((s, i) => (
                  <i key={s} data-done={i < at} data-current={i === at} />
                ))}
              </span>
            </>
          )}
          {!synced && (
            <button type="button" className="diff-toggle onboard-skip" onClick={skipAll}>
              {focus ? 'Not now' : 'Skip for now'}
            </button>
          )}
        </header>

        {step === 'welcome' && !synced && <Welcome onStart={() => go(auth.configured && !auth.session ? 'account' : auth.configured ? 'compare' : 'halo')} signedOut={auth.configured && !auth.session} />}

        {step === 'account' && !synced && (
          <section className="onboard-step" aria-label="Sign up">
            <h1 className="onboard-title">Make your account.</h1>
            <p className="onboard-text">{pendingFriend() ? 'Your friend link gives you Max free. No card.' : 'Free to start. No card.'}</p>
            <SignIn auth={auth} title="Sign up" />
            <p className="hint">
              <button type="button" className="hero-inline" onClick={() => go('halo')}>
                Not now, keep everything on this device
              </button>
            </p>
          </section>
        )}

        {step === 'compare' && !synced && welcoming && <Compare onNext={() => go('offer')} />}
        {step === 'offer' && !synced && welcoming && <Gift onNext={() => go('halo')} invited={!!profile?.referredBy || !!pendingRef()} />}
        {step === 'syllabus' && !synced && <SyllabusStep onTrial={() => go('halo')} canTry={trialState(profile) === 'available'} />}

        {step === 'halo' && !synced && path === 'desktop' && (
          <DesktopHalo screen={screen} show={show} switchPath={switchPath} onPaste={() => setPaste(true)} storeUrl={ext.url} browser={ext.browser} />
        )}
        {step === 'halo' && !synced && path === 'phone' && <PhoneHalo screen={screen} show={show} switchPath={switchPath} onPaste={() => setPaste(true)} />}
        {step === 'halo' && !synced && path === 'ipad' && <IPadHalo screen={screen as IPadScreen} show={show} onPaste={() => setPaste(true)} onTested={() => actions.updateSettings({ syncHow: deviceSyncHow() })} />}

        {/* A sync that lands on any screen (a student who clicked the bookmark early) goes straight to the payoff. */}
        {synced && after === 'payoff' && <Payoff onStart={afterPayoff} schedule={schedule} today={today} tz={tz} gift={gift} onTrial={onTrial} reads={can('announcementAI', tier)} invited={!!profile?.referredBy || !!pendingRef()} />}
        {synced && after === 'notify' && <NotifyAsk onNext={() => (isPhoneLike() ? set({ after: 'home' }) : finish())} />}
        {synced && after === 'home' && <HomeScreenAsk onNext={finish} />}
      </div>
      {paste && <HaloImport onClose={() => setPaste(false)} />}
    </div>
  );
}

function Welcome({ onStart, signedOut }: { onStart: () => void; signedOut: boolean }) {
  const friend = pendingFriend();
  // An invite link promised "you both get Plus free for 30 days": the first screen says it arrived.
  const invited = !friend && !!pendingRef();
  return (
    <section className="onboard-step" aria-label="Welcome">
      <HaloDraw size={72} />
      <p className="eyebrow">{friend ? 'A friend sent you Halo+' : invited ? 'A friend invited you' : 'The planner built for Halo'}</p>
      <h1 className="onboard-title">See your real assignments in about two minutes.</h1>
      <p className="onboard-text">Halo+ pulls your classes, due dates and announcements from Halo and shows the one thing to do next. It never asks for your GCU password.</p>
      {invited && <p className="onboard-text welcome-invited">Your invite is saved: a free week of Max, then 30 days of Plus free. Your friend gets 30 days of Plus too.</p>}
      <div className="onboard-actions">
        <button type="button" className="btn primary" onClick={onStart}>
          Start
        </button>
      </div>
      {signedOut && (
        <p className="hint">
          Already have an account? <a href="#/login">Log in</a>
        </p>
      )}
      <p className="hint onboard-foot">Not affiliated with Grand Canyon University.</p>
    </section>
  );
}

/** The Free path: classes come from their syllabus PDFs. One button, and the trial one tap away if they change their mind. */
function SyllabusStep({ onTrial, canTry }: { onTrial: () => void; canTry: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="onboard-step" aria-label="Upload a syllabus">
      <h1 className="onboard-title">Add your classes from their syllabi.</h1>
      <p className="onboard-text">Download each class's syllabus PDF from Halo and drop it in. Every assignment in it lands on your calendar.</p>
      <button type="button" className="btn primary block onboard-big" onClick={() => setOpen(true)}>
        Upload a syllabus
      </button>
      <p className="hint">You're on Free. Nothing is synced from Halo and nothing charges.</p>
      {canTry && (
        <p className="hint">
          Changed your mind?{' '}
          <button type="button" className="hero-inline" onClick={onTrial}>
            {TRIAL.offer}
          </button>
        </p>
      )}
      {open && <ImportSyllabus onClose={() => setOpen(false)} />}
    </section>
  );
}

/** The mini browser the demos draw in: three dots, an address, optionally the bookmarks bar. */
function MiniBrowser({ bar, children, label, slot = true }: { bar: boolean; children?: React.ReactNode; label: string; /** Show the bookmark already in the bar. */ slot?: boolean }) {
  return (
    <div className="drag-demo" role="img" aria-label={label}>
      <div className="demo-chrome">
        <span className="demo-dot" />
        <span className="demo-dot" />
        <span className="demo-dot" />
        <span className="demo-url">halo-plus</span>
      </div>
      {bar && (
        <div className="demo-bar">
          <span className="demo-bm" />
          <span className="demo-bm" />
          {slot && (
            <span className="demo-slot">
              <i>{BOOKMARK_NAME}</i>
            </span>
          )}
        </div>
      )}
      <div className="demo-page">{children}</div>
    </div>
  );
}

function DesktopHalo({ screen, show, switchPath, onPaste, storeUrl, browser }: { screen: Screen; show: (s: Screen) => void; switchPath: () => void; onPaste: () => void; storeUrl: string | null; browser: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  const keys = isMac() ? '⌘ Command + Shift + B' : 'Ctrl + Shift + B';
  const safari = isSafari();

  // The bar step is always shown (George, 2026-09-30): a page cannot reliably tell whether the bar is showing, and
  // guessing skipped it for people whose bar was hidden. It only moves on by itself when the student makes the bar
  // appear (the page shrinks by a bar's height while the window keeps its size).
  const base = useRef({ outer: typeof window === 'undefined' ? 0 : window.outerHeight, inner: typeof window === 'undefined' ? 0 : window.innerHeight });
  useEffect(() => {
    if (screen !== 'bar') return;
    base.current = { outer: window.outerHeight, inner: window.innerHeight };
    const onResize = () => {
      const now = { outer: window.outerHeight, inner: window.innerHeight };
      if (barAppeared(base.current, now)) show('drag');
      else base.current = now;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const { actions } = useStore();
  const openHalo = () => {
    actions.updateSettings({ syncHow: 'desktop' });
    window.open('https://halo.gcu.edu/', '_blank', 'noopener');
    show('wait');
  };

  return (
    <>
      {screen === 'ext' && storeUrl && (
        <section className="onboard-step" aria-label="Add the extension">
          <p className="eyebrow">Connect Halo</p>
          <h1 className="onboard-title">Connect Halo the easy way.</h1>
          <p className="onboard-text">Add the Halo+ extension to {browser ?? 'Chrome'}. It reads Halo in the background and syncs every 3 hours, so you never have to click anything. It never sees your password.</p>
          <a className="btn primary block onboard-big" href={storeUrl} target="_blank" rel="noopener" onClick={() => show('ext-wait')}>
            Add to {browser ?? 'Chrome'}
          </a>
          <p className="hint">
            It opens the Chrome Web Store: press Add to {browser ?? 'Chrome'}, then come back here.{' '}
            <button type="button" className="hero-inline" onClick={() => show('bar')}>
              Use the {BOOKMARK_NAME} bookmark instead
            </button>
          </p>
        </section>
      )}
      {screen === 'ext-wait' && <ExtensionWait browser={browser ?? 'Chrome'} onBookmark={() => show('bar')} onPaste={onPaste} />}
      {screen === 'bar' && (
        <section className="onboard-step" aria-label="Show your bookmarks bar">
          <h1 className="onboard-title">Show your bookmarks bar.</h1>
          <button type="button" className="btn small bar-already" onClick={() => show('drag')}>
            My bookmarks bar is already showing
          </button>
          <ShortcutKeyboard mac={isMac()} />
          <p className="kb-instruction">Hold down the first two keys, then tap B.</p>
          <p className="hint">{keys}. This page moves on by itself when the bar appears.</p>
          <button type="button" className="btn primary block onboard-big" onClick={() => show('drag')}>
            I see my bookmarks bar
          </button>
          <div className="bar-or">
            <p className="hint">
              <b>Or, without the keyboard:</b> click the three dots in the top right of Chrome, then <b>Bookmarks and lists</b>, then <b>Show bookmarks bar</b>.
            </p>
            <ChromeMenuPicture />
          </div>
        </section>
      )}

      {screen === 'drag' && (
        <section className="onboard-step" aria-label="Drag the bookmark">
          <h1 className="onboard-title">Drag this button up to your bookmarks bar.</h1>
          <MiniBrowser bar label={`The ${BOOKMARK_NAME} button being dragged up into the bookmarks bar.`}>
            <span className="demo-pill">{BOOKMARK_NAME}</span>
            <span className="demo-cursor" />
          </MiniBrowser>
          <p className="onboard-drag">
            <BookmarkButton onClickNote={setNote} onDropped={() => show('open')} />
          </p>
          {note && (
            <p className="hint" role="status">
              {note}
            </p>
          )}
          {safari && <p className="hint">In Safari, drag it to the Favorites bar. Chrome or Edge is easier if you have one.</p>}
          <button type="button" className="btn primary block onboard-big" onClick={() => show('open')}>
            It's in my bookmarks bar
          </button>
          <p className="hint">
            <button type="button" className="hero-inline" onClick={() => show('bar')}>
              I can't see my bookmarks bar
            </button>
          </p>
          <p className="hint">
            <button type="button" className="hero-inline" onClick={switchPath}>
              On a phone? Use the phone steps
            </button>
          </p>
        </section>
      )}

      {screen === 'open' && (
        <section className="onboard-step" aria-label="Open Halo">
          <HaloBarPicture />
          <h1 className="onboard-title">On Halo, click {BOOKMARK_NAME} in your bookmarks bar.</h1>
          <p className="onboard-text">Halo opens in a new tab. Log in there if it asks.</p>
          <button type="button" className="btn primary block onboard-big" onClick={openHalo}>
            Open Halo
          </button>
          <p className="hint">
            <button type="button" className="hero-inline" onClick={() => show('drag')}>
              Back
            </button>
          </p>
        </section>
      )}

      {screen === 'wait' && <Waiting phone={false} show={show} onPaste={onPaste} />}
    </>
  );
}

function PhoneHalo({ screen, show, switchPath, onPaste }: { screen: Screen; show: (s: Screen) => void; switchPath: () => void; onPaste: () => void }) {
  const { actions } = useStore();
  const href = useBookmarkHref('short');
  const browser = touchBrowser();
  const ipad = isIPad();
  const [err, setErr] = useState<string | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      show('p-save');
    } catch {
      setErr('Your phone did not allow copying. Press and hold the box below, Select All, Copy.');
    }
  };
  return (
    <>
      {screen === 'p-copy' && (
        <section className="onboard-step" aria-label="Copy the bookmark">
          <h1 className="onboard-title">Copy the {BOOKMARK_NAME} bookmark.</h1>
          <p className="onboard-text">On {ipad ? 'an iPad' : 'a phone'} you make the bookmark by hand, once, with a few taps. No keyboard shortcuts, nothing to drag.</p>
          <button type="button" className="btn primary block onboard-big" onClick={() => void copy()}>
            Copy it
          </button>
          {err && (
            <>
              <p className="hint" role="alert">
                {err}
              </p>
              <textarea className="halo-paste" readOnly value={href} rows={4} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn small" onClick={() => show('p-save')}>
                I copied it
              </button>
            </>
          )}
          {!ipad && (
            <p className="hint">
              Easier on a computer? Set it up there once and your phone gets everything through your account.{' '}
              <button type="button" className="hero-inline" onClick={switchPath}>
                Show the computer steps
              </button>
            </p>
          )}
        </section>
      )}
      {screen === 'p-save' && (
        <section className="onboard-step" aria-label="Bookmark this page">
          <h1 className="onboard-title">Bookmark this page.</h1>
          <ol className="phone-steps">
            {browser === 'safari' ? (
              <>
                <li>
                  Tap <b>Share</b> <span aria-hidden>(the square with an arrow{ipad ? ', top right' : ''})</span>.
                </li>
                <li>
                  Tap <b>Add Bookmark</b>, then <b>Save</b>.
                </li>
              </>
            ) : browser === 'chrome-ios' ? (
              <>
                <li>
                  Tap <b>⋯</b> <span aria-hidden>({ipad ? 'top right' : 'bottom right'})</span>.
                </li>
                <li>
                  Tap <b>Add to Bookmarks</b>.
                </li>
              </>
            ) : (
              <>
                <li>
                  Tap <b>⋮</b> at the top right.
                </li>
                <li>
                  Tap the <b>☆ star</b>.
                </li>
              </>
            )}
          </ol>
          <TouchPicture browser={browser} shot="add" />
          <button type="button" className="btn primary block onboard-big" onClick={() => show('p-edit')}>
            Done
          </button>
        </section>
      )}
      {screen === 'p-edit' && (
        <section className="onboard-step" aria-label="Paste the address">
          <h1 className="onboard-title">Swap its address for the one you copied.</h1>
          <ol className="phone-steps">
            {browser === 'safari' ? (
              <>
                <li>
                  Open <b>Bookmarks</b> <span aria-hidden>(the open book)</span> and tap <b>Edit</b>.
                </li>
                <li>Tap the bookmark you just made.</li>
                <li>
                  Name it <b>{BOOKMARK_NAME}</b> (or just Sync Halo). Clear the address and paste.
                </li>
              </>
            ) : browser === 'chrome-ios' ? (
              <>
                <li>
                  Tap <b>⋯</b>, then <b>Bookmarks</b>.
                </li>
                <li>
                  Press and hold the new bookmark, tap <b>Edit Bookmark</b>.
                </li>
                <li>
                  Name it <b>{BOOKMARK_NAME}</b> (or just Sync Halo). Clear the URL and paste.
                </li>
              </>
            ) : (
              <>
                <li>
                  Tap <b>⋮</b>, then <b>Bookmarks</b>.
                </li>
                <li>
                  Press and hold the new bookmark, tap <b>Edit</b>.
                </li>
                <li>
                  Name it <b>{BOOKMARK_NAME}</b> (or just Sync Halo). Clear the URL and paste.
                </li>
              </>
            )}
          </ol>
          <TouchPicture browser={browser} shot="edit" />
          <button type="button" className="btn primary block onboard-big" onClick={() => show('p-open')}>
            Done
          </button>
          <p className="hint">
            <button type="button" className="hero-inline" onClick={() => show('p-copy')}>
              Copy it again
            </button>
          </p>
        </section>
      )}
      {screen === 'p-open' && (
        <section className="onboard-step" aria-label="Open Halo">
          <h1 className="onboard-title">Open Halo and log in.</h1>
          <p className="onboard-text">Then tap {BOOKMARK_NAME} from your bookmarks. This page shows you how.</p>
          <button
            type="button"
            className="btn primary block onboard-big"
            onClick={() => {
              actions.updateSettings({ syncHow: deviceSyncHow() });
              window.open('https://halo.gcu.edu/', '_blank', 'noopener');
              show('p-wait');
            }}
          >
            Open Halo
          </button>
        </section>
      )}
      {screen === 'p-wait' && <Waiting phone show={show} onPaste={onPaste} />}
    </>
  );
}

/**
 * Waiting for the sync to arrive. Nothing to press: the tab notices the classes when they come (the bookmark returns to
 * this very tab). After a minute, the likely fixes, each one line.
 */
function Waiting({ phone, show, onPaste }: { phone: boolean; show: (s: Screen) => void; onPaste: () => void }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    // The screenshot script shortens the minute through local storage; nothing else sets it.
    let ms = WAIT_MS;
    try {
      ms = Number(localStorage.getItem('school-dashboard:onboard-wait-ms')) || WAIT_MS;
    } catch {
      /* storage unavailable */
    }
    const t = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, []);
  const ios = isIOS();
  const halo = () => window.open('https://halo.gcu.edu/', '_blank', 'noopener');
  return (
    <section className="onboard-step onboard-wait" aria-label="Waiting for Halo">
      {phone ? (
        <>
          <span className="wait-ring" aria-hidden>
            <HaloDraw size={64} />
          </span>
          <h1 className="onboard-title">{touchBrowser() === 'chrome-ios' ? `In Halo, tap ⋯, then Bookmarks, then ${BOOKMARK_NAME}.` : ios ? `In Halo, open Bookmarks and tap ${BOOKMARK_NAME}.` : `In Halo, type "Sync Halo" in the address bar and tap the ${BOOKMARK_NAME} bookmark.`}</h1>
          <TouchPicture browser={touchBrowser()} shot="run" />
          <p className="onboard-text">Do it in the Halo tab. Halo+ opens by itself with your classes, usually within 20 seconds.</p>
        </>
      ) : (
        <>
          <HaloBarPicture />
          <h1 className="onboard-title wait-title">Waiting for your sync…</h1>
          <p className="onboard-text">Go to your Halo tab and click {BOOKMARK_NAME}.</p>
          <p className="hint">This page moves on by itself when your classes arrive, usually within 20 seconds.</p>
        </>
      )}
      {late && (
        <div className="fixes" role="status">
          <p className="fixes-head">Nothing yet? One of these is usually it:</p>
          <ul>
            <li>
              <b>Not logged in to Halo.</b> Log in at halo.gcu.edu, then {phone ? 'tap' : 'click'} {BOOKMARK_NAME} again.{' '}
              <button type="button" className="hero-inline" onClick={halo}>
                Open Halo
              </button>
            </li>
            {phone ? (
              <>
                <li>
                  <b>It just opened this page.</b> The address wasn't swapped.{' '}
                  <button type="button" className="hero-inline" onClick={() => show('p-copy')}>
                    Redo the bookmark
                  </button>
                </li>
                {!ios && (
                  <li>
                    <b>Nothing happens from the bookmarks list.</b> On Android, run it from the address bar: type Sync Halo and tap the {BOOKMARK_NAME} bookmark.
                  </li>
                )}
                <li>
                  <b>A pop-up was blocked.</b> {ios ? 'Settings, Safari, turn off Block Pop-ups, then tap it again.' : 'Allow pop-ups for halo.gcu.edu when Chrome asks, then tap it again.'}
                </li>
              </>
            ) : (
              <>
                <li>
                  <b>{BOOKMARK_NAME} isn't in your bookmarks bar.</b>{' '}
                  <button type="button" className="hero-inline" onClick={() => show('drag')}>
                    Drag it again
                  </button>
                </li>
                <li>
                  <b>A pop-up was blocked.</b> Click the blocked-window icon at the right end of Halo's address bar, choose Always allow, click {BOOKMARK_NAME} again.
                </li>
                <li>
                  <b>Using Safari?</b> It blocks what the bookmark opens. Use Chrome or Edge, or allow pop-ups for halo.gcu.edu in Safari Settings, Websites.
                </li>
              </>
            )}
            <li>
              <b>Halo showed a box with a Copy button.</b> Copy it, then{' '}
              <button type="button" className="hero-inline" onClick={onPaste}>
                paste it here
              </button>
            </li>
          </ul>
        </div>
      )}
      <p className="hint">
        <button type="button" className="hero-inline" onClick={() => show(phone ? 'p-open' : 'open')}>
          Back
        </button>
      </p>
    </section>
  );
}

/**
 * The payoff: what arrived, counted up; what the announcements asked that the assignments don't say (live, while the
 * reader works); the next big deadline; and one button, Start here, that lands on Now.
 */

/** "today", "tomorrow" or "on Fri", from a session label ("Fri · 40m"). */
const whenSession = (label: string) => {
  const day = label.split(' · ')[0];
  return day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : `on ${day}`;
};

function Payoff({ onStart, schedule, today, tz, gift, onTrial, reads, invited = false }: { onStart: () => void; schedule: ReturnType<typeof useStore>['schedule']; today: string; tz: string; gift: { from: string; until: string } | null; onTrial: boolean; reads: boolean; invited?: boolean }) {
  const { data, courseById } = useStore();
  const reading = useReadStatus();
  const found = useCountUp(data.items.length);
  const finds = useMemo(
    () =>
      data.items
        .flatMap((i) => (i.requirements ?? []).filter((r) => r.source?.kind === 'announcement' && !r.done).map((r) => ({ id: r.id, text: shortLine(r.text), code: courseById.get(i.courseId)?.code ?? '' })))
        .slice(0, 3),
    [data.items, courseById],
  );
  const total = announcementFinds(data.items);
  const big = useMemo(() => nextBig(data.items, today, tz), [data.items, today, tz]);
  const plan = useMemo(() => nextTestPlan(data.items, schedule, data.settings, today), [data.items, schedule, data.settings, today]);
  const [posts, setPosts] = useState(0);
  useEffect(() => {
    let live = true;
    const ids = new Set(data.courses.map((c) => c.id));
    void announceDb
      .list()
      .then((l) => live && setPosts(l.filter((a) => ids.has(a.courseId)).length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data.courses]);
  const progress = reading.running && reading.progress ? reading.progress : null;

  return (
    <section className="onboard-step onboard-payoff" aria-label="Your classes are here">
      <HaloDraw size={72} />
      <h1 className="onboard-title">
        <span className="payoff-num">{found}</span> assignments from {data.courses.length} class{data.courses.length === 1 ? '' : 'es'}.
      </h1>
      <p className="onboard-chips">
        {data.courses.map((c) => (
          <CourseChip key={c.id} course={c} />
        ))}
      </p>

      {reads && <div className="payoff-block">
        <p className="eyebrow">What your professors only said in announcements</p>
        {finds.length > 0 ? (
          <ul className="payoff-finds">
            {finds.map((f) => (
              <li key={f.id}>
                <span className="mono muted">{f.code}</span> {f.text}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="hint">
          {progress
            ? `Reading your announcements, ${progress.done} of ${progress.total}…${total > 0 ? ` ${total} found so far.` : ''}`
            : total > finds.length
              ? `${total} in all, each on its assignment.`
              : total === 0 && posts > 0
                ? `Reading your ${posts} announcement${posts === 1 ? '' : 's'} now. What they ask lands on each assignment.`
                : total === 0
                  ? 'No announcements yet. When your professors post, Halo+ reads them for you.'
                  : 'Each one is on its assignment.'}
        </p>
      </div>}

      {big && (
        <div className="payoff-block">
          <p className="eyebrow">Next big deadline</p>
          <p className="onboard-text">
            <b>{big.label}</b>, {big.points} pts, due {fmtDate(dateOf(big.dueAt, tz), 'long')}.
          </p>
        </div>
      )}
      {plan && (
        <div className="payoff-block">
          <p className="eyebrow">Study plan for {plan.exam.label}</p>
          <p className="hint">
            {plan.sessions.length === 1
              ? `One ${fmtMinutes(plan.sessions[0].minutes)} session, ${whenSession(plan.sessions[0].label)}.`
              : `About ${fmtMinutes(plan.remainingMinutes)} in ${plan.sessions.length} sessions: ${plan.sessions.map((x) => x.label).join(', ')}.`}
          </p>
        </div>
      )}

      <div className="onboard-actions">
        <button type="button" className="btn primary" onClick={onStart}>
          Start here
        </button>
      </div>
      <div className="payoff-invite">
        <p className="onboard-text">Someone in your section would want this too.</p>
        <InviteButton label="Invite a friend" primary={false} />
        <p className="hint">You both get Plus free for 30 days, after your free weeks.</p>
      </div>
      {gift ? <p className="hint">Max, free from {gift.from} through {fmtDate(dateOf(gift.until, tz), 'short')}.</p> : onTrial ? <p className="hint">Your free week of Max is on. {invited ? "Then 30 days of Plus free, from your friend's invite." : TRIAL.after}</p> : !reads ? <p className="hint">You're on Free: classes from their syllabi, added by you. Halo sync, announcements and the study tools are Max; try it free for 7 days any time from You.</p> : null}
    </section>
  );
}

/**
 * After "Add to Chrome" in onboarding: waits for the extension to say hello from this page, asks it for the first
 * sync, and says to open Halo logged in. The sync lands in the account and the payoff takes over on its own. An
 * extension from before 0.5.2 starts its first sync within a minute of learning the plan; a logged-out Halo picks up
 * the moment Halo is opened logged in.
 */
function ExtensionWait({ browser, onBookmark, onPaste }: { browser: string; onBookmark: () => void; onPaste: () => void }) {
  const [version, setVersion] = useState<string | null>(installedVersion);
  const [late, setLate] = useState(false);
  const asked = useRef(false);
  useEffect(() => {
    if (version) return;
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      const v = installedVersion();
      if (v) setVersion(v);
      else if (Date.now() - t0 > 60_000) setLate(true);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [version]);
  useEffect(() => {
    if (!version || asked.current) return;
    asked.current = true;
    track('halo:ext-connected', 'complete');
    window.postMessage({ kind: 'halo-ext-first-sync' }, location.origin);
  }, [version]);
  if (!version)
    return (
      <section className="onboard-step" aria-label="Waiting for the extension" aria-live="polite">
        <h1 className="onboard-title">Press Add to {browser}, then come back.</h1>
        <p className="onboard-text">This page moves on by itself as soon as the extension is added.</p>
        <span className="ext-wait" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {late && (
          <p className="hint">
            <b>Not seeing it?</b> Reload this page: an extension added while a page is open shows up after a reload.{' '}
            <button type="button" className="hero-inline" onClick={() => window.location.reload()}>
              Reload
            </button>
          </p>
        )}
        <p className="hint">
          <button type="button" className="hero-inline" onClick={onBookmark}>
            Use the {BOOKMARK_NAME} bookmark instead
          </button>
        </p>
      </section>
    );
  return (
    <section className="onboard-step" aria-label="Open Halo" aria-live="polite">
      <span className="ext-check" aria-hidden>
        <IconCheck />
      </span>
      <h1 className="onboard-title">Now open Halo and log in.</h1>
      <p className="onboard-text">The extension is reading your classes in a quiet background tab. Halo+ fills in here by itself, usually in a minute or two.</p>
      <a className="btn primary block onboard-big" href="https://halo.gcu.edu/" target="_blank" rel="noopener">
        Open Halo ↗
      </a>
      <p className="hint">
        Already logged in? Just wait here.{' '}
        <button type="button" className="hero-inline" onClick={onPaste}>
          Paste a sync instead
        </button>
      </p>
    </section>
  );
}
