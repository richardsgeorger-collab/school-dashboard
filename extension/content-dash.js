// Runs on the dashboard. Tells the service worker which plan this device is on (auto-sync is Plus) and the account's
// sync key, tells the page when a sync is waiting in the account, and hands a kept export to the page exactly the way
// the bookmark would: a postMessage from the page's own origin.
// The page writes its plan once the account has loaded, which is after this script first runs, and a page's own
// writes fire no storage event in that page. So it is read again for a while after load and whenever the tab
// comes back into view, and sent only when it changes (2026-09-30: a Max student was reported as Free).
// The signed-in account's sync key is reported the same way: with it the worker drops every sync into that account,
// so a sync lands even when no Halo+ tab is open. It can drop off a sync and nothing else.
let last = null;
let lastKey;
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const report = () => {
  const tier = read('school-dashboard:tier');
  if (tier && tier !== last) {
    last = tier;
    chrome.runtime.sendMessage({ kind: 'tier', tier });
  }
  const key = read('school-dashboard:sync-key');
  if (key !== lastKey && (key || lastKey !== undefined)) {
    lastKey = key;
    chrome.runtime.sendMessage({ kind: 'key', key: key || null });
  }
};
report();
// Which extension this browser runs, for Halo+'s own error reports.
try {
  localStorage.setItem('school-dashboard:ext-version', chrome.runtime.getManifest().version);
} catch {
  /* storage unavailable */
}
const early = setInterval(report, 2000);
setTimeout(() => clearInterval(early), 60_000);
window.addEventListener('storage', (e) => (e.key === 'school-dashboard:tier' || e.key === 'school-dashboard:sync-key') && report());
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && report());

/** Posts an export to the page until the app says it has it (the app's listener mounts a moment after load). */
function handOver(payload, done) {
  let got = false;
  const onAck = (e) => {
    if (e.data && e.data.kind === 'halo-received') got = true;
  };
  window.addEventListener('message', onAck);
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (got || Date.now() - t0 > 15000) {
      clearInterval(iv);
      window.removeEventListener('message', onAck);
      done(got);
      return;
    }
    window.postMessage(payload, location.origin);
  }, 400);
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg) return;
  // A sync just went to the account: the app takes it from there now, not on its next load.
  if (msg.kind === 'pending') {
    window.postMessage({ kind: 'halo-pending' }, location.origin);
    reply({ ok: true });
    return;
  }
  if (msg.kind !== 'deliver') return;
  handOver(msg.payload, (ok) => reply({ ok }));
  return true;
});

// A sync kept in the extension (the account could not be reached) goes in now: to the account when it can, else here.
chrome.runtime.sendMessage({ kind: 'take-waiting', key: read('school-dashboard:sync-key') || undefined }).then((r) => {
  if (r && r.pending) window.postMessage({ kind: 'halo-pending' }, location.origin);
  else if (r && r.payload) handOver(r.payload, (ok) => ok && chrome.runtime.sendMessage({ kind: 'landed', exportedAt: r.payload.exportedAt }));
}).catch(() => undefined);
