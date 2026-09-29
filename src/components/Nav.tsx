import type { ReactElement } from 'react';
import { TAB_OF, TABS, useRoute, type Tab } from '../router';
import { useStore } from '../storage/store';
import { IconCalendar, IconClasses, IconHalo, IconInbox, IconMoon, IconNow, IconPlus, IconStudy, IconSun, IconSync, IconYou } from './Icons';
import { useAccount } from '../auth/AccountContext';
import { PlanBadge, TrialChip } from '../views/TrialStatus';

const LABEL: Record<Tab, string> = { now: 'Now', calendar: 'Calendar', study: 'Study', classes: 'Classes', inbox: 'Inbox', you: 'You' };
/** During the trial: what each tab needs to stay (Study is Max; the Inbox's reading is Plus). */
const BADGE: Partial<Record<Tab, 'max' | 'plus'>> = { study: 'max', inbox: 'plus' };
const ICON: Record<Tab, () => ReactElement> = { now: IconNow, calendar: IconCalendar, study: IconStudy, classes: IconClasses, inbox: IconInbox, you: IconYou };

function Links({ current }: { current: Tab }) {
  return (
    <>
      {TABS.map((tab) => {
        const Icon = ICON[tab];
        return (
          <a key={tab} className="nav-link" href={`#/${tab}`} aria-current={current === tab ? 'page' : undefined}>
            <Icon />
            <span className="nav-label">{LABEL[tab]}</span>
            {BADGE[tab] && <PlanBadge plan={BADGE[tab]!} />}
          </a>
        );
      })}
    </>
  );
}

export function TopBar({ onSync, onCapture }: { onSync: () => void; onCapture: () => void }) {
  const { route } = useRoute();
  const { sync, data, actions } = useStore();
  const { auth } = useAccount();
  const dark = document.documentElement.dataset.theme === 'dark';
  const flipTheme = () => actions.updateSettings({ theme: dark ? 'light' : 'dark' });
  const initial = (auth.email ?? '').trim().charAt(0).toUpperCase();
  void data;
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
          <TrialChip />
          <button type="button" className="topbar-gear topbar-sync" onClick={onSync} title="Sync Halo" aria-label="Sync Halo">
            <IconSync />
            <span className="gear-label">Sync</span>
            <PlanBadge plan="plus" />
          </button>
          <button type="button" className="topbar-gear topbar-icon" onClick={flipTheme} title={dark ? 'Switch to light' : 'Switch to dark'} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {dark ? <IconSun /> : <IconMoon />}
          </button>
          <a href="#/you" className="topbar-gear topbar-avatar" title={`Account · ${syncTitle}`} aria-label={`Account. ${syncTitle}`}>
            {initial ? <span className="avatar">{initial}</span> : <IconYou />}
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
