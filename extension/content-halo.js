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
  show(lineFor(snap, haloId));
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

// ---- the moment: everything inside one shadow root, so Halo's styles and ours never meet ---------------------------
const MARK = '<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><ellipse cx="16" cy="17" rx="11" ry="5.5" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
const CSS = `
:host { all: initial; }
.wrap { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font: 500 14px/1.4 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
.c { position: absolute; top: -16px; border-radius: 2px; will-change: transform, opacity; }
.glow { position: absolute; inset: 0; background: radial-gradient(60% 45% at 50% 0%, rgb(242 184 75 / 0.32), transparent 70%); animation: g 1.8s ease-out forwards; }
@keyframes g { from { opacity: 0; } 25% { opacity: 1; } to { opacity: 0; } }
.card { position: absolute; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 10px; max-width: min(360px, calc(100vw - 40px)); padding: 12px 36px 12px 14px; border-radius: 14px; pointer-events: auto;
  background: #ffffff; color: #14171c; border: 1px solid rgb(16 20 28 / 0.12); box-shadow: 0 12px 32px rgb(16 20 28 / 0.18); animation: in 320ms cubic-bezier(.2,.8,.2,1) both; }
.card .m { color: #dfa321; display: grid; place-items: center; flex: none; }
.card b { font-weight: 650; }
.card .x { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: #69717f; font: 18px/1 system-ui; cursor: pointer; padding: 2px 4px; }
.card .x:focus-visible { outline: 2px solid #dfa321; outline-offset: 2px; border-radius: 4px; }
.card.out { animation: out 260ms ease-in forwards; }
@keyframes in { from { opacity: 0; transform: translateY(10px); } }
@keyframes out { to { opacity: 0; transform: translateY(6px); } }
@media (prefers-color-scheme: dark) {
  .card { background: #15181c; color: #f2f4f7; border-color: rgb(255 255 255 / 0.12); box-shadow: 0 12px 32px rgb(0 0 0 / 0.5); }
  .card .m { color: #f2b84b; }
  .card .x { color: #8a919d; }
}
@media (prefers-reduced-motion: reduce) {
  .card, .card.out { animation: none; }
}
`;
const GOLD = ['#dfa321', '#f2b84b', '#f6d77a', '#e0a526', '#fbf1d3'];

function show(text) {
  document.getElementById('haloplus-joy')?.remove();
  const host = document.createElement('div');
  host.id = 'haloplus-joy';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  root.append(style, wrap);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) {
    const g = document.createElement('div');
    g.className = 'glow';
    wrap.append(g);
  } else {
    const h = innerHeight;
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.className = 'c';
      const size = 6 + Math.random() * 7;
      const round = Math.random() > 0.6;
      p.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${round ? size : size * 0.45}px;background:${GOLD[i % GOLD.length]};${round ? 'border-radius:50%;' : ''}`;
      wrap.append(p);
      const drift = (Math.random() - 0.5) * 140;
      const rot = Math.random() * 720 - 360;
      p.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${drift}px, ${h + 40}px) rotate(${rot}deg)`, opacity: 0.9 },
        ],
        { duration: 1300 + Math.random() * 900, delay: Math.random() * 350, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'both' },
      ).onfinish = () => p.remove();
    }
  }
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const mark = document.createElement('span');
  mark.className = 'm';
  mark.innerHTML = MARK;
  const words = document.createElement('span');
  const b = document.createElement('b');
  b.textContent = text;
  words.append(b);
  const x = document.createElement('button');
  x.className = 'x';
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.textContent = '×';
  card.append(mark, words, x);
  wrap.append(card);
  (document.body || document.documentElement).append(host);
  const close = () => {
    card.classList.add('out');
    setTimeout(() => host.remove(), still ? 0 : 280);
  };
  x.addEventListener('click', close);
  setTimeout(close, 6000);
}
