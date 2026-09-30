// Runs on halo.gcu.edu. One job: the injected sync script posts its export (and its progress) to the page's own
// window; this carries them to the service worker. Nothing here reads the page or the session itself. Syncing runs on
// the worker's three-hour schedule and the popup's Sync now, never on opening Halo (George, 2026-09-30).

// The sync script also says how far it has got ('halo-progress') and when it failed ('halo-failed'). A real account
// takes minutes, not seconds: the worker waits for as long as progress keeps coming, and shows Halo's own error.
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data) return;
  if (e.data.kind === 'halo-progress' || e.data.kind === 'halo-failed') {
    chrome.runtime.sendMessage({ kind: e.data.kind, text: String(e.data.text || '').slice(0, 300) }).catch(() => undefined);
    return;
  }
  if (e.data.kind !== 'halo-export') return;
  window.postMessage({ kind: 'halo-received', exportedAt: e.data.exportedAt }, location.origin);
  chrome.runtime.sendMessage({ kind: 'halo-export', payload: e.data });
});
