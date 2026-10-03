// The moment on a Halo page (0.5.0): gold confetti over the page and a small card, all inside one shadow root so Halo's
// styles and ours never meet. A plain script on purpose: the extension loads it before content-halo.js (manifest), and
// the Halo+ app's Admin → Celebrations preview imports this same file, so what an admin previews is what Halo shows.
// It touches nothing but the page it is on: no storage, no messages.
(function () {
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

function show(text, opts) {
  document.getElementById('haloplus-joy')?.remove();
  const host = document.createElement('div');
  host.id = 'haloplus-joy';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  root.append(style, wrap);
  const still = opts && typeof opts.still === 'boolean' ? opts.still : matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  globalThis.haloPlusCelebrate = show;
})();
