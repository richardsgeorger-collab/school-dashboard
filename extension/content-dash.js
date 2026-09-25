// Runs on the dashboard. Tells the service worker which plan this device is on (auto-sync is Plus), and hands a
// delivered export to the page exactly the way the bookmark would: a postMessage from the page's own origin.
const report = () => {
  let tier = 'free';
  try {
    tier = localStorage.getItem('school-dashboard:tier') || 'free';
  } catch {
    /* storage unavailable */
  }
  chrome.runtime.sendMessage({ kind: 'tier', tier });
};
report();
window.addEventListener('storage', (e) => e.key === 'school-dashboard:tier' && report());

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
