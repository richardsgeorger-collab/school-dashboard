import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AccountProvider } from './auth/AccountContext';
import { useAccountSync } from './auth/useAccountSync';
import { BottomNav, TopBar } from './components/Nav';
import { TimeAsk } from './components/TimeAsk';
import type { HaloExport } from './halo/types';
import { useHaloHandoff } from './halo/useHaloHandoff';
import { HaloImport } from './views/HaloImport';
import { QuickCapture } from './views/QuickCapture';
import { Palette } from './views/Palette';
import { SyncAssignments } from './views/SyncAssignments';
import { SyncSheet } from './views/SyncSheet';
import { useRoute } from './router';
import { StoreProvider } from './storage/store';
import { syncPress } from './ui/presses';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/now.css';
import './styles/screens.css';
import './styles/looks.css';
import './styles/landing.css';
import { Landing } from './landing/Landing';
import { Login } from './landing/Login';
import { useFront } from './landing/useShowLanding';
import { accentToShow, applyAccent } from './config/accents';
import { can } from './config/flags';
import { useAccount } from './auth/AccountContext';
import { IconHalo } from './components/Icons';
import { Now } from './views/Now';
import { initPixel } from './analytics/pixel';
// Every screen but Now (and the landing page) loads when first opened, so a stranger's first paint and Now's are
// not paying for the calendar, the settings, the coach or the admin table.
const Calendar = lazy(() => import('./views/calendar/Calendar').then((m) => ({ default: m.Calendar })));
const Load = lazy(() => import('./views/Load').then((m) => ({ default: m.Load })));
const Grades = lazy(() => import('./views/Grades').then((m) => ({ default: m.Grades })));
const Library = lazy(() => import('./views/Library').then((m) => ({ default: m.Library })));
const You = lazy(() => import('./views/You').then((m) => ({ default: m.You })));
const Ai = lazy(() => import('./views/Ai').then((m) => ({ default: m.Ai })));
const Admin = lazy(() => import('./views/Admin').then((m) => ({ default: m.Admin })));
const ClassPage = lazy(() => import('./views/ClassPage').then((m) => ({ default: m.ClassPage })));
const Classes = lazy(() => import('./views/Classes').then((m) => ({ default: m.Classes })));
const IngestView = lazy(() => import('./views/IngestView').then((m) => ({ default: m.IngestView })));
const Inbox = lazy(() => import('./views/Inbox').then((m) => ({ default: m.Inbox })));
const Looks = lazy(() => import('./views/Looks').then((m) => ({ default: m.Looks })));
import { Celebrations } from './views/Celebrate';
import { useBackgroundRead } from './halo/backgroundRead';
import { useAutoRerun } from './ingest/auto';
import { OkayCard, okayPress } from './views/Okay';
import { NotificationPlanner } from './notify/NotificationPlanner';
import { NowTour } from './onboarding/NowTour';
import { Onboarding } from './onboarding/Onboarding';
import { MaxWelcome } from './onboarding/MaxWelcome';
import { maxOpen } from './onboarding/maxState';
import { initialState, isOpen, tourPending } from './onboarding/state';
import { track } from './onboarding/track';
import { useStore } from './storage/store';

/** The Halo bookmark posts its export here; the diff opens on whatever screen is showing. */
function HaloHandoff() {
  const [payload, setPayload] = useState<HaloExport | null>(null);
  const [waiting, setWaiting] = useState(false);
  const { params } = useRoute();
  const expecting = params.get('halo') === '1';
  useHaloHandoff(useCallback((p: HaloExport) => setPayload(p), []));
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
      {payload && <HaloImport payload={payload} onClose={() => setPayload(null)} />}
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
  const { auth } = useAccount();
  const { route } = useRoute();
  const front = useFront();
  const settled = !auth.session || sync.status === 'synced' || sync.status === 'error';
  useEffect(() => {
    if (front !== 'app' || route === 'login' || !settled) return;
    const s = initialState(data.settings, data.courses);
    if (!s) return;
    if (route === 'start' && s.step === 'welcome') s.step = auth.configured && !auth.session ? 'account' : 'halo';
    // Back from Google or the email link with a brand-new account: the pitch and the sign-up are behind them.
    else if (auth.session && s.step === 'welcome') s.step = 'halo';
    actions.updateSettings({ onboarding: s });
    track(s.step, 'enter');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.onboarding, data.courses.length, front, route, settled]);
  const ob = data.settings.onboarding;
  if (front !== 'app' || route === 'login') return null;
  if (isOpen(ob)) return <Onboarding />;
  // The Max welcome, once Max is on and the first-run screens are out of the way.
  if (maxOpen(data.settings.maxOnboarding)) return <MaxWelcome />;
  if ((route === 'now' || route === 'home') && tourPending(ob)) return <NowTour />;
  return null;
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

function Screen() {
  const { route } = useRoute();
  // Keyed on the route so a tab change remounts the screen and its entrance plays.
  return (
    <div className="screen" key={route}>
      <Suspense fallback={null}>
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
    case 'ai':
    case 'quiz':
    case 'tutor':
    case 'study':
      return <Ai />;
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
  useEffect(() => initPixel(), []);
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
    <StoreProvider>
      <AccountProvider>
        <AccountSync />
        <AccentHost />
        <AutoRerun />
        <HaloHandoff />
        <OnboardingHost />
        <NotificationPlanner />
        <Celebrations />
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
  );
}
