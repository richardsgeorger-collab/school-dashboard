import type { ReactElement } from 'react';
import { TAB_OF, TABS, useRoute, type Tab } from '../router';
import { useStore } from '../storage/store';
import { IconCalendar, IconClasses, IconHalo, IconInbox, IconNow, IconPlus, IconSync, IconYou } from './Icons';

const LABEL: Record<Tab, string> = { now: 'Now', calendar: 'Calendar', classes: 'Classes', inbox: 'Inbox', you: 'You' };
const ICON: Record<Tab, () => ReactElement> = { now: IconNow, calendar: IconCalendar, classes: IconClasses, inbox: IconInbox, you: IconYou };

function Links({ current }: { current: Tab }) {
  return (
    <>
      {TABS.map((tab) => {
        const Icon = ICON[tab];
        return (
          <a key={tab} className="nav-link" href={`#/${tab}`} aria-current={current === tab ? 'page' : undefined}>
            <Icon />
            <span className="nav-label">{LABEL[tab]}</span>
          </a>
        );
      })}
    </>
  );
}

export function TopBar({ onSync, onCapture }: { onSync: () => void; onCapture: () => void }) {
  const { route } = useRoute();
  const { sync } = useStore();
  const syncTitle = {
    off: 'On this device only',
    signed_out: 'Signed out',
    syncing: 'Saving to your account',
    synced: `Saved to your account${sync.pending ? `, ${sync.pending} pending` : ''}`,
    error: `Could not save: ${sync.error ?? ''}`,
  }[sync.status];
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a href="#/now" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brand-mark" aria-hidden>
            <IconHalo />
          </span>
          <span className="brand-text">Halo+</span>
        </a>
        <nav className="nav-top" aria-label="Primary">
          <Links current={TAB_OF[route]} />
        </nav>
        <div className="topbar-date mono">
          <button type="button" className="topbar-gear topbar-sync" onClick={onCapture} title="Add something (⌘K)" aria-label="Add something">
            <IconPlus />
            <span className="gear-label">Add</span>
          </button>
          <button type="button" className="topbar-gear topbar-sync" onClick={onSync} title="Sync from Halo" aria-label="Sync from Halo">
            <IconSync />
            <span className="gear-label">Sync</span>
          </button>
          <a href="#/you" className="topbar-gear" title={syncTitle} aria-label={`You. ${syncTitle}`}>
            <IconYou />
            <span className="gear-label">You</span>
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
      <Links current={TAB_OF[route]} />
    </nav>
  );
}
