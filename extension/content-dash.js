// Runs on the dashboard. Tells the service worker which plan this device is on (auto-sync is Plus), and hands a
// delivered export to the page exactly the way the bookmark would: a postMessage from the page's own origin.
// The page writes its plan once the account has loaded, which is after this script first runs, and a page's own
// writes fire no storage event in that page. So it is read again for a while after load and whenever the tab
// comes back into view, and sent only when it changes (2026-09-30: a Max student was reported as Free).
let last = null;
const report = () => {
  let tier = null;
  try {
    tier = localStorage.getItem('school-dashboard:tier');
  } catch {
    /* storage unavailable */
  }
  if (!tier || tier === last) return;
  last = tier;
  chrome.runtime.sendMessage({ kind: 'tier', tier });
};
report();
const early = setInterval(report, 2000);
setTimeout(() => clearInterval(early), 60_000);
window.addEventListener('storage', (e) => e.key === 'school-dashboard:tier' && report());
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && report());

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.kind !== 'deliver') return;
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
      reply({ ok: got });
      return;
    }
    window.postMessage(msg.payload, location.origin);
  }, 400);
  return true;
});
