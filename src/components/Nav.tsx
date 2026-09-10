import type { ReactElement } from 'react';
import { fmtDate } from '../domain/dates';
import { useRoute, type Route } from '../router';
import { useStore } from '../storage/store';
import { IconCalendar, IconGrades, IconHome, IconLoad, IconSettings } from './Icons';

const LINKS: { route: Route; label: string; icon: () => ReactElement }[] = [
  { route: 'calendar', label: 'Calendar', icon: IconCalendar },
  { route: 'plan', label: 'Plan', icon: IconHome },
  { route: 'load', label: 'Load', icon: IconLoad },
  { route: 'grades', label: 'Grades', icon: IconGrades },
  { route: 'settings', label: 'Settings', icon: IconSettings },
];

function Links({ current }: { current: Route }) {
  return (
    <>
      {LINKS.map(({ route, label, icon: Icon }) => (
        <a key={route} className="nav-link" href={`#/${route}`} aria-current={current === route ? 'page' : undefined}>
          <Icon />
          <span>{label}</span>
        </a>
      ))}
    </>
  );
}

export function TopBar() {
  const { route } = useRoute();
  const { today, sync } = useStore();
  const syncTitle = {
    off: 'Local only',
    signed_out: 'Sync configured, signed out',
    syncing: 'Syncing',
    synced: `Synced${sync.pending ? `, ${sync.pending} pending` : ''}`,
    error: `Sync error: ${sync.error ?? ''}`,
  }[sync.status];
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a href="#/calendar" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brand-mark" aria-hidden>
            S
          </span>
          School Dashboard
        </a>
        <nav className="nav-top" aria-label="Primary">
          <Links current={route} />
        </nav>
        <div className="topbar-date mono">
          {fmtDate(today, 'long')}
          <a href="#/settings" className="sync-dot" data-status={sync.status} title={syncTitle} aria-label={syncTitle} />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { route } = useRoute();
  return (
    <nav className="nav-bottom" aria-label="Primary">
      <Links current={route} />
    </nav>
  );
}
