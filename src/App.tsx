import { useCallback, useEffect, useState } from 'react';
import { BottomNav, TopBar } from './components/Nav';
import { TimeAsk } from './components/TimeAsk';
import type { HaloExport } from './halo/types';
import { useHaloHandoff } from './halo/useHaloHandoff';
import { HaloImport } from './views/HaloImport';
import { buildAuditPrompt, HALO_URL } from './halo/audit';
import { checkHaloPress, clearPendingCheck, pendingCheck, setPendingCheck } from './halo/checkState';
import { useStore } from './storage/store';
import { HaloCheck } from './views/HaloCheck';
import { HaloClassPicker } from './views/HaloClassPicker';
import type { Course } from './domain/types';
import { QuickCapture } from './views/QuickCapture';
import { SyncAssignments } from './views/SyncAssignments';
import { useRoute } from './router';
import { StoreProvider } from './storage/store';
import { useSupabaseSession } from './storage/useSupabaseSession';
import './styles/tokens.css';
import './styles/base.css';
import { Calendar } from './views/calendar/Calendar';
import { Now } from './views/Now';
import { Plan } from './views/Plan';
import { Grades } from './views/Grades';
import { Heatmap } from './views/Heatmap';
import { Library } from './views/Library';
import { Settings } from './views/Settings';
import { Quiz } from './views/Quiz';
import { ClassPage } from './views/ClassPage';
import { IngestView } from './views/IngestView';
import { useAutoRerun } from './ingest/auto';
import { OkayCard, okayPress } from './views/Okay';

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
          Waiting for Halo. Keep this tab open. If nothing arrives, use Settings, Halo, Paste Halo export.
        </div>
      )}
      {payload && <HaloImport payload={payload} onClose={() => setPayload(null)} />}
    </>
  );
}

/** The Sync button and a whole-window drop target for the .ics export. */
function SyncHost({ open, file, onClose }: { open: boolean; file: File | null; onClose: () => void }) {
  return open ? <SyncAssignments initialFile={file} onClose={onClose} /> : null;
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
      if (!f || !/\.ics$/i.test(f.name)) return;
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

/** Check Halo: first press copies the prompt and opens Halo; the next press opens the paste box. */
function CheckHaloHost({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const { data, today } = useStore();
  const [hint, setHint] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 9000);
    return () => clearTimeout(t);
  }, [hint]);
  // First press: pick the class. Second press within a day: the paste box for that class.
  const pick = (course: Course | null) => {
    const list = course ? [course] : data.courses;
    const prompt = buildAuditPrompt(data.settings.haloAuditPrompt, data, data.settings.timezone, today, list);
    void navigator.clipboard?.writeText(prompt).catch(() => undefined);
    window.open(HALO_URL, '_blank', 'noopener');
    setPendingCheck(list.map((c) => c.id));
    setPicking(false);
    setHint(course ? `Copied the ${course.code} audit. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.` : `Copied the audit for all ${list.length} classes, one at a time. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.`);
  };
  const press = useCallback(
    (mode?: 'all') => {
      if (mode === 'all') {
        pick(null);
        return;
      }
      if (pendingCheck()) {
        onOpen();
        return;
      }
      setPicking(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpen, data, today],
  );
  return (
    <>
      <CheckHaloPress press={press} />
      {hint && (
        <div className="halo-banner" role="status">
          {hint}
        </div>
      )}
      {picking && <HaloClassPicker onPick={pick} onClose={() => setPicking(false)} />}
      {open && (
        <HaloCheck
          onClose={onClose}
          onHint={setHint}
          onSwitchClass={() => {
            clearPendingCheck();
            onClose();
            setPicking(true);
          }}
        />
      )}
    </>
  );
}
function CheckHaloPress({ press }: { press: (mode?: 'all') => void }) {
  checkHaloPress.current = press;
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

function SyncBootstrap() {
  useSupabaseSession();
  return null;
}

function Screen() {
  const { route } = useRoute();
  switch (route) {
    case 'calendar':
      return <Calendar />;
    case 'plan':
      return <Plan />;
    case 'load':
      return <Heatmap />;
    case 'library':
      return <Library />;
    case 'grades':
      return <Grades />;
    case 'settings':
      return <Settings />;
    case 'quiz':
      return <Quiz />;
    case 'class':
      return <ClassPage />;
    case 'ingest':
      return <IngestView />;
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
  const [checkOpen, setCheckOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <StoreProvider>
      <SyncBootstrap />
      <AutoRerun />
      <HaloHandoff />
      <CheckHaloHost open={checkOpen} onOpen={() => setCheckOpen(true)} onClose={() => setCheckOpen(false)} />
      <OkayHost />
      <SyncHost
        open={syncOpen}
        file={syncFile}
        onClose={() => {
          setSyncOpen(false);
          setSyncFile(null);
        }}
      />
      {dragging && <div className="drop-overlay">Drop the .ics to sync assignments</div>}
      <div className="app">
        <TopBar onSync={() => setSyncOpen(true)} onCapture={() => setCaptureOpen(true)} onCheckHalo={() => checkHaloPress.current?.()} />
        {captureOpen && <QuickCapture onClose={() => setCaptureOpen(false)} />}
        <main className="main">
          <Screen />
        </main>
        <BottomNav />
        <TimeAsk />
      </div>
    </StoreProvider>
  );
}
