import { BottomNav, TopBar } from './components/Nav';
import { useRoute } from './router';
import { StoreProvider } from './storage/store';
import './styles/tokens.css';
import './styles/base.css';
import { Calendar } from './views/calendar/Calendar';
import { Dashboard } from './views/Dashboard';
import { Grades } from './views/Grades';
import { Heatmap } from './views/Heatmap';

function Placeholder({ name }: { name: string }) {
  return <h1 className="page-title">{name}</h1>;
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
      return <Placeholder name="Settings" />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  return (
    <StoreProvider>
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
