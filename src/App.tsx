import { useCallback, useEffect, useState } from 'react';
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
import { Calendar } from './views/calendar/Calendar';
import { Now } from './views/Now';
import { Load } from './views/Load';
import { Grades } from './views/Grades';
import { Library } from './views/Library';
import { You } from './views/You';
import { Ai } from './views/Ai';
import { Admin } from './views/Admin';
import { initPixel } from './analytics/pixel';
import { ClassPage } from './views/ClassPage';
import { Classes } from './views/Classes';
import { IngestView } from './views/IngestView';
import { Inbox } from './views/Inbox';
import { Looks } from './views/Looks';
import { Celebrations } from './views/Celebrate';
import { useBackgroundRead } from './halo/backgroundRead';
import { useAutoRerun } from './ingest/auto';
import { OkayCard, okayPress } from './views/Okay';
import { NotificationPlanner } from './notify/NotificationPlanner';
import { NowTour } from './onboarding/NowTour';
import { Onboarding } from './onboarding/Onboarding';
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

/** The welcome on a first open, the three tooltips on Now after it, and nothing at all for anyone who was here before. */
function OnboardingHost() {
  const { data, actions } = useStore();
  const { route } = useRoute();
  useEffect(() => {
    const s = initialState(data.settings, data.courses);
    if (!s) return;
    actions.updateSettings({ onboarding: s });
    if (s.step === 'welcome') track('welcome', 'enter');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.onboarding, data.courses.length]);
  const ob = data.settings.onboarding;
  if (isOpen(ob)) return <Onboarding />;
  if (route === 'now' && tourPending(ob)) return <NowTour />;
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
      <ScreenFor route={route} />
    </div>
  );
}

function ScreenFor({ route }: { route: ReturnType<typeof useRoute>['route'] }) {
  switch (route) {
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
        <div className="app">
          <TopBar onSync={() => setSyncOpen(true)} onCapture={() => setCaptureOpen(true)} />
          {captureOpen && <QuickCapture onClose={() => setCaptureOpen(false)} />}
          {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
          <main className="main">
            <Screen />
          </main>
          <BottomNav />
          <TimeAsk />
        </div>
      </AccountProvider>
    </StoreProvider>
  );
}
