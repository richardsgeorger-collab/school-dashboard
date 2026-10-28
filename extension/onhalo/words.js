// Feature 19 (0.12.0): the word count against the minimum. Halo's editor already counts words ("152 words", research
// 2026-10-27), so Halo+ adds only what Halo does not: the minimum the prompt states, as "152 / 150 words", when the
// prompt states one clearly (logic.js wordMinimum: one number, for this box: the initial post or a reply). Otherwise
// nothing. Halo's own count stays in the page for screen readers; its number is the one shown.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;

  const CSS = `.c{display:inline-flex;align-items:center;gap:5px;font:inherit;color:inherit;white-space:nowrap}.ok{color:var(--hp-success)}`;
  const SR = 'position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important';
  const watched = new Map();

  function prompt(w) {
    const modal = /#discussion-submission\//.test(location.hash);
    const el = modal ? document.querySelector('[data-testid="assessment_card"] [data-testid="description"]') : document.querySelector('#scrollRef_dq_description [data-testid="description"]');
    return el ? el.innerText || '' : '';
  }
  function kindOf(w) {
    const label = w.previousElementSibling && /Replying to/.test(w.previousElementSibling.textContent || '');
    return label || w.closest('.toggleReplyEditor') ? 'reply' : 'post';
  }
  function attach(span, min) {
    if (watched.has(span)) return;
    const { h, root } = O.host('words', CSS);
    span.after(h);
    const prev = span.getAttribute('style') || '';
    span.setAttribute('style', `${prev};${SR}`);
    const draw = () => {
      const m = /^(\d+)\s+words?$/.exec((span.textContent || '').trim());
      if (!m) return void (root.innerHTML = '');
      const n = Number(m[1]);
      root.innerHTML = `<span class="c" aria-hidden="true">${n} / ${min} words${n >= min ? ' <span class="ok">✓</span>' : ''}${O.mark()}</span>`;
    };
    const mo = new MutationObserver(draw);
    mo.observe(span, { childList: true, characterData: true, subtree: true });
    draw();
    watched.set(span, { h, mo, prev });
    O.count('words-shown');
  }
  function detach(span) {
    const x = watched.get(span);
    if (!x) return;
    x.mo.disconnect();
    x.h.remove();
    if (x.prev) span.setAttribute('style', x.prev);
    else span.removeAttribute('style');
    watched.delete(span);
  }

  O.feature({
    id: 'words',
    start() {
      this.update();
    },
    update() {
      for (const [span] of watched) if (!span.isConnected) detach(span);
      for (const w of document.querySelectorAll('[data-testid="post_text_editor"]')) {
        const span = w.querySelector('.tiptap-editor [aria-live="polite"][aria-atomic="true"]');
        if (!span || watched.has(span)) continue;
        const min = L.wordMinimum(prompt(w), kindOf(w));
        if (min) attach(span, min);
      }
    },
    stop() {
      for (const [span] of [...watched]) detach(span);
    },
  });
})();
