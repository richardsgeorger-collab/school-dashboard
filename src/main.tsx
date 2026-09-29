import { installUsageFlush } from './analytics/usage';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { forgetStrayKey } from './chat/key';

// Before anything renders: a production build never keeps an API key in this browser.
forgetStrayKey();

// The Sync Halo bookmark opens the dashboard in a window named 'school-dashboard'. Naming this tab that makes the
// bookmark come back to the tab the student is already in (onboarding included) instead of opening a second one.
try {
  if (!window.name) window.name = 'school-dashboard';
} catch {
  /* a sandboxed frame */
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
installUsageFlush();
