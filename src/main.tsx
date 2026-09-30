import { installUsageFlush } from './analytics/usage';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { forgetStrayKey } from './chat/key';
import { installErrorMonitor, prefetchScreens } from './monitor/install';
import { CANONICAL_ORIGIN, LEGACY_ORIGIN } from './config/site';
import { LegacyMove } from './move/LegacyMove';
import { canonicalHref, hasLocalData, MOVED_KEY, receiveMove } from './move/move';

// Before anything renders: a production build never keeps an API key in this browser.
forgetStrayKey();
// Anything that breaks from here on is reported (monitor/): crashes, rejected promises, failed server calls.
installErrorMonitor();

// The Sync Halo bookmark opens the dashboard in a window named 'school-dashboard'. Naming this tab that makes the
// bookmark come back to the tab the student is already in (onboarding included) instead of opening a second one.
try {
  if (!window.name) window.name = 'school-dashboard';
} catch {
  /* a sandboxed frame */
}

// Moving to haloplus.app (2026-09-29). On the new address, #/moving is the handover page the old one opened: it
// takes the student's data and then opens the app. On the old address, a student who already moved is forwarded
// at once (a bookmark's handoff tab included: the sync script sends to both addresses).
const here = window.location.origin;
const moving = here === CANONICAL_ORIGIN && window.location.hash.startsWith('#/moving');
let forwarded = false;
// Read before the app starts writing its own empty state.
const hadData = here === LEGACY_ORIGIN && hasLocalData();
if (here === LEGACY_ORIGIN) {
  try {
    if (localStorage.getItem(MOVED_KEY)) {
      forwarded = true;
      window.location.replace(canonicalHref());
    }
  } catch {
    /* storage off: the move screen below handles it */
  }
}
if (moving) receiveMove();
else if (!forwarded) {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
      {here === LEGACY_ORIGIN && <LegacyMove hadData={hadData} />}
    </React.StrictMode>,
  );
  installUsageFlush();
  // The other screens' code, fetched once the app is idle: moving between screens later works offline.
  prefetchScreens();
}
