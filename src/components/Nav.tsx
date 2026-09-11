import type { ReactElement } from 'react';
import { fmtDate } from '../domain/dates';
import { useRoute, type Route } from '../router';
import { useStore } from '../storage/store';
import { IconCalendar, IconGrades, IconHome, IconLoad, IconNow, IconPlus, IconRecord, IconSettings, IconSync } from './Icons';

const LINKS: { route: Route; label: string; icon: () => ReactElement; mobile: boolean }[] = [
  { route: 'now', label: 'Now', icon: IconNow, mobile: true },
  { route: 'calendar', label: 'Calendar', icon: IconCalendar, mobile: true },
  { route: 'plan', label: 'Plan', icon: IconHome, mobile: true },
  { route: 'load', label: 'Load', icon: IconLoad, mobile: true },
  { route: 'record', label: 'Record', icon: IconRecord, mobile: true },
  { route: 'grades', label: 'Grades', icon: IconGrades, mobile: true },
  { route: 'settings', label: 'Settings', icon: IconSettings, mobile: false },
];

function Links({ current, mobile = false }: { current: Route; mobile?: boolean }) {
  return (
    <>
      {LINKS.filter((l) => !mobile || l.mobile).map(({ route, label, icon: Icon }) => (
        <a key={route} className="nav-link" href={`#/${route}`} aria-current={current === route ? 'page' : undefined}>
          <Icon />
          <span>{label}</span>
        </a>
      ))}
    </>
  );
}

export function TopBar({ onSync, onCapture }: { onSync: () => void; onCapture: () => void }) {
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
        <a href="#/now" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brand-mark" aria-hidden>
            S
          </span>
          School Dashboard
        </a>
        <nav className="nav-top" aria-label="Primary">
          <Links current={route} />
        </nav>
        <div className="topbar-date mono">
          <span className="topbar-day">{fmtDate(today, 'long')}</span>
          <button type="button" className="topbar-gear topbar-sync" onClick={onCapture} title="Quick capture (⌘K)" aria-label="Quick capture">
            <IconPlus />
          </button>
          <button type="button" className="topbar-gear topbar-sync" onClick={onSync} title="Sync assignments from Halo" aria-label="Sync assignments from Halo">
            <IconSync />
          </button>
          <a href="#/settings" className="topbar-gear" title={syncTitle} aria-label={`Settings. ${syncTitle}`}>
            <IconSettings />
            <span className="sync-dot" data-status={sync.status} />
          </a>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { route } = useRoute();
  return (
    <nav className="nav-bottom" aria-label="Primary">
      <Links current={route} mobile />
    </nav>
  );
}
