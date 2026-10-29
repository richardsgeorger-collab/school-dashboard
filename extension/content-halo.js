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

// 3. It answers the worker's "are you here?" (0.5.1, 2026-10-02). A Halo tab opened before the extension was installed
//    or updated has no copy of this script (Chrome adds content scripts only to pages loaded after), so a sync that
//    reused that tab heard nothing and gave up as "Halo stopped answering" two minutes later. The worker now asks
//    first and, with no answer, adds this script itself (the scripting permission it already has). That can put a
//    second copy beside an old one orphaned by an update, so everything here runs once per live extension: a copy whose
//    extension was replaced steps aside for the new one.
// 4. Opening Halo while auto-sync is paused because Halo was logged out tells the worker, which syncs then.

(function () {
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const prev = globalThis.__haloPlusHalo;
  if (prev && prev.alive()) return;
  globalThis.__haloPlusHalo = { alive };
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.kind === 'ping') reply({ ok: true });
  });
  // A real Halo page (not its sign-in), so the worker can pick up a paused auto-sync now.
  if (!/^\/(login|auth|admin\/login|halo-admin\/login)/.test(location.pathname)) chrome.runtime.sendMessage({ kind: 'halo-here' }).catch(() => undefined);

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
  // Halo's own success toasts (react-toastify; read again from Halo's code, build T6KDgoiIaE-TpnamHsnFp, 2026-10-28).
  // A toast is one block: Halo's icon (its title "SUCCESS"), "Success", then the words, so the words are looked for
  // anywhere in it (0.12.9: they were looked for only at its start, which Halo's real toast never matched, so a real
  // submission was not seen at all and showed as done only after a later sync).
  //   - "Assignment has been submitted." after Halo's POST …/{id}/submit succeeds; the drawer at
  //     #assignment-submission/{courseClassAssessmentId} (Halo leaves the address as it is).
  //   - "Quiz successfully submitted" (then "See Gradebook for more details") after userQuiz/submit; on
  //     /quiz/{assessmentId}/start-quiz/{userQuizId}, or /quiz/{assessmentId} after a timed quiz ran out.
  //   - "Discussion response has been submitted" after a DQ response (forum/post/send with isSubmitDqAction), its
  //     window at #discussion-submission/{assessmentId}/fid/{forumId}.
  //   - "Discussion post has been submitted": an ordinary post or reply (participation posts are ordinary posts). Not a
  //     submission of any one assessment, so nothing is checked off on a guess; the class is read again from Halo
  //     instead, and what Halo then says is done is done.
  // Failures ("Failed to submit Assignment.", "There was an error submitting your quiz", "An error has occurred.") and
  // edits ("Discussion response has been updated") are left alone.
  const DONE = [
    { re: /Assignment has been submitted\./, kind: 'assignment' },
    { re: /Quiz successfully submitted/, kind: 'quiz' },
    { re: /Discussion response has been submitted/, kind: 'discussion' },
  ];
  const POSTED = /Discussion post has been submitted/;

  // Which assessment the page is on: the last one seen in the last few minutes is kept.
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

  const slugHere = () => {
    const m = /^\/courses\/([^/?#]+)/.exec(location.pathname);
    try {
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  };
  const moments = new Map(); // assessment id -> when its moment was shown (one per submission)
  let lastPosted = 0;
  function onToast(text) {
    if (POSTED.test(text)) {
      // An ordinary post: no check-off, only that class read again from Halo (once in a few seconds).
      if (Date.now() - lastPosted < 4000) return;
      lastPosted = Date.now();
      window.dispatchEvent(new CustomEvent('haloplus:posted', { detail: { slug: slugHere() } }));
      return;
    }
    const hit = DONE.find((d) => d.re.test(text));
    if (!hit) return;
    look();
    const fresh = Date.now() - seen.at < 5 * 60_000 && seen.kind === hit.kind;
    // A DQ response always has its window's address; without it, it is not one Halo+ can name.
    if (hit.kind === 'discussion' && !fresh) return;
    const id = fresh ? seen.id : null;
    // One moment per submission, whatever else Halo re-renders.
    const key = id || `?${hit.kind}`;
    if (moments.has(key) && Date.now() - moments.get(key) < 8000) return;
    moments.set(key, Date.now());
    void submitted(id, hit.kind);
  }

  // Halo's toasts arrive as a whole block (its container, or the toast in an existing container): each new element's
  // words, once.
  const observer = new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 600) onToast(t);
      }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  async function submitted(haloId, kind) {
    let s = {};
    try {
      s = await chrome.storage.local.get(['joySnap', 'tier', 'syncKey']);
    } catch {
      /* the extension was updated under this page */
    }
    // Every plan with an account (Free too: it is Halo's own word).
    if (!s.tier && !s.syncKey) return;
    // Done everywhere at once (the worker: this computer's mark and the account's), then this page's moment and the
    // class read again from Halo (onhalo/submitted.js).
    chrome.runtime.sendMessage({ kind: 'submitted', id: haloId, what: kind }).catch(() => undefined);
    window.dispatchEvent(new CustomEvent('haloplus:submitted', { detail: { id: haloId, kind, slug: slugHere() } }));
    // The moment: Halo's kind of toast, and big confetti (0.12.10); the Celebrations switch off: the toast only.
    const snap = s.joySnap || null;
    globalThis.haloPlusCelebrate(lineFor(snap, haloId), { ...momentFor(snap, haloId), toast: true, quiet: !!(snap && snap.celebrate === false) });
  }

  /** "+50 pts · CHM-113L now 36% done": the class after this one, from the real Halo total. Mirrors src/joy/extSnapshot.ts. */
  function lineFor(snap, haloId) {
    const it = snap && haloId ? snap.items[haloId] : null;
    if (!it) return haloId ? 'Turned in. Nice work.' : 'Turned in. Halo+ is syncing it now.';
    const [points, key, done] = it;
    const c = snap.classes[key];
    if (!c) return `+${points} pts`;
    const pct = Math.min(100, Math.floor(((c[1] + (done ? 0 : points)) / c[2]) * 100));
    return `+${points} pts · ${c[0]} now ${pct}% done`;
  }
  /**
   * The moment's details (0.12.9): the item's own name and points, and this week's progress with it counted, from what
   * Halo+ already has on this computer (the item from Halo+'s data; This week from the same view the panel draws).
   */
  function momentFor(snap, haloId) {
    const M = globalThis.HaloPlusModel;
    const out = {};
    const it = snap && haloId ? snap.items[haloId] : null;
    if (it) out.pts = it[0];
    try {
      const v = globalThis.__haloPlusUi && globalThis.__haloPlusUi.view ? globalThis.__haloPlusUi.view() : null;
      const item = v && haloId ? v.items.find((i) => i.h === haloId) : null;
      if (item) {
        out.title = M && M.nextName ? M.nextName(item) || item.t : item.t;
        if (!out.pts && item.pts) out.pts = item.pts;
      }
      const w = v && M && M.weekProgress ? M.weekProgress(v, Date.now()) : null;
      if (w && w.total > 0) out.week = { done: Math.min(w.total, w.done + (item && !item.done ? 1 : 0)), total: w.total };
    } catch {
      /* the plain moment */
    }
    return out;
  }

  // The confetti and the card are celebrate.js (loaded just before this file, see manifest.json).
})();
