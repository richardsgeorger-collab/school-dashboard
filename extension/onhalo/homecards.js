// Feature (0.12.5, George picked option B, with changes): Halo's class cards on Student Home, more useful and still
// clearly Halo's. Each card keeps Halo's shape, its own colour stripe (untouched), its Topic chip, its name and its Go to
// class button; Halo+ adds the class grade at the top right beside the chip (as Halo's gradebook has it; none when
// Better Halo already shows it), puts Halo's dates, instructor and class size on one quiet line (kept visible: a card
// with them reads as Halo's, and there is no hover on a touchscreen; "28 students" still opens Halo's roster), and a
// NEXT box in a light tint of the class colour with up to three things for that class (logic.js cardNext: what can be
// done now first, then what cannot yet, greyed with why; each opens on Halo; nothing that is not certain). The Halo+
// class line steps aside (the box says what it said). Cards in a row are one height, so the Go to class buttons line
// up. A finished class (Halo's "Post-Class" chip) is a card like the others, in its place in Halo's grid (0.12.6).
// Halo redraws Student Home without reloading, so the hiding is keyed to a mark on the page's root and the cards are
// redone before the browser paints, only when one is not done.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  const M = globalThis.HaloPlusModel;
  if (!O || !L || !M) return;
  const ROOT = document.documentElement;
  let on = false;
  let grades = null;
  let asking = false;
  let lastK = -1;

  const cardsNow = () => [...document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')].filter((c) => !c.closest('[data-haloplus]'));
  function slugOf(card) {
    const a = card.querySelector('a[href^="/courses/"]');
    const m = a && /^\/courses\/([^/?#]+)/.exec(a.getAttribute('href') || '');
    return m ? decodeURIComponent(m[1]) : null;
  }
  const textOf = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  // The class colour as the week strip reads it (calendar.js cardColor: Halo's own colour on the card), its bold version;
  // when the card no longer carries it (Better Halo rebuilds the cards a few seconds after Halo), the colour the week
  // strip saved for the class, then the class's colour in the index.
  const colorOf = (card, slug) => {
    if (!O.cal) return 'var(--lms-grayBD, #bdbdbd)';
    const saved = O.cal.stripes || {};
    const key = Object.keys(saved).find((s) => s.toLowerCase() === slug.toLowerCase());
    const idx = O.st.haloIndex;
    const cls = idx && Array.isArray(idx.classes) ? idx.classes.find((c) => (c.slug || '').toLowerCase() === slug.toLowerCase()) : null;
    const own = O.cal.cardColor(card);
    const raw = (own && /^(rgb|#)/.test(own) && own) || (key && saved[key]) || (cls && cls.hex);
    return (raw && O.cal.colorFor(raw)) || raw || 'var(--lms-grayBD, #bdbdbd)';
  };

  /** The NEXT box's lines for one class: null while Halo's answer is not here (no box then, never a guess). */
  function nextFor(slug) {
    const idx = O.st.haloIndex;
    if (!idx || !Array.isArray(idx.classes) || !grades) return null;
    const k = idx.classes.findIndex((c) => (c.slug || '').toLowerCase() === slug.toLowerCase());
    if (k < 0) return null;
    lastK = k;
    const doneIds = new Set(((O.view && O.view.items) || []).filter((i) => i.h && i.done === 1).map((i) => i.h));
    return L.cardNext(idx, k, grades[idx.classes[k].slug], Date.now(), O.zone(), { doneIds });
  }
  /**
   * The box, calm (0.12.6, George: it read like a crammed table): one item a line with room between them, the title in
   * Halo's link style with its time right after it in gray ("Topic 7 DQ 1 · today 11:59 PM"); what cannot be acted on
   * yet in plain gray with its reason ("Exam 1 · in class Fri"); the first a little stronger, so the eye lands on it.
   */
  function nextHtml(list) {
    const head = `<small>Next${O.mark()}</small>`;
    if (!list.length) return `${head}<div class="hp-n-none">Nothing due soon</div>`;
    return `${head}${list
      .map((i, k) => `<a class="hp-n-row${i.why ? ' hp-n-wait' : ''}${k === 0 ? ' hp-n-first' : ''}" href="${O.esc(i.href)}" title="${O.esc(`${i.title} · Due ${i.full}${i.why ? ` · ${i.why}` : ''}`)}"><span class="hp-n-t">${O.esc(i.title)}</span><span class="hp-n-w">&nbsp;· ${O.esc(i.why || i.when)}</span></a>`)
      .join('')}`;
  }
  // ---- just turned in (0.12.9) ----------------------------------------------------------------------------------------------
  // Work turned in on Halo in the last half hour (onhalo/submitted.js) that this computer has not shown ticked off yet:
  // the class card's NEXT box shows it once at its top, checked and struck through, then folds it away (George: "more
  // dopamine"). Once per submission, here or on any later Student Home.
  const shownHere = new Set();
  function justFor(slug, k) {
    const j = O.st.haloJustDone;
    const idx = O.st.haloIndex;
    if (!j || !j.ids || !idx || !Array.isArray(idx.rows)) return [];
    const out = [];
    for (const [id, at] of Object.entries(j.ids)) {
      if (Date.now() - at > 30 * 60_000 || (j.shown && j.shown[id]) || shownHere.has(id)) continue;
      const r = idx.rows.find((x) => x.id === id && x.c === k);
      if (r) out.push({ id, title: r.title });
    }
    return out.slice(0, 2);
  }
  async function shown(ids) {
    for (const id of ids) shownHere.add(id);
    try {
      const { haloJustDone } = await chrome.storage.local.get('haloJustDone');
      const j = haloJustDone && haloJustDone.ids ? haloJustDone : { v: 1, ids: {} };
      await chrome.storage.local.set({ haloJustDone: { ...j, shown: { ...(j.shown || {}), ...Object.fromEntries(ids.map((id) => [id, 1])) } } });
    } catch {
      /* this page only */
    }
  }
  const justHtml = (list) => list.map((i) => `<span class="hp-n-row hp-n-just" data-just="${O.esc(i.id)}" title="${O.esc(`${i.title} · turned in`)}"><span class="hp-n-ck" aria-hidden="true"></span><span class="hp-n-t">${O.esc(i.title)}</span><span class="hp-n-w">&nbsp;· done</span></span>`).join('');
  /** The ticked rows: checked and struck at once, then folded away, and the box drawn as it is now. */
  function playJust(c, n) {
    const rows = [...n.querySelectorAll('.hp-n-just')];
    if (!rows.length || n.dataset.playing) return;
    n.dataset.playing = '1';
    const ids = rows.map((r) => r.dataset.just);
    void shown(ids);
    setTimeout(() => {
      for (const r of rows) r.classList.add('hp-n-gone');
      setTimeout(() => {
        delete n.dataset.playing;
        n.dataset.html = '';
        if (c.isConnected) card(c);
      }, 420);
    }, 2400);
  }

  function gradeOf(slug) {
    const cls = O.view && O.view.classes ? O.view.classes.find((c) => (c.slug || '').toLowerCase() === slug.toLowerCase()) : null;
    return cls ? M.gradeText(cls) : null;
  }

  /** One card as option B. Quick when it is already done and unchanged. */
  function card(c) {
    const slug = slugOf(c);
    if (!slug) return;
    const body = c.firstElementChild;
    const title = c.querySelector('[class*="CourseCard_courseTitle"]');
    if (!body || !title) return;
    const grade = gradeOf(slug);
    const bhGrade = !!c.querySelector('.better-halo-grade-indicator');
    c.setAttribute('data-hp-card', '');
    // The grade at the top right of Halo's header row, beside the Topic chip (none when Better Halo shows its own).
    const head = (c.querySelector('[class*="CourseCard_headerItem"]') || {}).parentElement;
    let g = c.querySelector('[data-haloplus="card-grade"]');
    if (head && grade && !bhGrade) {
      if (!g) {
        g = document.createElement('span');
        g.setAttribute('data-haloplus', 'card-grade');
        head.appendChild(g);
      }
      const [letter, pct] = grade.includes(' ') ? grade.split(' ') : ['', grade];
      const html = `${letter ? `<b>${O.esc(letter)}</b>` : ''}<span>${O.esc(pct)}</span>`;
      if (g.dataset.html !== html) {
        g.innerHTML = html;
        g.dataset.html = html;
        g.title = 'The class grade, as Halo’s gradebook has it (Added by Halo+)';
      }
    } else if (g) g.remove();
    // Halo's dates, instructor and class size on one quiet line (Halo's own elements stay, hidden; the roster still
    // opens from "28 students").
    const parts = [...c.querySelectorAll('[class*="CourseCard_metaContainer"], [class*="CourseCard_metaItem"], [class*="CourseCard_studentsList"]')].filter((e) => !e.closest('[data-haloplus]') && !e.parentElement.closest('[class*="CourseCard_metaContainer"]'));
    const roster = c.querySelector('[class*="CourseCard_studentsList"] button');
    const dhtml = parts
      .map((e) => (e.matches('[class*="CourseCard_studentsList"]') && roster ? `<button type="button" data-roster>${O.esc(textOf(e))}</button>` : `<span>${O.esc(textOf(e))}</span>`))
      .filter((x) => !/<span><\/span>/.test(x))
      .join('<i>·</i>');
    let d = c.querySelector('[data-haloplus="card-details"]');
    if (!d) {
      d = document.createElement('div');
      d.setAttribute('data-haloplus', 'card-details');
      d.addEventListener('click', (e) => {
        if (!e.target.closest('[data-roster]')) return;
        const b = c.querySelector('[class*="CourseCard_studentsList"] button');
        if (b) b.click();
      });
    }
    if (title.nextElementSibling !== d) title.after(d);
    if (d.dataset.html !== dhtml) {
      d.innerHTML = dhtml;
      d.dataset.html = dhtml;
    }
    // NEXT: only with Halo's answer for the class.
    const list = nextFor(slug);
    let n = c.querySelector('[data-haloplus="card-next"]');
    if (!list) {
      if (n) n.remove();
      return;
    }
    if (!n) {
      n = document.createElement('div');
      n.setAttribute('data-haloplus', 'card-next');
    }
    if (d.nextElementSibling !== n) d.after(n);
    const col = colorOf(c, slug);
    if (n.dataset.col !== col) {
      n.style.setProperty('--c', col);
      n.dataset.col = col;
    }
    if (n.dataset.playing) return;
    const just = justFor(slug, lastK);
    let html = nextHtml(list);
    if (just.length) html = html.replace(/^(<small>[\s\S]*?<\/small>)/, `$1${justHtml(just)}`);
    if (n.dataset.html !== html) {
      n.innerHTML = html;
      n.dataset.html = html;
    }
    if (just.length) playJust(c, n);
  }
  function all() {
    if (!on || O.route().kind !== 'home') return;
    if (!ROOT.hasAttribute('data-hp-cards')) ROOT.setAttribute('data-hp-cards', '');
    for (const c of cardsNow()) card(c);
    void ask();
  }
  /** Halo's answer for every class (the calendar's question, shared and kept ten minutes), then the boxes. */
  async function ask() {
    if (asking || !O.cal) return;
    const idx = O.st.haloIndex;
    if (!idx || !Array.isArray(idx.classes) || !idx.classes.length) return;
    asking = true;
    try {
      const g = await O.cal.refresh(idx);
      if (g !== grades) {
        grades = g;
        for (const c of cardsNow()) card(c);
      }
    } finally {
      asking = false;
    }
  }
  function clear() {
    ROOT.removeAttribute('data-hp-cards');
    document.querySelectorAll('[data-haloplus="card-grade"], [data-haloplus="card-details"], [data-haloplus="card-next"]').forEach((n) => n.remove());
    document.querySelectorAll('[data-hp-card]').forEach((n) => n.removeAttribute('data-hp-card'));
  }
  // Halo redraws Student Home without a reload: the cards are redone before the browser paints, only when one is new.
  const watch = new MutationObserver(() => {
    if (!on || O.route().kind !== 'home') return;
    if (cardsNow().some((c) => !c.hasAttribute('data-hp-card'))) all();
  });
  O.feature({
    id: 'homecards',
    // Running on every Halo page (it acts on Student Home only), so its mark on the page root stays while Halo moves
    // between pages and Student Home comes back already in place.

    start() {
      on = true;
      watch.observe(document.body, { childList: true, subtree: true });
      all();
    },
    update() {
      all();
    },
    stop() {
      on = false;
      watch.disconnect();
      clear();
    },
  });
})();
