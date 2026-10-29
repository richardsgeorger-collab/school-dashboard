// The moment on a Halo page (0.5.0): gold confetti over the page and a small card, all inside one shadow root so Halo's
// styles and ours never meet. A plain script on purpose: the extension loads it before content-halo.js (manifest), and
// the Halo+ app's Admin → Celebrations preview imports this same file, so what an admin previews is what Halo shows.
// It touches nothing but the page it is on: no storage, no messages.
//
// 0.12.9 (George: "submitting should feel great immediately", "more dopamine"): with the submission's details
// (`opts.title`, `opts.pts`, `opts.week`), the card is the check-off itself, in Halo's own type: a check that pops and
// draws itself with a burst of gold sparks, "Topic 7 DQ 1 · done", the points counting up, and this week's bar filling
// to its new mark ("4 of 9 done this week"; "Week done" on the last one). Without them it is the card it always was.
// Reduced motion: no confetti, no movement, everything at its end state.
(function () {
  const MARK = '<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><ellipse cx="16" cy="17" rx="11" ry="5.5" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
  const CHECK = '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring" cx="18" cy="18" r="17"/><path class="tick" d="M10.5 18.5l5 5 10-11" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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

/* The check-off (0.12.9): Halo's own type and card, Halo+'s gold for the joy. */
/* Just above Halo+'s pill in the same corner, which says what is next meanwhile. */
.card.done { bottom: 66px; align-items: flex-start; gap: 14px; width: 340px; padding: 16px 38px 16px 16px; border-radius: 10px; font-family: 'Open Sans', 'Helvetica Neue', Arial, sans-serif; animation: pop-in 420ms cubic-bezier(.2,1.4,.4,1) both; }
@keyframes pop-in { from { opacity: 0; transform: translateY(14px) scale(.96); } }
.ck { position: relative; flex: none; width: 40px; height: 40px; margin-top: 1px; }
.ck svg { width: 40px; height: 40px; display: block; overflow: visible; }
.ck .ring { fill: #1f8a3b; transform-origin: 18px 18px; animation: ring 520ms cubic-bezier(.2,1.6,.4,1) both; }
.ck .tick { stroke-dasharray: 26; stroke-dashoffset: 26; animation: tick 380ms 260ms ease-out forwards; }
@keyframes ring { from { transform: scale(.3); } 60% { transform: scale(1.14); } to { transform: scale(1); } }
@keyframes tick { to { stroke-dashoffset: 0; } }
.sp { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #f2b84b; opacity: 0; }
.t { display: block; font-weight: 700; font-size: 15px; line-height: 1.3; letter-spacing: -0.005em; overflow-wrap: anywhere; }
.t .d { color: #1f8a3b; font-weight: 700; white-space: nowrap; }
.l { display: block; margin-top: 3px; font-size: 13px; color: #4a4f57; }
.l .pts { color: #b77f10; font-weight: 700; font-variant-numeric: tabular-nums; }
.wk { display: block; margin-top: 10px; }
.wk .bar { position: relative; height: 6px; border-radius: 3px; background: #ebe7f3; overflow: hidden; }
.wk .fill { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: #522398; transition: width 900ms cubic-bezier(.2,.8,.2,1) 350ms; }
.wk .fill::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgb(255 255 255 / .55), transparent); transform: translateX(-100%); animation: shine 900ms 1150ms ease-out; }
@keyframes shine { to { transform: translateX(100%); } }
.wk .fill.all { background: #1f8a3b; }
.wk .n { display: block; margin-top: 5px; font-size: 12px; color: #6c727c; font-variant-numeric: tabular-nums; }
.wk .n b { color: #14171c; font-weight: 700; }

.dark .card { background: #15181c; color: #f2f4f7; border-color: rgb(255 255 255 / 0.12); box-shadow: 0 12px 32px rgb(0 0 0 / 0.5); }
.dark .card .m { color: #f2b84b; }
.dark .card .x { color: #8a919d; }
.dark .l { color: #b9bfc8; }
.dark .l .pts { color: #f2b84b; }
.dark .wk .bar { background: rgb(255 255 255 / .12); }
.dark .wk .fill { background: #b39ddb; }
.dark .wk .fill.all, .dark .ck .ring { fill: #3fb36a; background: #3fb36a; }
.dark .t .d { color: #5fd08a; }
.dark .wk .n { color: #9aa1ab; }
.dark .wk .n b { color: #f2f4f7; }
@media (prefers-color-scheme: dark) {
  .auto .card { background: #15181c; color: #f2f4f7; border-color: rgb(255 255 255 / 0.12); box-shadow: 0 12px 32px rgb(0 0 0 / 0.5); }
  .auto .card .m { color: #f2b84b; }
  .auto .card .x { color: #8a919d; }
}
.still .card, .still .card.out, .still .ck .ring, .still .ck .tick, .still .wk .fill::after { animation: none; }
.still .ck .tick { stroke-dashoffset: 0; }
.still .wk .fill { transition: none; }
`;
  const GOLD = ['#dfa321', '#f2b84b', '#f6d77a', '#e0a526', '#fbf1d3'];

  /** Halo's page in a dark theme (Better Halo's dark themes put "dark" on the page's root). */
  const darkPage = () => {
    const r = document.documentElement;
    return !!r.getAttribute('data-better-halo-theme') && r.classList.contains('dark');
  };

  function confetti(wrap, n) {
    const h = innerHeight;
    for (let i = 0; i < n; i++) {
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

  /** The check-off card's insides: the popping check with its sparks, the item, the points, this week's bar. */
  function doneCard(card, text, o, still) {
    card.classList.add('done');
    const ck = document.createElement('span');
    ck.className = 'ck';
    ck.innerHTML = CHECK;
    if (!still)
      for (let i = 0; i < 10; i++) {
        const s = document.createElement('i');
        s.className = 'sp';
        s.style.background = GOLD[i % GOLD.length];
        ck.append(s);
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
        const d = 26 + Math.random() * 12;
        s.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.4)`, opacity: 0 },
          ],
          { duration: 620, delay: 180, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' },
        );
      }
    const words = document.createElement('span');
    words.style.minWidth = '0';
    const t = document.createElement('span');
    t.className = 't';
    if (o.title) {
      t.append(document.createTextNode(`${o.title} · `));
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = 'done';
      t.append(d);
    } else t.textContent = 'Turned in';
    words.append(t);
    // "+50 pts · CHM-113L now 36% done", the points counting up.
    const l = document.createElement('span');
    l.className = 'l';
    const m = /^\+(\d+) pts(.*)$/.exec(text || '');
    if (m) {
      const pts = document.createElement('span');
      pts.className = 'pts';
      const target = Number(m[1]);
      pts.textContent = `+${still ? target : 0} pts`;
      l.append(pts, document.createTextNode(m[2]));
      if (!still && target > 0) {
        const t0 = performance.now() + 250;
        const step = (now) => {
          const k = Math.max(0, Math.min(1, (now - t0) / 750));
          pts.textContent = `+${Math.round(target * (1 - Math.pow(1 - k, 3)))} pts`;
          if (k < 1 && pts.isConnected) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    } else l.textContent = text || '';
    if (l.textContent) words.append(l);
    // This week, the bar moving from where it was to where it is now.
    const w = o.week;
    if (w && w.total > 0) {
      const wk = document.createElement('span');
      wk.className = 'wk';
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.display = 'block';
      const fill = document.createElement('span');
      fill.className = 'fill';
      const all = w.done >= w.total;
      if (all) fill.classList.add('all');
      const from = Math.max(0, w.done - 1) / w.total;
      const to = Math.min(1, w.done / w.total);
      fill.style.width = `${(still ? to : from) * 100}%`;
      bar.append(fill);
      const n = document.createElement('span');
      n.className = 'n';
      if (all) n.innerHTML = '<b>Week done</b> · every one turned in';
      else {
        const b = document.createElement('b');
        b.textContent = `${w.done} of ${w.total}`;
        n.append(b, document.createTextNode(' done this week'));
      }
      wk.append(bar, n);
      words.append(wk);
      if (!still) requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${to * 100}%`)));
    }
    card.append(ck, words);
  }

  function show(text, opts) {
    document.getElementById('haloplus-joy')?.remove();
    const o = opts || {};
    const host = document.createElement('div');
    host.id = 'haloplus-joy';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const wrap = document.createElement('div');
    const still = typeof o.still === 'boolean' ? o.still : matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rich = !!(o.title || o.week);
    wrap.className = `wrap${darkPage() ? ' dark' : ' auto'}${still ? ' still' : ''}`;
    root.append(style, wrap);
    if (still) {
      const g = document.createElement('div');
      g.className = 'glow';
      wrap.append(g);
    } else confetti(wrap, rich ? 90 : 70);
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    if (rich) doneCard(card, text, o, still);
    else {
      const mark = document.createElement('span');
      mark.className = 'm';
      mark.innerHTML = MARK;
      const words = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = text;
      words.append(b);
      card.append(mark, words);
    }
    const x = document.createElement('button');
    x.className = 'x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '×';
    card.append(x);
    wrap.append(card);
    (document.body || document.documentElement).append(host);
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      card.classList.add('out');
      setTimeout(() => host.remove(), still ? 0 : 280);
    };
    x.addEventListener('click', close);
    // Long enough to take in; it waits while the pointer is on it.
    const wait = rich ? 7000 : 6000;
    timer = setTimeout(close, wait);
    card.addEventListener('mouseenter', () => clearTimeout(timer));
    card.addEventListener('mouseleave', () => (timer = setTimeout(close, 2500)));
  }
  globalThis.haloPlusCelebrate = show;
})();
