import { BottomNav, TopBar } from './components/Nav';
import { useRoute } from './router';
import { StoreProvider } from './storage/store';
import './styles/tokens.css';
import './styles/base.css';
import { Dashboard } from './views/Dashboard';

function Placeholder({ name }: { name: string }) {
  return <h1 className="page-title">{name}</h1>;
}

function Screen() {
  const { route } = useRoute();
  switch (route) {
    case 'calendar':
      return <Placeholder name="Calendar" />;
    case 'load':
      return <Placeholder name="Workload" />;
    case 'grades':
      return <Placeholder name="Grades" />;
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
