import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { useExtension } from '../config/extension';
import { trialState } from '../config/flags';
import { isIPad, isTouchDevice } from '../ui/device';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { useSyncAccess } from '../views/PlanWall';
import { fresh, type OnboardingState } from './state';

/**
 * The way back into setup for anyone who skipped it (George, 2026-10-01: a friend skipped onboarding, never synced,
 * and was lost; the only way back was buried in settings). Until the first Halo sync: a gold "Not synced yet · Set
 * up" pill in the top bar (a bar under it on phones), one Connect Halo card in place of an empty Now, and a line on
 * Calendar, Classes and Inbox. Set up opens only the Halo steps for this device, not the whole onboarding again.
 * The first sync sets lastPull, and all of it is gone for good.
 */
export function useNeverSynced(): boolean {
  const { data } = useStore();
  return !data.settings.lastPull && !data.courses.some((c) => c.haloClassId);
}

/** What Set up does for this student: the Halo steps; sign up first when there is no account; the plans when their plan has no sync. */
export function useOpenSetup(): { open: () => void; locked: boolean } {
  const { data, actions } = useStore();
  const { auth } = useAccount();
  const access = useSyncAccess();
  const { navigate } = useRoute();
  const signedOut = auth.configured && !auth.session && !auth.loading;
  const locked = !signedOut && !access.allowed;
  const open = () => {
    if (locked) return navigate('you', { s: 'plan', to: 'plus' });
    const ob = (data.settings.onboarding as OnboardingState | undefined) ?? fresh();
    actions.updateSettings({ onboarding: { ...ob, step: signedOut ? 'account' : 'halo', focus: 'halo', skippedAt: null, doneAt: null, after: null } });
  };
  return { open, locked };
}

/** Showing the way back: never synced, and setup is not already on screen. */
function useShowSetup(): boolean {
  const never = useNeverSynced();
  const { data } = useStore();
  const ob = data.settings.onboarding as OnboardingState | undefined;
  const open = !!ob && !ob.doneAt && !ob.skippedAt;
  return never && !open;
}

/** The pill in the top bar (wider screens). */
export function SetupPill() {
  const show = useShowSetup();
  const { open } = useOpenSetup();
  if (!show) return null;
  return (
    <button type="button" className="setup-pill" onClick={open}>
      <span className="setup-pill-dot" aria-hidden />
      Not synced yet · <b>Set up</b>
    </button>
  );
}

/** The same, as a slim bar under the top bar on phones, where the top bar has no room. */
export function SetupBar() {
  const show = useShowSetup();
  const { open } = useOpenSetup();
  if (!show) return null;
  return (
    <button type="button" className="setup-bar" onClick={open}>
      <span className="setup-pill-dot" aria-hidden />
      <span>Not synced yet</span>
      <b>Set up ›</b>
    </button>
  );
}

/** Now before the first sync: one clear card instead of an app with nothing in it. */
export function ConnectHaloCard() {
  const { open, locked } = useOpenSetup();
  return (
    <section className="card connect-halo" aria-label="Connect Halo">
      <span className="connect-halo-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
          <path d="M19.73 9.93A8 8 0 1 1 14.07 4.27" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          <path d="M17.66 3.5v5.7M14.8 6.35h5.7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
      <h1 className="connect-halo-title">Connect Halo to see your classes, due dates, and grades.</h1>
      <p className="connect-halo-text">{locked ? 'Halo sync is part of Plus. Once it is on, one bookmark brings everything in.' : 'It takes about two minutes, one bookmark, and never your GCU password.'}</p>
      <button type="button" className="btn primary connect-halo-btn" onClick={open}>
        {locked ? 'See Plus' : 'Connect Halo'}
      </button>
      <a className="connect-halo-alt" href="#/you?s=classes">
        Or add your classes yourself
      </a>
    </section>
  );
}

/** Calendar, Classes and Inbox before the first sync: one short line pointing to Connect Halo. */
export function ConnectHaloLine({ what }: { what: string }) {
  const { open, locked } = useOpenSetup();
  return (
    <p className="connect-halo-line">
      <span>{what}</span>
      <button type="button" className="btn small primary" onClick={open}>
        {locked ? 'See Plus' : 'Connect Halo'}
      </button>
    </p>
  );
}

/** "Later" holds for this visit only: the next time Halo+ opens, the sheet is back until a sync lands. */
let laterThisVisit = false;
/** When this visit began: a setup skipped since then already said "later" for this visit. */
const VISIT_AT = Date.now();
const since = (at: string | null | undefined) => !!at && Date.parse(at) >= VISIT_AT;

/**
 * Never synced, on a plan with sync (Plus, Max or the free week): on every open, before anything else, one screen that
 * says so and goes straight into this device's sync setup (George, 2026-10-06). Set up is the pill's own path: the
 * extension on desktop Chrome, Edge or Brave, the bookmark on other computers, the iPad or phone steps on a tablet or
 * phone. "Later" closes it for this visit. A sync landing while it is up shows the check, then it goes.
 */
export function NeverSyncedSheet() {
  const show = useShowSetup();
  const never = useNeverSynced();
  const { open, locked } = useOpenSetup();
  const { auth, profile } = useAccount();
  const { data } = useStore();
  const ext = useExtension();
  const [later, setLater] = useState(laterThisVisit);
  const [wasUp, setWasUp] = useState(false);
  const [synced, setSynced] = useState(false);
  const signedIn = !auth.configured || !!auth.session;
  // The end-of-trial screens come first when they are due.
  const trialEndDue = trialState(profile) === 'used' && !data.settings.trialEndSeen;
  // Onboarding or the extension setup skipped (or finished without a sync) a moment ago, in this visit: that was the
  // answer for now; the sheet waits for the next open.
  const ob = data.settings.onboarding as OnboardingState | undefined;
  const justAnswered = since(ob?.skippedAt) || since(ob?.doneAt) || since(data.settings.extSetup?.skippedAt) || since(data.settings.extSetup?.doneAt);
  const due = show && !locked && signedIn && !later && !trialEndDue && !justAnswered;
  useEffect(() => {
    if (due) setWasUp(true);
  }, [due]);
  useEffect(() => {
    if (!wasUp || never) return;
    setSynced(true);
    const t = window.setTimeout(() => {
      setSynced(false);
      setWasUp(false);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [wasUp, never]);
  if (synced)
    return (
      <div className="onboard upgrade never-synced" role="dialog" aria-modal="true" aria-label="Synced">
        <div className="onboard-inner">
          <section className="onboard-step never-synced-step">
            <span className="never-synced-check" aria-hidden>
              ✓
            </span>
            <h1 className="onboard-title">Synced.</h1>
            <p className="onboard-text">Your classes are in.</p>
          </section>
        </div>
      </div>
    );
  if (!due) return null;
  const how = ext.browser && !isTouchDevice() ? `Add the extension to ${ext.browser}` : isTouchDevice() ? (isIPad() ? 'Set up on this iPad' : 'Set up on this phone') : 'Set up the bookmark';
  return (
    <div className="onboard upgrade never-synced" role="dialog" aria-modal="true" aria-label="You haven't synced Halo yet">
      <div className="onboard-inner">
        <section className="onboard-step never-synced-step">
          <span className="connect-halo-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none">
              <path d="M19.73 9.93A8 8 0 1 1 14.07 4.27" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
              <path d="M17.66 3.5v5.7M14.8 6.35h5.7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="onboard-title never-synced-title">You haven&apos;t synced Halo yet!</h1>
          <p className="onboard-text">Halo+ can&apos;t show your deadlines, grades, or announcements until you do. Takes 2 minutes.</p>
          <div className="onboard-actions">
            <button type="button" className="btn primary onboard-big" onClick={open}>
              {how}
            </button>
          </div>
          <button
            type="button"
            className="never-synced-later"
            onClick={() => {
              laterThisVisit = true;
              setLater(true);
            }}
          >
            Later
          </button>
        </section>
      </div>
    </div>
  );
}
