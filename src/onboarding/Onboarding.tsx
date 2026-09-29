import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { SignIn } from '../auth/SignIn';
import { pendingFriend } from '../auth/referral';
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
import { Compare, Offer } from './PlanChoice';
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

type Screen = 'bar' | 'drag' | 'open' | 'wait' | 'p-copy' | 'p-save' | 'p-edit' | 'p-open' | 'p-wait' | IPadScreen;
const DESKTOP: Screen[] = ['bar', 'drag', 'open', 'wait'];
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

/**
 * Whether the bookmarks bar is showing, from the height of the browser's own chrome around the page: tabs and toolbar
 * alone are about 80px; with the bookmarks bar about 110. Unknown in full screen or a window too odd to tell.
 */
export function barGuess(outer: number, inner: number): 'shown' | 'hidden' | 'unknown' {
  const chrome = outer - inner;
  if (chrome < 50 || chrome > 220) return 'unknown';
  return chrome >= 100 ? 'shown' : 'hidden';
}

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
  const { auth, profile, tier, loading } = useAccount();
  const { navigate } = useRoute();
  const tz = data.settings.timezone;
  const ob = data.settings.onboarding as OnboardingState;
  const step = ob.step;
  // An iPad gets its own setup and stays on the iPad (2026-09-29); an iPad that started on the phone steps keeps them.
  const path = ob.path ?? (isIPad() ? 'ipad' : isPhoneDevice() ? 'phone' : 'desktop');
  const screens: Screen[] = path === 'ipad' ? ipadScreens() : path === 'phone' ? PHONE : DESKTOP;
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
  const skipAll = () => {
    track(step, 'skip');
    set({ skippedAt: new Date().toISOString() });
    navigate('now');
  };
  const onTrial = trialState(profile) === 'active';
  const gift = friendGift(profile);
  const finish = () => {
    track('payoff', 'complete');
    pixel('CompleteRegistration');
    const now = new Date().toISOString();
    set({ step: 'done', doneAt: now });
    // The welcome for Max (colour, study plan) follows the tour on its own; see onboarding/Upgrade.tsx.
    navigate('now');
  };

  // The plan choice is for someone who can still take the trial: signed in, never had it, not a friend's guest.
  const choosing = auth.configured && !!auth.session && !gift && !pendingFriend() && trialState(profile) === 'available';
  // The account step passes itself the moment someone is signed in (including coming back from the email link).
  useEffect(() => {
    if (step === 'account' && (!auth.configured || auth.session)) set({ step: 'compare' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, auth.configured, auth.session]);
  // Nothing to choose (a friend's link, a trial already used or running, a paid plan, no accounts on this build):
  // straight on to Halo. Waits for the profile, so a new account is never sent past its own offer.
  useEffect(() => {
    if ((step === 'compare' || step === 'offer') && !loading && !choosing) set({ step: 'halo' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading, choosing]);

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
  const freePath = step === 'syllabus' || (synced && !can('haloManualSync', tier) && !ob.path);
  const labels = auth.configured ? ['Welcome', 'Account', 'Your plan', freePath ? 'Syllabi' : 'Connect Halo', 'Your classes'] : ['Welcome', 'Connect Halo', 'Your classes'];
  const at = auth.configured
    ? synced ? 4 : step === 'welcome' ? 0 : step === 'account' ? 1 : step === 'compare' || step === 'offer' ? 2 : 3
    : synced ? 2 : step === 'welcome' ? 0 : 1;

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="onboard-inner">
        <header className="onboard-head">
          <span className="onboard-count">
            Step {at + 1} of {labels.length}: {labels[at]}
          </span>
          <span className="onboard-progress" aria-hidden>
            {labels.map((s, i) => (
              <i key={s} data-done={i < at} data-current={i === at} />
            ))}
          </span>
          {!synced && (
            <button type="button" className="diff-toggle onboard-skip" onClick={skipAll}>
              Skip for now
            </button>
          )}
        </header>

        {step === 'welcome' && !synced && <Welcome onStart={() => go(auth.configured && !auth.session ? 'account' : auth.configured ? 'compare' : 'halo')} signedOut={auth.configured && !auth.session} />}

        {step === 'account' && !synced && (
          <section className="onboard-step" aria-label="Sign up">
            <h1 className="onboard-title">Make your account.</h1>
            <p className="onboard-text">{pendingFriend() ? 'Your friend link gives you Max free. No card.' : 'Free to start. No card.'} An email and a password, or Google.</p>
            <SignIn auth={auth} title="Sign up" />
            <p className="hint">
              <button type="button" className="hero-inline" onClick={() => go('halo')}>
                Not now, keep everything on this device
              </button>
            </p>
          </section>
        )}

        {step === 'compare' && !synced && choosing && <Compare onNext={() => go('offer')} />}
        {step === 'offer' && !synced && choosing && <Offer onStarted={() => go('halo')} onFree={() => go('syllabus')} />}
        {step === 'syllabus' && !synced && <SyllabusStep onTrial={() => go('offer')} canTry={choosing || trialState(profile) === 'available'} />}

        {step === 'halo' && !synced && path === 'desktop' && (
          <DesktopHalo screen={screen} show={show} switchPath={switchPath} onPaste={() => setPaste(true)} />
        )}
        {step === 'halo' && !synced && path === 'phone' && <PhoneHalo screen={screen} show={show} switchPath={switchPath} onPaste={() => setPaste(true)} />}
        {step === 'halo' && !synced && path === 'ipad' && <IPadHalo screen={screen as IPadScreen} show={show} onPaste={() => setPaste(true)} onTested={() => actions.updateSettings({ syncHow: deviceSyncHow() })} />}

        {/* A sync that lands on any screen (a student who clicked the bookmark early) goes straight to the payoff. */}
        {synced && <Payoff onStart={finish} schedule={schedule} today={today} tz={tz} gift={gift} onTrial={onTrial} reads={can('announcementAI', tier)} />}
      </div>
      {paste && <HaloImport onClose={() => setPaste(false)} />}
    </div>
  );
}

function Welcome({ onStart, signedOut }: { onStart: () => void; signedOut: boolean }) {
  const friend = pendingFriend();
  return (
    <section className="onboard-step" aria-label="Welcome">
      <HaloDraw size={72} />
      <p className="eyebrow">{friend ? 'A friend sent you Halo+' : 'The planner built for Halo'}</p>
      <h1 className="onboard-title">See your real assignments in about two minutes.</h1>
      <p className="onboard-text">Halo+ pulls your classes, due dates and announcements from Halo and shows the one thing to do next. It never asks for your GCU password.</p>
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

function DesktopHalo({ screen, show, switchPath, onPaste }: { screen: Screen; show: (s: Screen) => void; switchPath: () => void; onPaste: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const keys = isMac() ? '⌘ Command + Shift + B' : 'Ctrl + Shift + B';
  const safari = isSafari();

  // The bar step: skipped on its own when the bar already shows; advanced on its own when it appears.
  const base = useRef({ outer: typeof window === 'undefined' ? 0 : window.outerHeight, inner: typeof window === 'undefined' ? 0 : window.innerHeight });
  useEffect(() => {
    if (screen !== 'bar') return;
    if (barGuess(window.outerHeight, window.innerHeight) === 'shown') {
      show('drag');
      return;
    }
    base.current = { outer: window.outerHeight, inner: window.innerHeight };
    const onResize = () => {
      const now = { outer: window.outerHeight, inner: window.innerHeight };
      if (barAppeared(base.current, now) || barGuess(now.outer, now.inner) === 'shown') show('drag');
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
      {screen === 'bar' && (
        <section className="onboard-step" aria-label="Show your bookmarks bar">
          <h1 className="onboard-title">Show your bookmarks bar.</h1>
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
function Payoff({ onStart, schedule, today, tz, gift, onTrial, reads }: { onStart: () => void; schedule: ReturnType<typeof useStore>['schedule']; today: string; tz: string; gift: { from: string; until: string } | null; onTrial: boolean; reads: boolean }) {
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
            ? `Reading your announcements: ${progress.done} of ${progress.total}. ${total} found so far.`
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
            About {fmtMinutes(plan.remainingMinutes)}, spread out: {plan.sessions.map((x) => x.label).join(', ')}.
          </p>
        </div>
      )}

      <div className="onboard-actions">
        <button type="button" className="btn primary" onClick={onStart}>
          Start here
        </button>
      </div>
      {gift ? <p className="hint">Max, free from {gift.from} through {fmtDate(dateOf(gift.until, tz), 'short')}.</p> : onTrial ? <p className="hint">Your free week of Max is on. {TRIAL.after}</p> : !reads ? <p className="hint">You're on Free: classes from their syllabi, added by you. Halo sync, announcements and the study tools are Max; try it free for 7 days any time from You.</p> : null}
    </section>
  );
}
