import { useCallback, useEffect, useState } from 'react';
import { BottomNav, TopBar } from './components/Nav';
import type { HaloExport } from './halo/types';
import { useHaloHandoff } from './halo/useHaloHandoff';
import { HaloImport } from './views/HaloImport';
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
import { Record } from './views/Record';
import { Settings } from './views/Settings';

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
    case 'record':
      return <Record />;
    case 'grades':
      return <Grades />;
    case 'settings':
      return <Settings />;
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
  return (
    <StoreProvider>
      <SyncBootstrap />
      <HaloHandoff />
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
        <TopBar onSync={() => setSyncOpen(true)} />
        <main className="main">
          <Screen />
        </main>
        <BottomNav />
      </div>
    </StoreProvider>
  );
}
