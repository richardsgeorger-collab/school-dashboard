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
//
// 0.12.10 (George on real Halo: the white card and the pill stacked in the corner were "boxy and not like Halo"; "make
// the celebration BIG"): on Halo, the moment is one toast built the way Halo builds its own (Halo's success toast:
// its colours from Halo's own variables, its 5 px bar on the left, 4 px corners, shadow, font and size), under Halo's own
// "Assignment has been submitted." in the same corner: "✓ Lab 4: Photosynthesis done", "+30 pts", a thin bar inside
// filling to this week's new mark (0.12.11: no words for the week, the bar says it); short, then it fades. With it, multi-coloured confetti bursting from both sides of the window
// (canvas-confetti, in the extension: vendor/canvas-confetti.js, never fetched), gravity, spin, flutter and drift, about
// four seconds and gone; a bigger one when the week is done. Never in the way of a click (the layer takes none). The
// Celebrations switch off, or the computer's "reduce motion": the toast only. Without `opts.toast` (Admin's preview)
// it is the card it always was.
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

  // ---- the toast and the big confetti (0.12.10) ------------------------------------------------------------------------
  const TOAST_CSS = `
:host { all: initial; }
.t { position: fixed; right: 20px; top: 20px; z-index: 2147483647; box-sizing: border-box; width: 320px; max-width: calc(100vw - 40px);
  display: flex; align-items: flex-start; gap: 0; padding: .5rem 1rem; border-radius: 4px; border-left: 5px solid var(--lms-alertSuccessColor, #2e7d32);
  background: var(--lms-alertSuccessBackgroundColor, #edf7ed); color: var(--lms-textPrimaryColor, #212121);
  box-shadow: 0 20px 25px -5px #0000001a, 0 10px 10px -5px #0000000a;
  font-family: var(--lms-fontFamily, 'Open Sans', 'Helvetica Neue', Arial, sans-serif); font-size: 14px; line-height: 1.33; pointer-events: auto;
  animation: t-in 360ms cubic-bezier(.2,.9,.25,1) both; }
.t.out { animation: t-out 420ms ease-in forwards; }
@keyframes t-in { from { opacity: 0; transform: translateX(24px); } }
@keyframes t-out { to { opacity: 0; transform: translateY(-6px); } }
.ic { flex: none; width: 22px; height: 22px; margin: 9px .75rem 0 0; color: var(--lms-alertSuccessColor, #2e7d32); }
.ic svg { width: 22px; height: 22px; display: block; overflow: visible; }
.ic .tick { stroke-dasharray: 16; stroke-dashoffset: 16; animation: tick 360ms 220ms ease-out forwards; }
.ic circle { transform-origin: 12px 12px; animation: pop 460ms cubic-bezier(.2,1.6,.4,1) both; }
@keyframes tick { to { stroke-dashoffset: 0; } }
@keyframes pop { from { transform: scale(.4); } 60% { transform: scale(1.15); } to { transform: scale(1); } }
.m { flex: 1; min-width: 0; margin: .5rem 0; }
.m strong { display: block; font-weight: var(--lms-fontWeightBold, 700); overflow-wrap: anywhere; }
.s { display: block; margin-top: 2px; }
.s .p { font-weight: var(--lms-fontWeightBold, 700); font-variant-numeric: tabular-nums; }
.bar { display: block; position: relative; height: 3px; margin-top: 8px; border-radius: 2px; overflow: hidden;
  background: color-mix(in srgb, var(--lms-alertSuccessColor, #2e7d32) 18%, transparent); }
.fill { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: var(--lms-alertSuccessColor, #2e7d32); transition: width 900ms cubic-bezier(.2,.8,.2,1) 300ms; }
.x { flex: none; margin: 4px -6px 0 8px; border: 0; background: none; color: inherit; opacity: .45; font: 16px/1 system-ui; cursor: pointer; padding: 2px 4px; }
.x:hover, .x:focus-visible { opacity: .9; }
.still .t, .still .t.out, .still .ic .tick, .still .ic circle { animation: none; }
.still .ic .tick { stroke-dashoffset: 0; }
.still .fill { transition: none; }
.cf { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483646; }
`;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path class="tick" d="M7 12.4l3.3 3.3L17.2 8.8" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const COLORS = ['#522398', '#8a5cd6', '#f2b84b', '#ffd96a', '#07bc0c', '#2fb8ff', '#ff5d8f', '#ff8a3d', '#ffffff'];

  /** Below Halo's own toast when it is showing, in the same column; else where Halo's would be. */
  function toastTop() {
    const c = document.querySelector('.Toastify__toast-container');
    const r = c && c.getBoundingClientRect();
    return r && r.height > 8 && r.top < innerHeight / 2 ? Math.round(r.bottom + 6) : 20;
  }

  /** The confetti: from both sides, in waves; a bigger one for a finished week. Gone after about four seconds. */
  function burst(root, big) {
    const lib = globalThis.confetti;
    if (!lib || typeof lib.create !== 'function') return void confetti(root.querySelector('.wrap'), big ? 140 : 90);
    const canvas = document.createElement('canvas');
    canvas.className = 'cf';
    root.append(canvas);
    const fire = lib.create(canvas, { resize: true, useWorker: false });
    const side = (x, n, v) =>
      fire({ particleCount: n, angle: x < 0.5 ? 58 : 122, spread: 58, startVelocity: v, origin: { x, y: 0.72 }, colors: COLORS, ticks: 210, gravity: 1.05, decay: 0.915, drift: x < 0.5 ? 0.35 : -0.35, scalar: 1.05, shapes: ['square', 'circle'] });
    const waves = big ? [[0, 85, 74], [200, 70, 66], [420, 60, 58], [700, 50, 52]] : [[0, 70, 68], [200, 55, 60], [430, 40, 52]];
    for (const [ms, n, v] of waves)
      setTimeout(() => {
        side(0, n, v);
        side(1, n, v);
      }, ms);
    if (big)
      setTimeout(() => fire({ particleCount: 120, spread: 170, startVelocity: 48, origin: { x: 0.5, y: 0.32 }, colors: COLORS, ticks: 220, gravity: 0.9, decay: 0.92, scalar: 1.25, shapes: ['star', 'circle'] }), 320);
    setTimeout(() => {
      try {
        fire.reset();
      } catch {
        /* gone */
      }
      canvas.remove();
    }, big ? 4700 : 4100);
  }

  /** The toast, Halo's own way; the confetti unless quiet (the Celebrations switch off) or still (reduce motion). */
  function toast(text, o) {
    const host = document.createElement('div');
    host.id = 'haloplus-joy';
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS + TOAST_CSS;
    const still = typeof o.still === 'boolean' ? o.still : matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wrap = document.createElement('div');
    wrap.className = `wrap${still ? ' still' : ''}`;
    root.append(style, wrap);
    const w = o.week && o.week.total > 0 ? o.week : null;
    const all = !!w && w.done >= w.total;
    const t = document.createElement('div');
    t.className = 't toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.style.top = `${toastTop()}px`;
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.innerHTML = ICON;
    const m = document.createElement('span');
    m.className = 'm';
    const strong = document.createElement('strong');
    strong.textContent = o.title ? `${o.title} done` : 'Turned in';
    const sub = document.createElement('span');
    sub.className = 's';
    const pts = o.pts > 0 ? Number(o.pts) : (/^\+(\d+) pts/.exec(text || '') || [])[1] ? Number(/^\+(\d+) pts/.exec(text)[1]) : 0;
    const p = document.createElement('span');
    p.className = 'p';
    if (pts) {
      p.textContent = `+${still ? pts : 0} pts`;
      sub.append(p);
    }
    // The title, the points and the bar (0.12.11, George: no "3 of 10 this week" words; the bar says it).
    if (!pts && !w && text) sub.append(document.createTextNode(text));
    m.append(strong, sub);
    if (w) {
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('span');
      fill.className = 'fill';
      fill.style.width = `${(still ? Math.min(1, w.done / w.total) : Math.max(0, w.done - 1) / w.total) * 100}%`;
      bar.append(fill);
      m.append(bar);
      if (!still) requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${Math.min(1, w.done / w.total) * 100}%`)));
    }
    const x = document.createElement('button');
    x.className = 'x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '×';
    t.append(ic, m, x);
    wrap.append(t);
    (document.body || document.documentElement).append(host);
    if (pts && !still) {
      const t0 = performance.now() + 200;
      const step = (now) => {
        const k = Math.max(0, Math.min(1, (now - t0) / 700));
        p.textContent = `+${Math.round(pts * (1 - Math.pow(1 - k, 3)))} pts`;
        if (k < 1 && p.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    if (!o.quiet && !still) burst(root, all);
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      t.classList.add('out');
      setTimeout(() => t.remove(), still ? 0 : 430);
      // The confetti finishes on its own; the host goes when both are done.
      setTimeout(() => host.remove(), still ? 0 : all ? 4800 : 4200);
    };
    x.addEventListener('click', close);
    timer = setTimeout(close, 4500);
    t.addEventListener('mouseenter', () => clearTimeout(timer));
    t.addEventListener('mouseleave', () => (timer = setTimeout(close, 1800)));
  }

  function show(text, opts) {
    document.getElementById('haloplus-joy')?.remove();
    const o = opts || {};
    if (o.toast) return toast(text, o);
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
