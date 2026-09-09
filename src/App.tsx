import { BottomNav, TopBar } from './components/Nav';
import { useRoute } from './router';
import { StoreProvider } from './storage/store';
import { useSupabaseSession } from './storage/useSupabaseSession';
import './styles/tokens.css';
import './styles/base.css';
import { Calendar } from './views/calendar/Calendar';
import { Dashboard } from './views/Dashboard';
import { Grades } from './views/Grades';
import { Heatmap } from './views/Heatmap';
import { Settings } from './views/Settings';

function SyncBootstrap() {
  useSupabaseSession();
  return null;
}

function Screen() {
  const { route } = useRoute();
  switch (route) {
    case 'calendar':
      return <Calendar />;
    case 'load':
      return <Heatmap />;
    case 'grades':
      return <Grades />;
    case 'settings':
      return <Settings />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  return (
    <StoreProvider>
      <SyncBootstrap />
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
