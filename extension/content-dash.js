// Runs on the dashboard. Tells the service worker which plan this device is on (auto-sync is Plus and Max) and the account's
// sync key, tells the page when a sync is waiting in the account, and hands a kept export to the page exactly the way
// the bookmark would: a postMessage from the page's own origin.
// The page writes its plan once the account has loaded, which is after this script first runs, and a page's own
// writes fire no storage event in that page. So it is read again for a while after load and whenever the tab
// comes back into view, and sent only when it changes (2026-09-30: a Max student was reported as Free).
// The signed-in account's sync key is reported the same way: with it the worker drops every sync into that account,
// so a sync lands even when no Halo+ tab is open. It can drop off a sync and nothing else.
// And what a submission on Halo is worth (points and class codes, nothing else) with the Celebrations switch, so the
// Halo script can say "+50 pts · CHM-113L now 36% done" the moment Halo confirms a submission (0.5.0).
// Since 0.5.2 the worker also adds this script to Halo+ tabs already open when the extension is installed or updated
// (Chrome only adds content scripts to pages loaded after), so the setup screen sees the extension in seconds. Safe
// to add twice: one live copy per extension, and one orphaned by an update steps aside. It also passes the setup's
// "first sync now" to the worker.
(function () {
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const prev = globalThis.__haloPlusDash;
  if (prev && prev.alive()) return;
  globalThis.__haloPlusDash = { alive };

  let last = null;
  let lastKey;
  let lastSnap;
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
    const snap = read('school-dashboard:joy-snap');
    if (snap !== lastSnap && (snap || lastSnap !== undefined)) {
      lastSnap = snap;
      chrome.runtime.sendMessage({ kind: 'joy', snap: snap || null });
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
  // The snapshot changes as work is checked off; a slow look keeps the extension current without a storage event.
  setInterval(report, 30_000);
  window.addEventListener('storage', (e) => (e.key === 'school-dashboard:tier' || e.key === 'school-dashboard:sync-key' || e.key === 'school-dashboard:joy-snap') && report());
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

  // Auto-sync paused (Halo was logged out on a scheduled run) or running again: the page says so on Now (0.5.1).
  const showStatus = (autoPaused) => {
    try {
      if (autoPaused) localStorage.setItem('school-dashboard:ext-status', JSON.stringify({ autoPaused }));
      else localStorage.removeItem('school-dashboard:ext-status');
    } catch {
      /* storage unavailable */
    }
    window.postMessage({ kind: 'halo-ext-status', autoPaused: autoPaused || null }, location.origin);
  };
  chrome.runtime.sendMessage({ kind: 'status' }).then((r) => showStatus(r && r.autoPaused)).catch(() => undefined);

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg) return;
    if (msg.kind === 'ext-status') {
      showStatus(msg.autoPaused);
      reply({ ok: true });
      return;
    }
    // A sync just went to the account: the app takes it from there now, not on its next load.
    if (msg.kind === 'pending') {
      window.postMessage({ kind: 'halo-pending' }, location.origin);
      reply({ ok: true });
      return;
    }
    if (msg.kind === 'kit-progress') {
      window.postMessage({ kind: 'halo-kit-progress', requestId: msg.requestId, note: msg.note }, location.origin);
      reply({ ok: true });
      return;
    }
    if (msg.kind === 'kit-permission') {
      window.postMessage({ kind: 'halo-kit-permission', granted: !!msg.granted }, location.origin);
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

  // The extension setup's last step asks for the first sync now (0.5.2).
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.kind !== 'halo-ext-first-sync') return;
    chrome.runtime.sendMessage({ kind: 'first-sync' }).catch(() => undefined);
  });
  // The help kit (0.6.0): the page asks for an assignment's files; the answer, and progress on the way, come back here.
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.kind !== 'halo-kit-files') return;
    const requestId = e.data.requestId;
    chrome.runtime
      .sendMessage({ kind: 'kit-files', requestId, files: e.data.files })
      .then((r) => window.postMessage({ kind: 'halo-kit-files-result', ...(r || { status: 'error', error: 'no answer' }), requestId }, location.origin))
      .catch((err) => window.postMessage({ kind: 'halo-kit-files-result', requestId, status: 'error', error: String(err) }, location.origin));
  });

})();
