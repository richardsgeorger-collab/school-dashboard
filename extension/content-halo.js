// Runs on halo.gcu.edu. Two jobs. One: the injected sync script posts its export to the page's own window; this
// carries it to the service worker. Two: opening Halo is itself the sync. When the page has settled and the last
// sync from this browser is older than half an hour, it asks the worker to run one, right here in this tab.
// Nothing here reads the page or the session itself.
const AUTO_AFTER_MS = 30 * 60 * 1000;

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.kind !== 'halo-export') return;
  window.postMessage({ kind: 'halo-received', exportedAt: e.data.exportedAt }, location.origin);
  chrome.runtime.sendMessage({ kind: 'halo-export', payload: e.data });
});

// Only once the app has rendered something that needs a login (a logged-out Halo has no course content), and only
// on a real visit, not while a sync opened this tab in the background.
async function maybeSync() {
  try {
    const { lastSyncAt, syncOnOpen, openedBySync } = await chrome.storage.local.get(['lastSyncAt', 'syncOnOpen', 'openedBySync']);
    if (syncOnOpen === false || openedBySync) return;
    if (lastSyncAt && Date.now() - new Date(lastSyncAt).getTime() < AUTO_AFTER_MS) return;
    if (document.visibilityState !== 'visible') return;
    chrome.runtime.sendMessage({ kind: 'sync-now', auto: true });
  } catch {
    /* the worker is asleep or the storage is unavailable; the next visit tries again */
  }
}
if (document.readyState === 'complete') setTimeout(maybeSync, 4000);
else window.addEventListener('load', () => setTimeout(maybeSync, 4000));
