import type { ReactElement } from 'react';
import { useRoute, type Route } from '../router';
import { useStore } from '../storage/store';
import { IconCalendar, IconGrades, IconHome, IconLoad, IconNews, IconNow, IconCheckHalo, IconLibrary, IconOkay, IconPlus, IconSettings, IconSync } from './Icons';
import { okayPress } from '../views/Okay';

const LINKS: { route: Route; label: string; icon: () => ReactElement; mobile: boolean }[] = [
  { route: 'now', label: 'Now', icon: IconNow, mobile: true },
  { route: 'calendar', label: 'Calendar', icon: IconCalendar, mobile: true },
  { route: 'plan', label: 'Plan', icon: IconHome, mobile: true },
  { route: 'load', label: 'Load', icon: IconLoad, mobile: true },
  { route: 'news', label: 'News', icon: IconNews, mobile: true },
  { route: 'library', label: 'Library', icon: IconLibrary, mobile: true },
  { route: 'grades', label: 'Grades', icon: IconGrades, mobile: true },
  { route: 'settings', label: 'Settings', icon: IconSettings, mobile: false },
];

function Links({ current, mobile = false }: { current: Route; mobile?: boolean }) {
  return (
    <>
      {LINKS.filter((l) => !mobile || l.mobile).map(({ route, label, icon: Icon }) => (
        <a key={route} className="nav-link" href={`#/${route}`} aria-current={current === route || (current === 'quiz' && route === 'library') ? 'page' : undefined}>
          <Icon />
          <span className="nav-label">{label}</span>
        </a>
      ))}
    </>
  );
}

export function TopBar({ onSync, onCapture, onCheckHalo }: { onSync: () => void; onCapture: () => void; onCheckHalo: () => void }) {
  const { route } = useRoute();
  const { sync } = useStore();
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
          <span className="brand-text">School Dashboard</span>
        </a>
        <nav className="nav-top" aria-label="Primary">
          <Links current={route} />
        </nav>
        <div className="topbar-date mono">
          {/* Every screen already shows its own date in its header; in the bar it only crowded the buttons. */}
          <button type="button" className="topbar-gear topbar-sync" onClick={onCapture} title="Add something (⌘K)" aria-label="Add something">
            <IconPlus />
            <span className="gear-label">Add</span>
          </button>
          <button type="button" className="topbar-gear topbar-okay" onClick={() => okayPress.current?.()} title="Where do I stand? One paragraph" aria-label="Where do I stand">
            <IconOkay />
            <span className="gear-label">Okay?</span>
          </button>
          <button type="button" className="topbar-gear topbar-sync" onClick={onCheckHalo} title="Check Halo: copy the audit prompt and open Halo" aria-label="Check Halo">
            <IconCheckHalo />
            <span className="gear-label">Check</span>
          </button>
          <button type="button" className="topbar-gear topbar-sync" onClick={onSync} title="Sync from Halo" aria-label="Sync from Halo">
            <IconSync />
            <span className="gear-label">Sync</span>
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
