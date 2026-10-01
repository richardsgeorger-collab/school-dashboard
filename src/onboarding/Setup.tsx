import { useAccount } from '../auth/AccountContext';
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
