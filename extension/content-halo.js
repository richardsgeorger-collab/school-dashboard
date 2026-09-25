// Runs on halo.gcu.edu. The injected sync script posts its export to the page's own window; this carries it to the
// service worker. Nothing here reads the page or the session itself.
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.kind !== 'halo-export') return;
  window.postMessage({ kind: 'halo-received', exportedAt: e.data.exportedAt }, location.origin);
  chrome.runtime.sendMessage({ kind: 'halo-export', payload: e.data });
});
