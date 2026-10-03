// Runs on halo.gcu.edu. Two jobs.
//
// 1. The injected sync script posts its export (and its progress) to the page's own window; this carries them to the
//    service worker. Syncing runs on the worker's three-hour schedule and the popup's Sync now, never on opening Halo
//    (George, 2026-09-30).
//
// 2. A submission Halo has confirmed gets a moment right there on Halo (0.5.0, 2026-10-02): gold confetti and a small
//    card, "+50 pts · CHM-113L now 36% done", from the student's last Halo+ data, and a quiet sync so Halo+ shows it.
//    The signal is Halo's own success toast, read from Halo's code (build Jk7eKpHtXMWHqa6Y8LtAT), never guessed:
//      - Submit Assignment POSTs {orchestration}assignment/{id}/submit; only when that succeeds does Halo show the toast
//        "Assignment has been submitted." (a failure shows "Failed to submit Assignment."). The submit modal is open at
//        #assignment-submission/{courseClassAssessmentId}, the same id Halo+ keeps for the assignment.
//      - A quiz: "Quiz successfully submitted", on /quiz/{assessmentId}.
//      - A discussion question response: "Discussion post has been submitted" with the modal open at
//        #discussion-submission/{assessmentId}/fid/{forumId}. The same toast after an ordinary reply (no modal) is
//        not a submission, and is left alone.
//    Halo's toasts are react-toastify; the text is matched, not the styling, so a restyle does not break it.
//    Nothing here reads the page beyond those toasts and the address; nothing is sent anywhere but the worker.

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

// ---- a confirmed submission -----------------------------------------------------------------------------------------
const DONE = [
  { re: /^Assignment has been submitted\./, kind: 'assignment' },
  { re: /^Quiz successfully submitted/, kind: 'quiz' },
  { re: /^Discussion post has been submitted/, kind: 'discussion' },
];

// Which assessment the page is on. Halo closes the submit modal (clearing the address) a moment before its toast, so
// the last one seen in the last few minutes is kept.
let seen = { id: null, kind: null, at: 0 };
function look() {
  const h = location.hash;
  let m = /(?:^#|\/)assignment-submission\/([^/?#]+)/.exec(h);
  if (m) return (seen = { id: decodeURIComponent(m[1]), kind: 'assignment', at: Date.now() });
  m = /(?:^#|\/)discussion-submission\/([^/?#]+)/.exec(h);
  if (m) return (seen = { id: decodeURIComponent(m[1]), kind: 'discussion', at: Date.now() });
  m = /^\/quiz\/([^/?#]+)/.exec(location.pathname);
  if (m) return (seen = { id: decodeURIComponent(m[1]), kind: 'quiz', at: Date.now() });
}
look();
setInterval(look, 700);
window.addEventListener('hashchange', look);

let lastMoment = 0;
function onToast(text) {
  const hit = DONE.find((d) => d.re.test(text));
  if (!hit) return;
  look();
  const fresh = Date.now() - seen.at < 5 * 60_000 && seen.kind === hit.kind;
  // A reply in a discussion shows the same toast as a DQ response; only the response (its modal) is a submission.
  if (hit.kind === 'discussion' && !fresh) return;
  // One moment per submission, whatever else Halo re-renders.
  if (Date.now() - lastMoment < 8000) return;
  lastMoment = Date.now();
  const id = fresh ? seen.id : null;
  void celebrate(id);
}

const observer = new MutationObserver((records) => {
  for (const r of records)
    for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      const t = (n.textContent || '').trim();
      if (t && t.length < 400) onToast(t);
    }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

async function celebrate(haloId) {
  let s = {};
  try {
    s = await chrome.storage.local.get(['joySnap', 'tier']);
  } catch {
    /* the extension was updated under this page */
  }
  // Plus and Max (a Max trial is Max here). Free has no sync to update, so nothing happens there.
  if (s.tier !== 'plus' && s.tier !== 'max') return;
  chrome.runtime.sendMessage({ kind: 'submitted' }).catch(() => undefined);
  const snap = s.joySnap || null;
  if (snap && snap.celebrate === false) return;
  globalThis.haloPlusCelebrate(lineFor(snap, haloId));
}

/** "+50 pts · CHM-113L now 36% done": the class after this one, from the real Halo total. Mirrors src/joy/extSnapshot.ts. */
function lineFor(snap, haloId) {
  const it = snap && haloId ? snap.items[haloId] : null;
  if (!it) return 'Turned in. Halo+ is syncing it now.';
  const [points, key, done] = it;
  const c = snap.classes[key];
  if (!c) return `+${points} pts`;
  const pct = Math.min(100, Math.floor(((c[1] + (done ? 0 : points)) / c[2]) * 100));
  return `+${points} pts · ${c[0]} now ${pct}% done`;
}

// The confetti and the card are celebrate.js (loaded just before this file, see manifest.json).
