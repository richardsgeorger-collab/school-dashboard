import { useCallback, useEffect, useState } from 'react';
import { BottomNav, TopBar } from './components/Nav';
import type { HaloExport } from './halo/types';
import { useHaloHandoff } from './halo/useHaloHandoff';
import { HaloImport } from './views/HaloImport';
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
  return (
    <StoreProvider>
      <SyncBootstrap />
      <HaloHandoff />
      <div className="app">
        <TopBar />
        <main className="main">
          <Screen />
        </main>
        <BottomNav />
      </div>
    </StoreProvider>
  );
}
