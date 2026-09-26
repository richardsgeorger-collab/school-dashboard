import { installUsageFlush } from './analytics/usage';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { forgetStrayKey } from './chat/key';

// Before anything renders: a production build never keeps an API key in this browser.
forgetStrayKey();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
installUsageFlush();
