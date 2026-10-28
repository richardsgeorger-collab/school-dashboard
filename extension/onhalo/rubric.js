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
  /** Halo's list view of a rubric (its EmbeddedRubric component), in Halo's own utility classes. */
  function listHtml(rubric) {
    const crit = [...(rubric.criteria || [])].sort(bySeq);
    const total = round2(crit.reduce((n, c) => n + (Number(c.points) || 0), 0));
    return `${crit
      .map((c) => {
        const levels = [...(c.achievementLevels || [])].sort(bySeq).reverse();
        return `<div class="border-t border-grayE0 pt-3 mt-3"><div class="flex items-center justify-between"><h5 class="font-semibold text-sm">${esc(c.name || `Criteria ${c.sequence}`)}</h5><span class="text-secondary text-sm">${round2(c.points)} points</span></div>
<h6 class="font-semibold text-xs mt-2">Criteria Description</h6><p class="pt-1 pb-3 text-sm">${esc(c.description || '')}</p>${levels
          .map((l) => `<div class="pb-2"><div class="px-3 py-3 bg-grayF2 rounded"><div class="flex w-full"><h5 class="font-semibold flex-grow pb-2 text-sm">${esc(`${l.sequence}. ${l.name || ''}`)}</h5><span class="text-secondary text-sm">${round2(l.points)} points</span></div><p class="text-sm">${esc(l.description || '')}</p></div></div>`)
          .join('')}</div>`;
      })
      .join('')}<div class="pt-3 mt-1" data-testid="hp-rubric-total"><span class="font-semibold mr-2 text-sm">Total</span><span class="text-secondary font-normal text-sm">${total} points</span></div>`;
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
      panel.remove();
      a.setAttribute('aria-expanded', 'false');
      return;
    }
    const href = a.href;
    const box = document.createElement('div');
    box.setAttribute('data-haloplus', 'rubric');
    box.className = 'px-5 py-3';
    box.innerHTML = '<p class="text-sm text-secondary">Loading the rubric from Halo…</p>';
    row.after(box);
    a.setAttribute('aria-expanded', 'true');
    const r = await within(load(id), WAIT_MS);
    if (!box.isConnected) return;
    if (r) {
      box.innerHTML = `<div class="flex items-center justify-between"><h4 class="text-base font-semibold">Rubric Criteria</h4><span class="text-secondary text-sm">${O.mark()}</span></div>${listHtml(r)}`;
      O.count('rubric-open');
      return;
    }
    // Halo did not send it: Halo's own rubric page, as before.
    box.remove();
    a.setAttribute('aria-expanded', 'false');
    const w = window.open(href, '_blank');
    if (!w) {
      const note = document.createElement('div');
      note.setAttribute('data-haloplus', 'rubric');
      note.className = 'px-5 py-3 text-sm text-secondary';
      note.innerHTML = `Halo did not send the rubric here. <a class="text-blue" href="${esc(href)}" target="_blank" rel="noopener">Open Halo’s rubric</a>`;
      row.after(note);
    }
  }
  O.feature({
    id: 'rubric',
    routes: ['unit', 'syllabus'],
    start() {
      document.addEventListener('click', onClick, true);
      document.addEventListener('pointerover', onOver, true);
      document.addEventListener('focusin', onOver, true);
    },
    stop() {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('focusin', onOver, true);
      document.querySelectorAll('[data-haloplus="rubric"]').forEach((n) => n.remove());
      document.querySelectorAll('a[data-testid="print_rubric_link"][aria-expanded]').forEach((a) => a.removeAttribute('aria-expanded'));
    },
  });
  O.rubricHtml = listHtml;
})();
