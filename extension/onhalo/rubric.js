// Feature 21: the rubric on the page. Halo's "View Rubric" (in a card's Start Date / Due Date / Points / Rubric row) opens
// the rubric in a new tab (research 2026-10-27). 0.12.1 (George: the folded "Rubric" at the bottom of the card was too
// easy to miss): Halo's own link now opens the rubric right below that row, and a second click closes it. The content is
// Halo's rubric as its rubric page lists it (Halo's AssessmentRubric query, the list view): the criteria in order with
// their points and description, the levels from the top down, the total. Asked of Halo when the student points at the
// link, so it opens at once. A click with Ctrl, ⌘, Shift or the middle button is Halo's as before (a new tab); if Halo
// does not send the rubric, Halo's own rubric page opens as it always did.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const Q = 'query AssessmentRubric($assessmentId:String!){assessmentRubric:getCourseClassAssessmentById(id:$assessmentId){...AssessmentRubric_assessmentRubric}}fragment AssessmentRubric_assessmentRubric on CourseClassAssessment{id title description points rubric{...AssessmentRubric_assessmentRubric_rubric}}fragment AssessmentRubric_assessmentRubric_rubric on Rubric{id name id criteria{...AssessmentRubric_assessmentRubric_rubric_criteria}}fragment AssessmentRubric_assessmentRubric_rubric_criteria on RubricCriterion{id name description points sequence achievementLevels{...AssessmentRubric_assessmentRubric_rubric_criteria_achievementLevels}}fragment AssessmentRubric_assessmentRubric_rubric_criteria_achievementLevels on RubricAchievementLevel{cellId description name points sequence value}';
  const esc = O.esc;
  // Halo's own expand chevron (MUI ChevronRight), turned down when open.
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path></svg>';
  O.CHEVRON = CHEVRON;
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const bySeq = (a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0);
  const critName = (c) => c.name || `Criteria ${c.sequence}`;
  const levelsOf = (c) => [...(c.achievementLevels || [])].sort(bySeq).reverse();
  const totalOf = (crit) => round2(crit.reduce((n, c) => n + (Number(c.points) || 0), 0));
  /** One criterion as Halo's list view shows it (its EmbeddedRubric component), in Halo's own utility classes. */
  function fullCrit(c) {
    return `<h6 class="font-semibold text-xs mt-2">Criteria Description</h6><p class="pt-1 pb-3 text-sm">${esc(c.description || '')}</p>${levelsOf(c)
      .map((l) => `<div class="pb-2"><div class="px-3 py-3 bg-grayF2 rounded"><div class="flex w-full"><h5 class="font-semibold flex-grow pb-2 text-sm">${esc(`${l.sequence}. ${l.name || ''}`)}</h5><span class="text-secondary text-sm">${round2(l.points)} points</span></div><p class="text-sm">${esc(l.description || '')}</p></div></div>`)
      .join('')}`;
  }
  /** Halo's whole list view of a rubric. */
  function listHtml(rubric) {
    const crit = [...(rubric.criteria || [])].sort(bySeq);
    return `${crit.map((c) => `<div class="border-t border-grayE0 pt-3 mt-3"><div class="flex items-center justify-between"><h5 class="font-semibold text-sm">${esc(critName(c))}</h5><span class="text-secondary text-sm">${round2(c.points)} points</span></div>\n${fullCrit(c)}</div>`).join('')}<div class="pt-3 mt-1" data-testid="hp-rubric-total"><span class="font-semibold mr-2 text-sm">Total</span><span class="text-secondary font-normal text-sm">${totalOf(crit)} points</span></div>`;
  }
  /**
   * The short view (0.12.2, George: "it works but it's super long"): the total at the top, each criterion on one line
   * with its points and only its top level's description; "Show all levels" opens that criterion as Halo lists it, and
   * "Show everything" opens them all (then it is Halo's whole list, word for word, with Halo's Total under it).
   */
  function shortHtml(rubric) {
    const crit = [...(rubric.criteria || [])].sort(bySeq);
    const btn = 'class="hp-rb text-xs" type="button"';
    return `<div class="flex items-center flex-wrap" style="gap:4px 14px"><h4 class="text-base font-semibold" data-testid="hp-rubric-head">Rubric · ${totalOf(crit)} pts</h4><span style="flex:1"></span><button ${btn} data-all aria-pressed="false">Show everything</button><button ${btn} data-print>Open in new tab</button><button ${btn} data-hide>Hide</button><span class="text-secondary text-sm">${O.mark()}</span></div>${crit
      .map((c) => {
        const top = levelsOf(c)[0];
        return `<div class="hp-crit border-t border-grayE0 pt-3 mt-3"><div class="flex items-baseline justify-between" style="gap:12px"><h5 class="font-semibold text-sm" data-testid="hp-crit-line">${esc(critName(c))} · ${round2(c.points)} pts</h5><button ${btn} data-levels aria-expanded="false">Show all levels</button></div>${top ? `<p class="hp-top text-sm pt-1"><span class="text-secondary">${esc(`${top.sequence}. ${top.name || ''}`)}:</span> ${esc(top.description || '')}</p>` : ''}<div class="hp-full" hidden>${fullCrit(c)}</div></div>`;
      })
      .join('')}<div class="pt-3 mt-1 hp-total" hidden data-testid="hp-rubric-total"><span class="font-semibold mr-2 text-sm">Total</span><span class="text-secondary font-normal text-sm">${totalOf(crit)} points</span></div>`;
  }
  /** Open one criterion's levels, or all of them. */
  function showLevels(crit, on) {
    crit.querySelector('.hp-full').hidden = !on;
    const top = crit.querySelector('.hp-top');
    if (top) top.hidden = on;
    const b = crit.querySelector('[data-levels]');
    b.setAttribute('aria-expanded', String(on));
    b.textContent = on ? 'Show fewer' : 'Show all levels';
  }
  function bindShort(box) {
    box.addEventListener('click', (e) => {
      const lv = e.target.closest('[data-levels]');
      if (lv) return showLevels(lv.closest('.hp-crit'), lv.getAttribute('aria-expanded') !== 'true');
      const all = e.target.closest('[data-all]');
      if (all) {
        const on = all.getAttribute('aria-pressed') !== 'true';
        all.setAttribute('aria-pressed', String(on));
        all.textContent = on ? 'Show less' : 'Show everything';
        box.querySelectorAll('.hp-crit').forEach((c) => showLevels(c, on));
        box.querySelector('.hp-total').hidden = !on;
        return undefined;
      }
      const pr = e.target.closest('[data-print]');
      if (pr) return printable(box);
      if (e.target.closest('[data-hide]')) return closeBox(box);
      return undefined;
    });
  }
  // ---- the printable page ("Open in new tab") ---------------------------------------------------------------------------
  /**
   * The whole rubric as a clean page of its own, to print or save as a PDF: the assignment, its class, its due date as
   * Halo shows it, the total, then every criterion with its description and every level, word for word from Halo. Made
   * here (a page in this browser, nothing sent anywhere), with no script in it.
   */
  function printableHtml({ title, cls, due, rubric }) {
    const crit = [...(rubric.criteria || [])].sort(bySeq);
    const css = `body{font:14px/1.5 "Open Sans",Arial,sans-serif;color:#212121;margin:32px auto;max-width:860px;padding:0 24px}h1{font-size:22px;margin:0 0 4px}.meta{color:#616161;margin:0 0 4px}.how{color:#616161;font-size:12px;margin:12px 0 24px}.c{border-top:1px solid #e0e0e0;padding:14px 0 6px;break-inside:avoid}.c h2{font-size:15px;margin:0;display:flex;justify-content:space-between;gap:16px}.d{margin:6px 0 10px}.l{background:#f5f5f5;border-radius:4px;padding:8px 12px;margin:0 0 6px}.l b{display:flex;justify-content:space-between;gap:16px}.l p{margin:4px 0 0}.t{border-top:2px solid #212121;padding-top:10px;font-weight:600}@media print{body{margin:0;max-width:none}.how{display:none}.l{background:none;border:1px solid #ddd}}`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} - Rubric</title><style>${css}</style></head><body><h1>${esc(title)} - Rubric</h1>${cls ? `<p class="meta">${esc(cls)}</p>` : ''}${due ? `<p class="meta">Due ${esc(due)}</p>` : ''}<p class="meta">Total ${totalOf(crit)} points</p><p class="how">To print it or save it as a PDF: Ctrl+P (⌘P on a Mac). From Halo, by Halo+.</p>${crit
      .map((c) => `<div class="c"><h2><span>${esc(critName(c))}</span><span>${round2(c.points)} points</span></h2><p class="d">${esc(c.description || '')}</p>${levelsOf(c).map((l) => `<div class="l"><b><span>${esc(`${l.sequence}. ${l.name || ''}`)}</span><span>${round2(l.points)} points</span></b><p>${esc(l.description || '')}</p></div>`).join('')}</div>`)
      .join('')}<p class="t">Total ${totalOf(crit)} points</p></body></html>`;
  }
  function printable(box) {
    const d = box.__hpRubric;
    if (!d) return;
    const url = URL.createObjectURL(new Blob([printableHtml(d)], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    // The browser kept the new tab from opening: Halo's own rubric page instead.
    if (!w) window.open(d.href, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    O.count('rubric-open', false);
  }
  const WAIT_MS = 3000;
  const idOf = (a) => {
    const m = /\/rubrics\/([^/?#]+)/.exec(a.getAttribute('href') || '');
    return m ? decodeURIComponent(m[1]) : null;
  };
  const loads = new Map();
  /** Halo's rubric for one assessment, once (kept ten minutes): the rubric, or null when Halo does not send one. */
  function load(id) {
    if (!loads.has(id))
      loads.set(
        id,
        O.ask('AssessmentRubric', Q, { assessmentId: id }, 10 * 60_000)
          .then((d) => {
            const r = d && d.assessmentRubric && d.assessmentRubric.rubric;
            return r && Array.isArray(r.criteria) && r.criteria.length ? r : null;
          })
          .catch(() => null)
          .then((r) => {
            if (!r) loads.delete(id);
            return r;
          }),
      );
    return loads.get(id);
  }
  const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  /** Close an open rubric: Halo's link reads "View Rubric" again. */
  function closeBox(box) {
    const link = box.__hpLink;
    box.remove();
    if (link) {
      link.setAttribute('aria-expanded', 'false');
      link.removeAttribute('data-hp-open');
      link.removeAttribute('aria-label');
    }
  }
  function panelFor(a) {
    const row = a.closest('.bg-grayF2') || a.closest('[class*="flex-wrap"]');
    const next = row && row.nextElementSibling;
    return { row, panel: next && next.getAttribute('data-haloplus') === 'rubric' ? next : null };
  }
  function onOver(e) {
    const a = e.target && e.target.closest && e.target.closest('a[data-testid="print_rubric_link"]');
    if (!a || !O.enabled('rubric')) return;
    const id = idOf(a);
    if (id) void load(id);
  }
  async function onClick(e) {
    const a = e.target && e.target.closest && e.target.closest('a[data-testid="print_rubric_link"]');
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !O.enabled('rubric')) return;
    const id = idOf(a);
    const { row, panel } = panelFor(a);
    if (!id || !row) return;
    e.preventDefault();
    e.stopPropagation();
    if (panel) {
      panel.__hpLink = a;
      closeBox(panel);
      return;
    }
    const href = a.href;
    const box = document.createElement('div');
    box.setAttribute('data-haloplus', 'rubric');
    box.className = 'hp-rbox';
    box.__hpLink = a;
    box.innerHTML = '<p class="text-sm text-secondary">Loading the rubric from Halo…</p>';
    row.after(box);
    a.setAttribute('aria-expanded', 'true');
    a.setAttribute('data-hp-open', '');
    a.setAttribute('aria-label', 'Hide Rubric');
    const r = await within(load(id), WAIT_MS);
    if (!box.isConnected) return;
    if (r) {
      // What the printable page says beside the rubric: the assignment, its class, its due date as Halo shows it.
      const card = a.closest('[data-testid="assessment_card"]');
      const titleEl = card && card.querySelector('[data-testid="assessment_title"]');
      const dueEl = card && card.querySelector('[data-testid="date_time_data_due_date"]');
      const idx = O.st.haloIndex;
      const k = idx && Array.isArray(idx.classes) ? idx.classes.find((c) => c.slug === O.route().slug) : null;
      box.__hpRubric = { title: (titleEl && titleEl.textContent.trim()) || 'Assignment', cls: k ? `${k.code || k.cc}${k.name ? ` · ${k.name}` : ''}` : '', due: dueEl ? (dueEl.childNodes.length ? [...dueEl.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim() || dueEl.textContent.trim() : '') : '', rubric: r, href };
      box.innerHTML = shortHtml(r);
      bindShort(box);
      O.count('rubric-open');
      return;
    }
    // Halo did not send it: Halo's own rubric page, as before.
    closeBox(box);
    const w = window.open(href, '_blank');
    if (!w) {
      const note = document.createElement('div');
      note.setAttribute('data-haloplus', 'rubric');
      note.className = 'px-5 py-3 text-sm text-secondary';
      note.innerHTML = `Halo did not send the rubric here. <a class="text-blue" href="${esc(href)}" target="_blank" rel="noopener">Open Halo’s rubric</a>`;
      row.after(note);
    }
  }
  // 0.12.4 (George): the Halo+ mark right after Halo's own View Rubric / Hide Rubric, so it is clear the rubric that
  // opens there is Halo+'s.
  function marks() {
    for (const a of document.querySelectorAll('a[data-testid="print_rubric_link"]')) {
      const n = a.nextElementSibling;
      if (n && n.getAttribute('data-haloplus') === 'rubric-mark') continue;
      const m = document.createElement('span');
      m.setAttribute('data-haloplus', 'rubric-mark');
      m.style.cssText = 'margin-left:5px;font-size:0.875rem;color:var(--hp-text-2)';
      m.innerHTML = O.mark();
      a.after(m);
    }
  }
  O.feature({
    id: 'rubric',
    routes: ['unit', 'syllabus'],
    start() {
      document.addEventListener('click', onClick, true);
      document.addEventListener('pointerover', onOver, true);
      document.addEventListener('focusin', onOver, true);
      marks();
    },
    update() {
      marks();
    },
    stop() {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('focusin', onOver, true);
      document.querySelectorAll('[data-haloplus="rubric"], [data-haloplus="rubric-mark"]').forEach((n) => n.remove());
      document.querySelectorAll('a[data-testid="print_rubric_link"][aria-expanded]').forEach((a) => {
        a.removeAttribute('aria-expanded');
        a.removeAttribute('data-hp-open');
        a.removeAttribute('aria-label');
      });
    },
  });
  O.rubricHtml = listHtml;
  O.rubricPrintable = printableHtml;
})();
