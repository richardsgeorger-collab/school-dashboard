import { ExtensionSetup } from './onboarding/ExtensionSetup';
import { extSetupDue } from './onboarding/extSetup';
import { installedVersion, useExtension } from './config/extension';
import { isTouchDevice } from './ui/device';
import { WinbackOpens } from './winback/WinbackHooks';
import { HaloDraw } from './components/HaloDraw';
import { DuplicateFold } from './halo/DuplicateFold';
import { PeekSummary } from './winback/PeekSummary';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AccountProvider } from './auth/AccountContext';
import { SetNewPassword } from './auth/SignIn';
import { ParticipationFold } from './halo/ParticipationFold';
import { useAccountSync } from './auth/useAccountSync';
import { BottomNav, TopBar } from './components/Nav';
import { TimeAsk } from './components/TimeAsk';
import type { HaloExport } from './halo/types';
import { useHaloHandoff } from './halo/useHaloHandoff';
import { loadSyncKey, SYNC_KEY_SLOT, takePending } from './halo/serverSync';
import { JOY_SNAP_SLOT } from './joy/extSnapshot';
import { HaloImport } from './views/HaloImport';
import { QuickCapture } from './views/QuickCapture';
import { Palette } from './views/Palette';
import { SyncAssignments } from './views/SyncAssignments';
import { SyncSheet } from './views/SyncSheet';
import { useRoute } from './router';
import { StoreProvider } from './storage/store';
import { syncClose, syncPress } from './ui/presses';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/now.css';
import './styles/screens.css';
import './styles/looks.css';
import './styles/landing.css';
import './styles/study.css';
import './styles/trial.css';
import './styles/joy.css';
import { Landing } from './landing/Landing';
import { Login } from './landing/Login';
import { useFront } from './landing/useShowLanding';
import { accentToShow, applyAccent } from './config/accents';
import { can, trialState } from './config/flags';
import { useAccount } from './auth/AccountContext';
import { IconHalo } from './components/Icons';
import { AppFailed, ErrorBoundary } from './components/ErrorBoundary';
import { lazyScreen, offlineWait } from './monitor/install';
import { PlanWatch } from './monitor/planWatch';
import { Now } from './views/Now';
import { initPixel } from './analytics/pixel';
// Every screen but Now (and the landing page) loads when first opened, so a stranger's first paint and Now's are
// not paying for the calendar, the settings, the coach or the admin table.
const Calendar = lazyScreen(() => import('./views/calendar/Calendar').then((m) => ({ default: m.Calendar })));
const Load = lazyScreen(() => import('./views/Load').then((m) => ({ default: m.Load })));
const Grades = lazyScreen(() => import('./views/Grades').then((m) => ({ default: m.Grades })));
const Library = lazyScreen(() => import('./views/Library').then((m) => ({ default: m.Library })));
const You = lazyScreen(() => import('./views/You').then((m) => ({ default: m.You })));
const Study = lazyScreen(() => import('./views/Study').then((m) => ({ default: m.Study })));
const Ask = lazyScreen(() => import('./views/Ask').then((m) => ({ default: m.Ask })));
const Practice = lazyScreen(() => import('./views/Practice').then((m) => ({ default: m.Practice })));
const Check = lazyScreen(() => import('./views/Check').then((m) => ({ default: m.Check })));
const Admin = lazyScreen(() => import('./views/Admin').then((m) => ({ default: m.Admin })));
const ClassPage = lazyScreen(() => import('./views/ClassPage').then((m) => ({ default: m.ClassPage })));
const Classes = lazyScreen(() => import('./views/Classes').then((m) => ({ default: m.Classes })));
const IngestView = lazyScreen(() => import('./views/IngestView').then((m) => ({ default: m.IngestView })));
const Inbox = lazyScreen(() => import('./views/Inbox').then((m) => ({ default: m.Inbox })));
const Looks = lazyScreen(() => import('./views/Looks').then((m) => ({ default: m.Looks })));
import { Celebrations } from './views/Celebrate';
import { useBackgroundRead } from './halo/backgroundRead';
import { useAutoRerun } from './ingest/auto';
import { OkayCard, okayPress } from './views/Okay';
import { NotificationPlanner } from './notify/NotificationPlanner';
import { NowTour } from './onboarding/NowTour';
import { Onboarding } from './onboarding/Onboarding';
import { Upgrade, upgradeDue } from './onboarding/Upgrade';
import { TrialEnded } from './views/trialEnd/TrialEnded';
import { JoyHost } from './joy/JoyHost';
import { initialState, isOpen, tourPending } from './onboarding/state';
import { track } from './onboarding/track';
import { useStore } from './storage/store';
import { FrozenBanner, LegacyNotice, useSyncAccess } from './views/PlanWall';
import { MergedBanner } from './views/MergedBanner';

/** The Halo bookmark posts its export here; the diff opens on whatever screen is showing. */
function HaloHandoff() {
  const [payload, setPayload] = useState<HaloExport | null>(null);
  const [waiting, setWaiting] = useState(false);
  const { params } = useRoute();
  const expecting = params.get('halo') === '1';
  const access = useSyncAccess();
  const { data } = useStore();
  // The very first sync (nothing from Halo yet) applies itself: an empty planner has nothing to review. Decided once,
  // when the sync arrives: saving it stamps the last pull, which must not flip it back to a review halfway through.
  const firstNow = !data.courses.some((c) => c.haloClassId) && !data.settings.lastPull;
  const first = useRef(firstNow);
  first.current = firstNow;
  const [firstSync, setFirstSync] = useState(false);
  // A scheduled sync from the extension is Plus and Max (2026-10-04; Max only from 2026-10-01). The server refuses one from any other plan; this is the
  // same rule for a sync an older extension hands straight to this tab. Sync now (auto false) is taken on any plan.
  const { tier: planTier, planKnown: tierKnown } = useAccount();
  const autoOk = useRef(true);
  autoOk.current = !tierKnown || can('haloAutoSync', planTier);
  const receive = useCallback((p: HaloExport) => {
    if ((p as HaloExport & { auto?: boolean }).auto === true && !autoOk.current) return;
    setFirstSync(first.current);
    setPayload(p);
  }, []);
  useHaloHandoff(receive);
  // A sync the bookmark dropped on the server (iPad, phones): picked up on load, when the tab comes back, and when the
  // bookmark sends the student here with ?pending=1. Only ever there when the server path is on for them.
  // The Chrome extension drops every sync there too (2026-09-30), so it lands with Halo+ closed, and pings an open tab
  // to take it now. One older than what this planner already has is taken and skipped, never applied over it.
  const pendingParam = params.get('pending') === '1';
  const { auth: account, planKnown } = useAccount();
  const lastAt = useRef<string | null>(null);
  lastAt.current = data.settings.lastPull?.at ?? null;
  useEffect(() => {
    if (!account.session) return;
    let live = true;
    const look = () =>
      void takePending()
        .then((p) => {
          if (!live || !p) return;
          if (lastAt.current && p.exportedAt && Date.parse(p.exportedAt) < Date.parse(lastAt.current)) return;
          receive(p);
        })
        .catch(() => undefined);
    look();
    const onShow = () => document.visibilityState === 'visible' && look();
    const onPing = (e: MessageEvent) => e.origin === window.location.origin && (e.data as { kind?: string } | null)?.kind === 'halo-pending' && look();
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('message', onPing);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('message', onPing);
    };
  }, [account.session, pendingParam, receive]);
  // The account's sync key, for the Chrome extension on this computer (its content script reads it here): with it the
  // extension drops each sync into this account. It can drop off a sync and nothing else. Gone when signed out.
  const userId = account.session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      if (!account.loading) {
        try {
          localStorage.removeItem(SYNC_KEY_SLOT);
          localStorage.removeItem(JOY_SNAP_SLOT);
        } catch {
          /* storage unavailable */
        }
      }
      return;
    }
    void loadSyncKey(true).then((k) => {
      try {
        if (k) localStorage.setItem(SYNC_KEY_SLOT, k.key);
      } catch {
        /* storage unavailable */
      }
    });
  }, [userId, account.loading]);
  useEffect(() => {
    if (!expecting || payload) {
      setWaiting(false);
      return;
    }
    setWaiting(true);
    const t = setTimeout(() => setWaiting(false), 30_000);
    return () => clearTimeout(t);
  }, [expecting, payload]);
  return (
    <>
      {waiting && (
        <div className="halo-banner" role="status">
          Waiting for Halo. Keep this tab open. If nothing arrives, open You, Halo, and paste the export.
        </div>
      )}
      {/* A sync that lands before the plan is known waits the moment it takes, rather than being judged as Free. */}
      {payload && planKnown && (
        <ErrorBoundary
          fallback={(err, reset) => (
            <div className="halo-banner" role="alert">
              Halo sent something this build could not read ({err.message}). Sync again, or paste the export under You, Halo connection.{' '}
              <button type="button" className="hero-inline" onClick={() => { reset(); setPayload(null); }}>
                Dismiss
              </button>
            </div>
          )}
        >
          {access.allowed ? (
            // Every extension sync (scheduled or Sync now, straight from the tab or from the account) applies the safe
            // part quietly with Undo; removals wait for the student's OK behind a Review button.
            <HaloImport payload={payload} onClose={() => setPayload(null)} auto={firstSync} background={!firstSync && payload.source === 'extension'} />
          ) : (
            // Sync is off (Free): nothing is applied; the student sees what their own Halo holds that the planner
            // does not, counted, with the ways to bring it in (win-back peek, 2026-09-29).
            <PeekSummary payload={payload} onClose={() => setPayload(null)} />
          )}
        </ErrorBoundary>
      )}
    </>
  );
}

/** The Sync sheet and a whole-window drop target for a calendar file. */
function SyncHost({ open, file, onClose }: { open: boolean; file: File | null; onClose: () => void }) {
  if (!open) return null;
  return file ? <SyncAssignments initialFile={file} onClose={onClose} /> : <SyncSheet onClose={onClose} />;
}

function useWindowDrop(onFile: (f: File) => void): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const over = (e: DragEvent) => {
      if (hasFile(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f || !f.name.toLowerCase().endsWith('.ics')) return;
      e.preventDefault();
      onFile(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [onFile]);
  return over;
}

/**
 * The welcome on a first open, the three tooltips on Now after it, and nothing at all for anyone who was here
 * before. It waits: not on the landing page or the sign-in screen, and, for a signed-in account, not until the
 * account's own data has arrived, so a returning student on a new device is never greeted as a stranger (and
 * their settings are never overwritten by a fresh welcome). #/start opens straight at sign-up.
 */
function OnboardingHost() {
  const { data, actions, sync } = useStore();
  const { auth, tier, loading, planKnown, profile } = useAccount();
  const { route, params, navigate } = useRoute();
  const front = useFront();
  const ext = useExtension();
  // Settled: the sign-in is known and, when signed in, the account's first load is done. Before that a signed-in
  // student on a new device looked signed out for a few seconds on a slow network, and onboarding started (audit).
  const signedIn = !!auth.session || !!auth.knownUserId;
  const settled = !auth.loading && (!signedIn || sync.status === 'synced' || sync.status === 'error');
  const fresh = data.courses.length === 0 && data.items.length === 0 && !data.settings.lastPull;
  useEffect(() => {
    if (front !== 'app' || route === 'login' || !settled) return;
    const s = initialState(data.settings, data.courses);
    if (!s) return;
    if (route === 'start' && s.step === 'welcome') s.step = auth.configured && !auth.session ? 'account' : auth.configured ? 'compare' : 'halo';
    // Back from Google or the email link with a brand-new account: the pitch and the sign-up are behind them; the
    // plan choice is next (it passes itself when there is nothing to choose).
    else if (auth.session && s.step === 'welcome') s.step = 'compare';
    actions.updateSettings({ onboarding: s });
    track(s.step, 'enter');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.onboarding, data.courses.length, front, route, settled]);
  const ob = data.settings.onboarding;
  // Admin only (2026-10-01): the end-of-trial screen on the admin's own account and real numbers, changing nothing.
  const preview = params.get('preview');
  if (profile?.isAdmin && (preview === 'trial-end' || preview === 'trial-end-gift'))
    return <TrialEnded preview={{ gift: preview === 'trial-end-gift', onGift: (g: boolean) => navigate(route, { preview: g ? 'trial-end-gift' : 'trial-end' }), onClose: () => navigate(route, {}) }} />;
  if (front !== 'app' || route === 'login') return null;
  // An account still arriving on a device with nothing of its own: a quiet wait, never onboarding or an empty Now.
  if (signedIn && !settled && fresh) return <AccountLoading />;
  if (isOpen(ob)) return <Onboarding />;
  // First the tour of Now, Calendar and Inbox; then, once, the welcome for whatever was just unlocked.
  if ((route === 'now' || route === 'home') && tourPending(ob)) return <NowTour />;
  if (tourPending(ob)) return null;
  // Never on a plan still loading: the free tier it reads for a moment is not a downgrade, and the welcome waits.
  const due = loading || !planKnown ? null : upgradeDue(tier, data.settings.upgradeSeen, data.settings.maxOnboarding);
  if (due) return <Upgrade kind={due} />;
  if (loading || !planKnown) return null;
  // The first open after a trial ends: one clear screen, before anything else.
  if (trialState(profile) === 'used' && tier === 'free' && !!profile?.trialEndsAt && !profile.friendFrom && !data.settings.trialEndSeen) return <TrialEnded />;
  // The Chrome extension setup (2026-10-04): once for everyone on a computer without it (after sign-up for someone new),
  // and again from the "Get the extension" line on Now (#/now?ext=1).
  const again = params.get('ext') === '1';
  const extKind = again ? (ext.browser ? 'setup' : 'needs-chrome') : extSetupDue({ settings: data.settings, browser: ext.browser, touch: isTouchDevice(), installed: installedVersion(), storeUrl: ext.url });
  if (extKind && (!again || !isTouchDevice()))
    return (
      <ExtensionSetup
        kind={extKind}
        onClose={(how) => {
          const now = new Date().toISOString();
          actions.updateSettings({ extSetup: { ...(data.settings.extSetup ?? {}), shownAt: data.settings.extSetup?.shownAt ?? now, ...(how === 'done' ? { doneAt: now } : { skippedAt: data.settings.extSetup?.skippedAt ?? now }) } });
          if (again) navigate(route, {});
        }}
      />
    );
  return <TrialEnded />;
}

/** A signed-in student's classes on their way to a new device. */
function AccountLoading() {
  return (
    <div className="onboard account-loading" role="status" aria-live="polite">
      <section className="onboard-step" aria-label="Loading your classes">
        <HaloDraw size={64} />
        <h1 className="onboard-title">Loading your classes…</h1>
        <p className="onboard-text">Bringing your planner from your account. This takes a moment on a slow connection.</p>
      </section>
    </div>
  );
}

/** Back from a password-reset email: ask for the new password over whatever is open. */
function RecoveryHost() {
  const { auth } = useAccount();
  return <SetNewPassword auth={auth} />;
}

/** The accent the account may wear: the chosen preset with Max (or the trial), gold otherwise. */
function AccentHost() {
  const { data } = useStore();
  const { tier } = useAccount();
  const accent = accentToShow(data.settings.accent, can('themes', tier));
  useEffect(() => {
    applyAccent(document.documentElement, accent);
  }, [accent]);
  return null;
}

/** A notification's tap lands on #/now?sync=1: open the Sync sheet without another tap. */
function SyncParam() {
  const { params } = useRoute();
  useEffect(() => {
    if (params.get('sync') === '1') syncPress.current?.();
  }, [params]);
  return null;
}

function OkayHost() {
  const [open, setOpen] = useState(false);
  okayPress.current = () => setOpen(true);
  return open ? <OkayCard onClose={() => setOpen(false)} /> : null;
}

/** Re-reads classes on the AI version after a sync or a new file, quietly. */
function AutoRerun() {
  useAutoRerun();
  return null;
}

function AccountSync() {
  useAccountSync();
  return null;
}

/** Announcements read themselves after every sync and on open, whatever sheet is or is not on screen. */
function BackgroundRead() {
  useBackgroundRead();
  return null;
}

/** Nothing while a screen's code arrives, unless it is waiting for the network: then it says so (monitor/install.ts). */
function ScreenLoading() {
  const [offline, setOffline] = useState(offlineWait.on);
  useEffect(() => {
    const l = () => setOffline(offlineWait.on);
    offlineWait.listeners.add(l);
    return () => void offlineWait.listeners.delete(l);
  }, []);
  if (!offline) return null;
  return (
    <div className="card calm" role="status">
      <p className="eyebrow">You're offline</p>
      <p className="trial-lead">This screen opens as soon as you're back online. Everything you have is still here.</p>
    </div>
  );
}

function Screen() {
  const { route } = useRoute();
  // Keyed on the route so a tab change remounts the screen and its entrance plays.
  return (
    <div className="screen" key={route}>
      <Suspense fallback={<ScreenLoading />}>
        <ScreenFor route={route} />
      </Suspense>
    </div>
  );
}

function ScreenFor({ route }: { route: ReturnType<typeof useRoute>['route'] }) {
  switch (route) {
    case 'login':
      return <Login />;
    case 'calendar':
      return <Calendar />;
    case 'classes':
      return <Classes />;
    case 'inbox':
      return <Inbox />;
    case 'you':
      return <You />;
    case 'load':
      return <Load />;
    case 'library':
      return <Library />;
    case 'grades':
      return <Grades />;
    case 'admin':
      return <Admin />;
    case 'study':
      return <StudyOrPractice />;
    case 'ask':
      return <Ask />;
    case 'practice':
      return <Practice />;
    case 'check':
      return <Check />;
    case 'class':
      return <ClassPage />;
    case 'ingest':
      return <IngestView />;
    case 'looks':
      return <Looks />;
    default:
      return <Now />;
  }
}

/** The Study home; an old study-kit address (#/study?c=…&k=…) lands on Practice for that class. */
function StudyOrPractice() {
  const { params } = useRoute();
  return params.has('c') || params.has('k') ? <Practice /> : <Study />;
}

/** The app with its nav, or the landing page / sign-in screen on their own. Nothing renders while the account is being looked up. */
function Shell({ captureOpen, paletteOpen, onSync, onCapture, onCloseCapture, onClosePalette }: { captureOpen: boolean; paletteOpen: boolean; onSync: () => void; onCapture: () => void; onCloseCapture: () => void; onClosePalette: () => void }) {
  const front = useFront();
  const { route } = useRoute();
  if (front === 'pending')
    return (
      <div className="app front-pending" aria-busy="true">
        <span className="brand-mark" aria-hidden>
          <IconHalo />
        </span>
      </div>
    );
  if (front === 'landing') return <Landing />;
  if (route === 'login') return <Login />;
  return (
    <div className="app">
      <TopBar onSync={onSync} onCapture={onCapture} />
      {captureOpen && <QuickCapture onClose={onCloseCapture} />}
      {paletteOpen && <Palette onClose={onClosePalette} />}
      <main className="main">
        {/* Inside the page, under the fixed top bar on a phone: sync paused, or kept on until term end. */}
        <FrozenBanner />
        <LegacyNotice />
        <MergedBanner />
        <Screen />
      </main>
      <BottomNav />
      <TimeAsk />
    </div>
  );
}

export default function App() {
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncFile, setSyncFile] = useState<File | null>(null);
  const onFile = useCallback((f: File) => {
    setSyncFile(f);
    setSyncOpen(true);
  }, []);
  const dragging = useWindowDrop(onFile);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  syncPress.current = () => setSyncOpen(true);
  syncClose.current = () => setSyncOpen(false);
  useEffect(() => initPixel(), []);
  // The small ⋯ / More menus are <details>: they close on Escape and on a tap anywhere outside, like any menu.
  useEffect(() => {
    const closeAll = (except?: Element | null) => {
      for (const d of document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')) if (d !== except) d.open = false;
    };
    const onDown = (e: PointerEvent) => closeAll((e.target as Element | null)?.closest('details.menu'));
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // Not over the first-run screens or the Max welcome: they own the screen until they are done.
        if (document.querySelector('.onboard')) return;
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <ErrorBoundary fallback={(err) => <AppFailed error={err} />}>
    <StoreProvider>
      <AccountProvider>
        <AccountSync />
        <PlanWatch />
        <RecoveryHost />
        <ParticipationFold />
        <WinbackOpens />
        <DuplicateFold />
        <AccentHost />
        <AutoRerun />
        <HaloHandoff />
        <OnboardingHost />
        <NotificationPlanner />
        <Celebrations />
        <JoyHost />
        <BackgroundRead />
        <SyncParam />
        <OkayHost />
        <SyncHost
          open={syncOpen}
          file={syncFile}
          onClose={() => {
            setSyncOpen(false);
            setSyncFile(null);
          }}
        />
        {dragging && <div className="drop-overlay">Drop the .ics to import a calendar</div>}
        <Shell captureOpen={captureOpen} paletteOpen={paletteOpen} onSync={() => setSyncOpen(true)} onCapture={() => setCaptureOpen(true)} onCloseCapture={() => setCaptureOpen(false)} onClosePalette={() => setPaletteOpen(false)} />
      </AccountProvider>
    </StoreProvider>
    </ErrorBoundary>
  );
}
